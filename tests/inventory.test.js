import test from "node:test";
import assert from "node:assert/strict";
import { applyLotMovement, createInventoryLot, inventorySummary, lotRemaining, lotRisk, recommendFEFO } from "../assets/js/domain/inventory.js";

const today = "2026-08-02";
const lots = [
  { id: "a", productId: "tomato", productName: "Tomate", unit: "kg", receivedQuantity: 10, soldQuantity: 2, wasteQuantity: 1, unitCost: 1000, bestBeforeDate: "2026-08-03", condition: "ripe", ripeness: 4, receivedAt: "2026-08-01" },
  { id: "b", productId: "tomato", productName: "Tomate", unit: "kg", receivedQuantity: 8, soldQuantity: 0, wasteQuantity: 0, unitCost: 900, bestBeforeDate: "2026-08-09", condition: "good", ripeness: 2, receivedAt: "2026-08-02" },
];

test("calcula saldo y movimiento de lote", () => {
  assert.equal(lotRemaining(lots[0]), 7);
  assert.equal(lotRemaining(applyLotMovement(lots[0], { type: "sale", quantity: 2 })), 5);
});

test("prioriza FEFO y riesgo", () => {
  assert.equal(lotRisk(lots[0], today).level, "critical");
  assert.equal(recommendFEFO(lots, "tomato", today)[0].id, "a");
});

test("resume valor de inventario en riesgo", () => {
  const summary = inventorySummary(lots, today);
  assert.equal(summary.activeLots, 2);
  assert.equal(summary.criticalLots, 1);
  assert.equal(summary.atRiskValue, 7000);
});

test("valida creación de lote", () => {
  const lot = createInventoryLot({ productId: "banana", productName: "Plátano", receivedQuantity: 5, unitCost: 900, receivedAt: today });
  assert.equal(lot.receivedQuantity, 5);
  assert.throws(() => createInventoryLot({ productId: "x", receivedQuantity: 0, unitCost: 1, receivedAt: today }));
});
