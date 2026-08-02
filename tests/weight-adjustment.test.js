import test from "node:test";
import assert from "node:assert/strict";
import { calculateWeightAdjustment } from "../assets/js/domain/weight-adjustment.js";

test("1 kg a 1.04 kg se acepta con tolerancia de 5% y monto autorizado", () => {
  const result = calculateWeightAdjustment({ requestedQuantity: 1, actualQuantity: 1.04, pricePerBaseUnit: 2000, tolerancePercent: 5, maxExtraAmount: 500 });
  assert.equal(result.estimatedTotal, 2000);
  assert.equal(result.finalTotal, 2080);
  assert.equal(result.requiresConfirmation, false);
  assert.equal(result.decision, "auto_accepted");
});

test("1 kg a 1.08 kg requiere confirmación por superar 5%", () => {
  const result = calculateWeightAdjustment({ requestedQuantity: 1, actualQuantity: 1.08, pricePerBaseUnit: 2000, tolerancePercent: 5, maxExtraAmount: 500 });
  assert.equal(result.finalTotal, 2160);
  assert.equal(result.differencePercent, 8);
  assert.equal(result.requiresConfirmation, true);
});

test("requiere confirmación si el monto adicional excede lo autorizado", () => {
  const result = calculateWeightAdjustment({ requestedQuantity: 10, actualQuantity: 10.4, pricePerBaseUnit: 5000, tolerancePercent: 5, maxExtraAmount: 1000 });
  assert.equal(result.differencePercent, 4);
  assert.equal(result.differenceAmount, 2000);
  assert.equal(result.exceedsAuthorizedAmount, true);
});
