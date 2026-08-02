import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFeatureChecks, evaluateScenarioResults, pilotReadiness, REQUIRED_SCENARIOS } from "../assets/js/domain/pilot-validation.js";

test("resume diagnósticos del dispositivo", () => {
  assert.deepEqual(evaluateFeatureChecks({ storage: true, voice: false }).failed, ["voice"]);
});

test("exige completar los escenarios", () => {
  const results = REQUIRED_SCENARIOS.map((item) => ({ id: item.id, completed: true, seconds: item.targetSeconds }));
  assert.equal(evaluateScenarioResults(results).ready, true);
  assert.equal(pilotReadiness({ features: { storage: true }, scenarios: results }).status, "pilot_ready");
});
