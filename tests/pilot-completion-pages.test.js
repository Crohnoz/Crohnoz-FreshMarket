import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("offline hardening registers service worker and safe fallback", async () => {
  const hardening = await text("assets/js/core/hardening.js");
  const config = await text("assets/js/core/config.js");
  const worker = await text("sw.js");
  assert.match(config, /import\(["']\.\/hardening\.js["']\)/);
  assert.match(hardening, /serviceWorker\.register\(["']\/sw\.js["']\)/);
  assert.match(worker, /offline\.html/);
  assert.match(worker, /request\.mode === "navigate"/);
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
