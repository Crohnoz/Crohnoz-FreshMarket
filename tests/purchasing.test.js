import test from "node:test";
import assert from "node:assert/strict";
import { buildPriceDecision, calculateUnitCost, grossMarginPercent, purchaseTotal, suggestedSellingPrice } from "../assets/js/domain/purchasing.js";

test("calcula costo unitario y compra", () => {
  assert.equal(calculateUnitCost(50000, 25), 2000);
  assert.equal(purchaseTotal([{ quantity: 5, unitCost: 1000 }, { quantity: 2, unitCost: 2500 }]), 10000);
});

test("sugiere precio protegiendo margen y merma", () => {
  assert.equal(suggestedSellingPrice({ unitCost: 1000, targetMarginPercent: 30, expectedWastePercent: 10, roundTo: 10 }), 1590);
  assert.equal(grossMarginPercent(2000, 1000), 50);
  assert.equal(buildPriceDecision({ currentPrice: 1400, unitCost: 1000, targetMarginPercent: 30, expectedWastePercent: 10 }).action, "raise");
});
