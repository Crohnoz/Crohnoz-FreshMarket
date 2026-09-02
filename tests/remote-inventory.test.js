import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createRemoteMovementPayload,
  createRemoteReceptionPayload,
  normalizeRemoteLot,
  normalizeRemoteMovement,
  remoteLotRisk,
  remoteMovementLabel,
} from "../assets/js/domain/remote-inventory.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("remote lots and reception payloads normalize safely", () => {
  const lot = normalizeRemoteLot({
    id: "lot-1",
    product: "product-1",
    product_name: "Palta",
    product_sale_unit: "kg",
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
  assert.equal(lot.productSaleUnit, "kg");
  const payload = createRemoteReceptionPayload({
    productId: "product-1",
    productSaleUnit: "kg",
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
  assert.throws(() => createRemoteReceptionPayload({
    productId: "product-1",
    productSaleUnit: "unit",
    receivedAt: "2026-08-10",
    quantity: 1.5,
    unitCost: 1,
  }), /número entero/);
});

test("remote inventory movements validate balance, unit and adjustment rules", () => {
  const lot = {
    id: "lot-1",
    version: 3,
    productSaleUnit: "kg",
    quantityReceived: 12.5,
    quantityAvailable: 8.25,
  };
  const consumption = createRemoteMovementPayload({
    lot,
    movementType: "consumption",
    quantity: "1.250",
    reason: "Pedido preparado",
    reference: "FM-001",
  });
  assert.deepEqual(consumption, {
    lot: "lot-1",
    movement_type: "consumption",
    quantity: 1.25,
    reason: "Pedido preparado",
    reference: "FM-001",
  });
  const adjustment = createRemoteMovementPayload({
    lot,
    movementType: "adjustment",
    quantity: "7.500",
    reason: "Conteo físico",
  });
  assert.equal(adjustment.quantity_available, 7.5);
  assert.equal(adjustment.quantity, undefined);
  assert.throws(() => createRemoteMovementPayload({
    lot,
    movementType: "waste",
    quantity: 9,
    reason: "Merma",
  }), /saldo disponible/);
  assert.throws(() => createRemoteMovementPayload({
    lot: { ...lot, productSaleUnit: "unit" },
    movementType: "supplier_return",
    quantity: 1.5,
    reason: "Devolución",
  }), /número entero/);
  assert.throws(() => createRemoteMovementPayload({
    lot,
    movementType: "adjustment",
    quantity: 13,
    reason: "Conteo",
  }), /originalmente recibido/);
});

test("remote movement history normalizes immutable balance evidence", () => {
  const movement = normalizeRemoteMovement({
    id: "movement-1",
    lot: "lot-1",
    product: "product-1",
    product_name: "Palta",
    product_sale_unit: "kg",
    movement_type: "waste",
    quantity_delta: "-0.750",
    quantity_before: "8.250",
    quantity_after: "7.500",
    reason: "Golpeada",
    reference: "MERMA-01",
    created_by: { username: "carmelo" },
    created_at: "2026-08-03T04:00:00Z",
    lot_version: 4,
  });
  assert.equal(movement.quantityDelta, -0.75);
  assert.equal(movement.quantityAfter, 7.5);
  assert.equal(movement.actor, "carmelo");
  assert.equal(remoteMovementLabel(movement.movementType), "Merma");
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
    "remote-lot-search", "refresh-remote-inventory", "remote-movement-form",
    "remote-movement-lot", "remote-movement-type", "remote-movement-quantity",
    "create-remote-movement", "remote-movements-body", "remote-movement-count",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /Los saldos no se editan ni se eliminan directamente/i);
  assert.match(repository, /inventory-lots\/receive/);
  assert.match(repository, /inventory-movements/);
  assert.match(repository, /If-Match/);
  assert.match(repository, /Idempotency-Key/);
  assert.doesNotMatch(repository, /localStorage|readStorage|writeStorage/);
  assert.doesNotMatch(app, /writeStorage|localStorage\.setItem/);
  assert.match(app, /La clave de reintento se conserva/);
  assert.match(app, /canAdjustInventory/);
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
  assert.match(worker, /crohnoz-fresh-market-v12/);
  assert.match(worker, /inventario-remoto\.html/);
  assert.match(worker, /assets\/css\/remote-inventory\.css/);
  assert.match(worker, /assets\/js\/remote-inventory\/app\.js/);
  assert.match(worker, /assets\/js\/domain\/remote-inventory\.js/);
  assert.match(netlify, /from = "\/inventario-remoto"[\s\S]*to = "\/inventario-remoto\.html"/);
  assert.match(tasks, /remote-inventory/);
  assert.match(tasks, /inventario-remoto\.html/);
});
