export const REQUIRED_SCENARIOS = Object.freeze([
  { id: "sale", label: "Registrar una venta completa", targetSeconds: 90 },
  { id: "credit", label: "Anotar un fiado", targetSeconds: 45 },
  { id: "payment", label: "Registrar un abono", targetSeconds: 45 },
  { id: "weighing", label: "Preparar y pesar un pedido", targetSeconds: 120 },
  { id: "close", label: "Cerrar el día", targetSeconds: 180 },
]);

export const REQUIRED_FEATURE_IDS = Object.freeze([
  "secureContext",
  "localStorage",
  "dialog",
]);

export function evaluateFeatureChecks(checks, { requiredIds = REQUIRED_FEATURE_IDS } = {}) {
  const required = new Set(requiredIds);
  const list = Object.entries(checks).map(([id, value]) => ({ id, ok: Boolean(value), required: required.has(id) }));
  const failed = list.filter((item) => !item.ok).map((item) => item.id);
  const blockingFailed = list.filter((item) => item.required && !item.ok).map((item) => item.id);
  const advisoryFailed = list.filter((item) => !item.required && !item.ok).map((item) => item.id);
  return {
    total: list.length,
    passed: list.filter((item) => item.ok).length,
    failed,
    blockingFailed,
    advisoryFailed,
    ready: blockingFailed.length === 0,
    checks: list,
  };
}

export function evaluateScenarioResults(results) {
  const byId = new Map((results ?? []).map((result) => [result.id, result]));
  const scenarios = REQUIRED_SCENARIOS.map((scenario) => {
    const result = byId.get(scenario.id) ?? {};
    const seconds = Number(result.seconds);
    const completed = Boolean(result.completed);
    return {
      ...scenario,
      completed,
      seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : null,
      withinTarget: completed && Number.isFinite(seconds) && seconds > 0 && seconds <= scenario.targetSeconds,
      notes: String(result.notes ?? ""),
    };
  });
  return {
    scenarios,
    completed: scenarios.filter((item) => item.completed).length,
    withinTarget: scenarios.filter((item) => item.withinTarget).length,
    ready: scenarios.every((item) => item.completed && item.seconds !== null),
  };
}

export function pilotReadiness({ features, scenarios, criticalIssues = [] }) {
  const featureResult = evaluateFeatureChecks(features);
  const scenarioResult = evaluateScenarioResults(scenarios);
  const blockers = [...featureResult.blockingFailed, ...criticalIssues.filter(Boolean)];
  return {
    featureResult,
    scenarioResult,
    blockers,
    warnings: featureResult.advisoryFailed,
    status: blockers.length ? "blocked" : scenarioResult.ready ? "pilot_ready" : "needs_user_testing",
  };
}
