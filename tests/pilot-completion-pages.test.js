import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
async function text(path) { return readFile(new URL(`../${path}`, import.meta.url), "utf8"); }

test("five completion blocks expose their main regions", async () => {
  const pages = {
    "inventario.html": ["inventory-lots", "receive-lot-form", "inventory-recommendations"],
    "compras.html": ["purchase-form", "purchase-suggested-price", "purchase-history"],
    "ventas.html": ["sales-orders", "order-payment-form", "receipt-preview"],
    "asistente.html": ["assistant-question-form", "assistant-import-form", "assistant-proposals"],
    "validacion.html": ["validation-features", "validation-scenarios", "validation-form"],
  };
  for (const [path, ids] of Object.entries(pages)) {
    const html = await text(path);
    for (const id of ids) assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("application scripts pass syntax validation", () => {
  for (const path of [
    "assets/js/store/app.js",
    "assets/js/operator/home.js",
    "assets/js/admin/dashboard.js",
    "assets/js/inventory/app.js",
    "assets/js/purchasing/app.js",
    "assets/js/sales/app.js",
    "assets/js/assistant/app.js",
    "assets/js/validation/app.js",
    "assets/js/close/app.js",
    "assets/js/core/guided-shell-state.js",
    "assets/js/core/hardening.js",
    "sw.js",
  ]) {
    execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);
  }
});

test("offline hardening registers service worker and exposes controlled updates", async () => {
  const hardening = await text("assets/js/core/hardening.js");
  const config = await text("assets/js/core/config.js");
  const worker = await text("sw.js");
  assert.match(config, /import\(["']\.\/hardening\.js["']\)/);
  assert.match(hardening, /serviceWorker\.register\(["']\/sw\.js["']/);
  assert.match(hardening, /updateViaCache: ["']none["']/);
  assert.match(worker, /offline\.html/);
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /SKIP_WAITING/);
  assert.match(worker, /assets\/css\/usability-audit\.css/);
  assert.match(worker, /assets\/js\/store\/app\.js/);
});

test("manifest starts in operator mode", async () => {
  const manifest = JSON.parse(await text("manifest.webmanifest"));
  assert.equal(manifest.start_url, "/operar");
  assert.equal(manifest.display, "standalone");
});

test("Netlify exposes all completion routes and worker policy", async () => {
  const netlify = await text("netlify.toml");
  for (const route of ["inventario", "compras", "ventas", "asistente", "validacion"]) {
    assert.match(netlify, new RegExp(`from = "\\/${route}"\\s+to = "\\/${route}\\.html"`));
  }
  assert.match(netlify, /worker-src 'self'/);
  assert.match(netlify, /manifest-src 'self'/);
});
