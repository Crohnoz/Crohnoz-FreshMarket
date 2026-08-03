import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeApiBaseUrl } from "../assets/js/core/connection.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("API base URL accepts HTTPS and local development only", () => {
  assert.equal(normalizeApiBaseUrl("https://api.example.cl/api/v1/"), "https://api.example.cl/api/v1");
  assert.equal(normalizeApiBaseUrl("http://localhost:8001/api/v1"), "http://localhost:8001/api/v1");
  assert.throws(() => normalizeApiBaseUrl("http://api.example.cl/api/v1"), /HTTPS/);
  assert.throws(() => normalizeApiBaseUrl("https://user:pass@api.example.cl/api/v1"), /credenciales/);
  assert.throws(() => normalizeApiBaseUrl("not-a-url"), /dirección API válida/);
});

test("connection workspace exposes guided endpoint, login, organization and session controls", async () => {
  const html = await text("conexion.html");
  for (const id of [
    "connection-config-form", "api-base-url", "test-api", "use-local-mode", "login-form",
    "organization-form", "organization-select", "session-card", "refresh-summary", "logout-api",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /autocomplete="username"/);
  assert.match(html, /autocomplete="current-password"/);
  assert.match(html, /La contraseña nunca se guarda/);
});

test("browser session uses sessionStorage and finite server expiry", async () => {
  const connection = await text("assets/js/core/connection.js");
  const authentication = await text("backend/market/authentication.py");
  const settings = await text("backend/config/settings.py");
  const views = await text("backend/market/views.py");
  assert.match(connection, /sessionStorage\.setItem/);
  assert.match(connection, /expiresAt/);
  assert.doesNotMatch(connection, /localStorage\.setItem\([^\n]*token/i);
  assert.match(authentication, /token\.created/);
  assert.match(authentication, /AuthenticationFailed/);
  assert.match(views, /Token\.objects\.filter\(user=user\)\.delete/);
  assert.match(settings, /PILOT_TOKEN_MAX_HOURS/);
  assert.match(settings, /PilotTokenAuthentication/);
});

test("connection state is mounted globally and remains explicit", async () => {
  const config = await text("assets/js/core/config.js");
  const shell = await text("assets/js/core/connection-shell.js");
  const guided = await text("assets/js/core/guided-shell.js");
  const tasks = await text("assets/js/domain/operator-tasks.js");
  assert.match(config, /connection-shell\.js/);
  assert.match(config, /0\.8\.0-pilot/);
  assert.match(shell, /Modo local/);
  assert.match(shell, /API configurada, sin sesión/);
  assert.match(shell, /sesión protegida en esta pestaña/);
  assert.match(guided, /guided-onboarding-v3/);
  assert.match(guided, /conexion\.html/);
  assert.match(tasks, /connect-backend/);
  assert.match(tasks, /remote-orders/);
  assert.match(tasks, /remote-inventory/);
  assert.match(tasks, /pedidos-remotos\.html/);
  assert.match(tasks, /inventario-remoto\.html/);
});

test("login API and pilot seed command avoid default credentials", async () => {
  const views = await text("backend/market/views.py");
  const urls = await text("backend/market/urls.py");
  const seed = await text("backend/market/management/commands/seed_pilot.py");
  assert.match(views, /class LoginView/);
  assert.match(views, /LoginRateThrottle/);
  assert.match(views, /expires_at/);
  assert.match(urls, /auth\/login\//);
  assert.match(urls, /connection-summary\//);
  assert.match(seed, /CAMILA_PILOT_PASSWORD/);
  assert.match(seed, /CARMELO_PILOT_PASSWORD/);
  assert.match(seed, /al menos 12 caracteres/);
  assert.doesNotMatch(seed, /password\s*=\s*["'](?:camila|carmelo|admin|123)/i);
});

test("connection assets pass syntax checks and are cached offline", async () => {
  for (const path of [
    "assets/js/core/config.js",
    "assets/js/core/connection.js",
    "assets/js/core/connection-shell.js",
    "assets/js/core/guided-shell.js",
    "assets/js/core/guided-shell-state.js",
    "assets/js/connection/app.js",
    "assets/js/remote-orders/app.js",
    "assets/js/remote-inventory/app.js",
    "sw.js",
  ]) execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);
  const worker = await text("sw.js");
  const netlify = await text("netlify.toml");
  assert.match(worker, /crohnoz-fresh-market-v10/);
  assert.match(worker, /conexion\.html/);
  assert.match(worker, /pedidos-remotos\.html/);
  assert.match(worker, /inventario-remoto\.html/);
  assert.match(worker, /assets\/js\/core\/connection\.js/);
  assert.match(worker, /assets\/css\/connection-shell\.css/);
  assert.match(netlify, /from = "\/conexion"/);
  assert.match(netlify, /from = "\/pedidos-remotos"/);
  assert.match(netlify, /from = "\/inventario-remoto"/);
  assert.match(netlify, /connect-src 'self' https:/);
  assert.match(netlify, /http:\/\/localhost:8001/);
  assert.doesNotMatch(netlify, /localhost:\*/);
});
