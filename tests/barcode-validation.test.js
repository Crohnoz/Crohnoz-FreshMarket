import test from "node:test";
import assert from "node:assert/strict";
import { inspectBarcode, validateEAN13, validateEAN8, validateUPCA } from "../assets/js/scanner/barcode-validation.js";

test("valida EAN-13 conocido", () => {
  assert.equal(validateEAN13("4006381333931"), true);
  assert.equal(validateEAN13("4006381333932"), false);
});

test("valida EAN-8 conocido", () => {
  assert.equal(validateEAN8("96385074"), true);
  assert.equal(validateEAN8("96385075"), false);
});

test("valida UPC-A conocido", () => {
  assert.equal(validateUPCA("036000291452"), true);
  assert.equal(validateUPCA("036000291453"), false);
});

test("acepta estructura alfanumérica sin afirmar hardware", () => {
  const result = inspectBarcode("FM-LOT-2026-001");
  assert.equal(result.valid, true);
  assert.match(result.format, /Alfanumérico/);
});
