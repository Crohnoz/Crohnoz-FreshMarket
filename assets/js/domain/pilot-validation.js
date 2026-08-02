export const REQUIRED_SCENARIOS = Object.freeze([
  { id: "sale", label: "Registrar una venta completa", targetSeconds: 90 },
  { id: "credit", label: "Anotar un fiado", targetSeconds: 45 },
  { id: "payment", label: "Registrar un abono", targetSeconds: 45 },
  { id: "weighing", label: "Preparar y pesar un pedido", targetSeconds: 120 },
  { id: "close", label: "Cerrar el día", targetSeconds: 180 },
]);

export function evaluateFeatureChecks(checks) {
  const list = Object.entries(checks).map(([id, value]) => ({ id, ok: Boolean(value) }));
  return {
    total: list.length,
    passed: list.filter((item) => item.ok).length,
    failed: list.filter((item) => !item.ok).map((item) => item.id),
    ready: list.every((item) => item.ok),
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
      seconds: Number.isFinite(seconds) ? seconds : null,
      withinTarget: completed && Number.isFinite(seconds) && seconds <= scenario.targetSeconds,
      notes: String(result.notes ?? ""),
    };
  });
  return {
    scenarios,
    completed: scenarios.filter((item) => item.completed).length,
    withinTarget: scenarios.filter((item) => item.withinTarget).length,
    ready: scenarios.every((item) => item.completed),
  };
}

export function pilotReadiness({ features, scenarios, criticalIssues = [] }) {
  const featureResult = evaluateFeatureChecks(features);
  const scenarioResult = evaluateScenarioResults(scenarios);
  const blockers = [...featureResult.failed, ...criticalIssues.filter(Boolean)];
  return {
    featureResult,
    scenarioResult,
    blockers,
    status: blockers.length ? "blocked" : scenarioResult.ready ? "pilot_ready" : "needs_user_testing",
  };
}
