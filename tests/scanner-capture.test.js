import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSequence } from "../assets/js/scanner/scanner-capture.js";

test("clasifica una secuencia rápida como escáner", () => {
  const result = analyzeSequence([0, 12, 25, 37, 49], 60);
  assert.equal(result.likelyScanner, true);
  assert.equal(result.durationMs, 49);
});

test("no clasifica escritura lenta como escáner", () => {
  const result = analyzeSequence([0, 130, 280, 410], 60);
  assert.equal(result.likelyScanner, false);
});
