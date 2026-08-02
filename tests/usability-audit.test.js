import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("base loads the shared usability layer after hardening", async () => {
  const base = await text("assets/css/base.css");
  const hardeningIndex = base.indexOf('./hardening.css');
  const auditIndex = base.indexOf('./usability-audit.css');
  assert.ok(hardeningIndex >= 0);
  assert.ok(auditIndex > hardeningIndex);
});

test("inventory cards constrain imagery and preserve readable content", async () => {
  const css = await text("assets/css/usability-audit.css");
  const app = await text("assets/js/inventory/app.js");
  assert.match(css, /\.inventory-lots \{ grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(css, /\.inventory-lot-image \{[^}]*width: 132px;[^}]*height: 132px/s);
  assert.match(css, /\.inventory-lot dl \{ grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(app, /image\.style\.objectPosition/);
  assert.match(app, /image\.addEventListener\("error"/);
  assert.match(app, /quantity\.max = String\(remaining\)/);
  assert.match(app, /No encontramos lotes con esos filtros/);
});

test("storefront search is accent-insensitive and customer name is required", async () => {
  const app = await text("assets/js/store/app.js");
  const html = await text("index.html");
  assert.match(app, /normalize\("NFD"\)/);
  assert.match(app, /aria-pressed/);
  assert.match(app, /Escribe el nombre para preparar el pedido/);
  assert.match(app, /event\.key === "Escape"/);
  assert.match(html, /id="customer-name"[^>]*required/);
  assert.match(html, /href="operar\.html">Área del negocio/);
});

test("assistant does not expose raw proposal JSON and requires payment medium", async () => {
  const app = await text("assets/js/assistant/app.js");
  assert.doesNotMatch(app, /JSON\.stringify\(proposal\.data\)/);
  assert.match(app, /Medio del abono/);
  assert.match(app, /Aprobar y registrar/);
  assert.match(app, /Debes elegir si el abono fue en efectivo o transferencia/);
});

test("validation distinguishes essential and optional capabilities", async () => {
  const domain = await text("assets/js/domain/pilot-validation.js");
  const app = await text("assets/js/validation/app.js");
  assert.match(domain, /REQUIRED_FEATURE_IDS/);
  assert.match(domain, /advisoryFailed/);
  assert.match(app, /Esencial/);
  assert.match(app, /Opcional/);
  assert.doesNotMatch(app, /innerHTML = `<strong>\$\{readiness\.status\}/);
});

test("offline page avoids inline scripts and caches the audited application shell", async () => {
  const offline = await text("offline.html");
  const worker = await text("sw.js");
  assert.doesNotMatch(offline, /onclick=/);
  assert.match(offline, /href="\/inventario"/);
  assert.match(worker, /crohnoz-fresh-market-v\d+/);
  assert.match(worker, /"\/index\.html"/);
  assert.match(worker, /"\/assets\/js\/inventory\/app\.js"/);
});
