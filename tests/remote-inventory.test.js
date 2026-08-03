import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createRemoteReceptionPayload,
  normalizeRemoteLot,
  remoteLotRisk,
} from "../assets/js/domain/remote-inventory.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("remote lots and reception payloads normalize safely", () => {
  const lot = normalizeRemoteLot({
    id: "lot-1",
    product: "product-1",
    product_name: "Palta",
    received_at: "2026-08-02",
    best_before: "2026-08-08",
    quantity_received: "12.500",
    quantity_available: "12.500",
    unit_cost: "2100.00",
    quality: "good",
    status: "active",
    version: 1,
  });
  assert.equal(lot.quantityReceived, 12.5);
  assert.equal(lot.quantityAvailable, 12.5);
  assert.equal(lot.unitCost, 2100);
  const payload = createRemoteReceptionPayload({
    productId: "product-1",
    receivedAt: "2026-08-02",
    bestBefore: "2026-08-08",
    quantity: "12.500",
    unitCost: "2100",
    quality: "good",
    notes: "Proveedor piloto",
  });
  assert.equal(payload.quantity_received, 12.5);
  assert.equal(payload.best_before, "2026-08-08");
  assert.throws(() => createRemoteReceptionPayload({
    productId: "product-1",
    receivedAt: "2026-08-10",
    bestBefore: "2026-08-09",
    quantity: 1,
    unitCost: 1,
  }), /anterior a la recepción/);
  assert.throws(() => createRemoteReceptionPayload({
    productId: "product-1",
    receivedAt: "2026-08-10",
    quantity: 0,
    unitCost: 1,
  }), /mayor que cero/);
});

test("remote lot risk prioritizes damaged and near-date lots", () => {
  const today = new Date(2026, 7, 2, 12, 0, 0);
  assert.equal(remoteLotRisk({ status: "active", quality: "damaged", bestBefore: "2026-08-20" }, today).level, "danger");
  assert.equal(remoteLotRisk({ status: "active", quality: "good", bestBefore: "2026-08-02" }, today).label, "Vence hoy");
  assert.equal(remoteLotRisk({ status: "active", quality: "good", bestBefore: "2026-08-06" }, today).level, "warning");
  assert.equal(remoteLotRisk({ status: "active", quality: "good", bestBefore: "2026-08-20" }, today).level, "success");
});

test("remote inventory page is explicit, resumable and never writes local business data", async () => {
  const html = await text("inventario-remoto.html");
  const app = await text("assets/js/remote-inventory/app.js");
  const repository = await text("assets/js/repositories/api-market.js");
  const state = await text("assets/js/core/guided-shell-state.js");
  for (const id of [
    "remote-inventory-blocker", "remote-inventory-workspace", "remote-reception-form",
    "remote-reception-product", "create-remote-reception", "remote-lots-body",
    "remote-lot-search", "refresh-remote-inventory",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /Los lotes no se editan ni se eliminan directamente/i);
  assert.match(repository, /inventory-lots\/receive/);
  assert.match(repository, /Idempotency-Key/);
  assert.doesNotMatch(repository, /localStorage|readStorage|writeStorage/);
  assert.doesNotMatch(app, /writeStorage|localStorage\.setItem/);
  assert.match(app, /La clave de reintento se conserva/);
  assert.match(state, /inventario-remoto/);
});

test("remote inventory assets, route and cache are wired", async () => {
  for (const path of [
    "assets/js/domain/remote-inventory.js",
    "assets/js/remote-inventory/app.js",
    "assets/js/repositories/api-market.js",
  ]) execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);
  const worker = await text("sw.js");
  const netlify = await text("netlify.toml");
  const tasks = await text("assets/js/domain/operator-tasks.js");
  assert.match(worker, /crohnoz-fresh-market-v10/);
  assert.match(worker, /inventario-remoto\.html/);
  assert.match(worker, /assets\/css\/remote-inventory\.css/);
  assert.match(worker, /assets\/js\/remote-inventory\/app\.js/);
  assert.match(worker, /assets\/js\/domain\/remote-inventory\.js/);
  assert.match(netlify, /from = "\/inventario-remoto"[\s\S]*to = "\/inventario-remoto\.html"/);
  assert.match(tasks, /remote-inventory/);
  assert.match(tasks, /inventario-remoto\.html/);
});
