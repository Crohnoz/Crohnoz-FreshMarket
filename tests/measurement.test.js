import test from "node:test";
import assert from "node:assert/strict";
import { convertQuantity, roundQuantity, validateMeasurementOption } from "../assets/js/domain/measurement.js";

test("convierte gramos a kilogramos", () => {
  assert.equal(convertQuantity(500, "g", "kg"), 0.5);
});

test("convierte kilogramos a gramos", () => {
  assert.equal(convertQuantity(1.08, "kg", "g"), 1080);
});

test("rechaza conversiones entre dimensiones", () => {
  assert.throws(() => convertQuantity(1, "kg", "unit"), RangeError);
});

test("redondea cantidades a tres decimales", () => {
  assert.equal(roundQuantity(1.0800001), 1.08);
});

test("valida una presentación", () => {
  assert.equal(validateMeasurementOption({ label: "500 g", quantityBase: 0.5 }), true);
});
