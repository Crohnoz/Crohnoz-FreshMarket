import test from "node:test";
import assert from "node:assert/strict";
import { evaluateFeatureChecks, evaluateScenarioResults, pilotReadiness, REQUIRED_SCENARIOS } from "../assets/js/domain/pilot-validation.js";

test("separa capacidades bloqueantes de mejoras opcionales", () => {
  const result = evaluateFeatureChecks({ secureContext: true, localStorage: true, dialog: true, speechRecognition: false });
  assert.deepEqual(result.failed, ["speechRecognition"]);
  assert.deepEqual(result.blockingFailed, []);
  assert.deepEqual(result.advisoryFailed, ["speechRecognition"]);
  assert.equal(result.ready, true);
});

test("exige completar y cronometrar los escenarios", () => {
  const results = REQUIRED_SCENARIOS.map((item) => ({ id: item.id, completed: true, seconds: item.targetSeconds }));
  assert.equal(evaluateScenarioResults(results).ready, true);
  assert.equal(pilotReadiness({ features: { secureContext: true, localStorage: true, dialog: true }, scenarios: results }).status, "pilot_ready");
  assert.equal(evaluateScenarioResults([{ id: "sale", completed: true, seconds: "" }]).ready, false);
});
