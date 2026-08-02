import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { initialPilotValidations } from "../data/operations-demo.js";
import { evaluateFeatureChecks, pilotReadiness, REQUIRED_SCENARIOS } from "../domain/pilot-validation.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let validations = readStorage("pilot-validations", initialPilotValidations);
let featureChecks = readFeatureChecks();
const form = document.querySelector("#validation-form");
const resultRegion = document.querySelector("#validation-result");
resultRegion.setAttribute("role", "status");
resultRegion.setAttribute("aria-live", "polite");

const FEATURE_META = Object.freeze({
  secureContext: { label: "Conexión segura", ok: "La página usa HTTPS.", fail: "La página necesita HTTPS para permisos sensibles." },
  localStorage: { label: "Guardado local", ok: "El navegador puede guardar los datos del piloto.", fail: "El navegador bloquea el almacenamiento local." },
  serviceWorker: { label: "Continuidad sin conexión", ok: "El navegador admite el modo offline del piloto.", fail: "El modo offline no está disponible en este navegador." },
  online: { label: "Conexión a internet", ok: "El dispositivo está conectado en este momento.", fail: "El dispositivo está sin conexión; las funciones locales pueden continuar." },
  microphoneApi: { label: "Acceso al micrófono", ok: "El navegador puede solicitar permiso de micrófono.", fail: "Usa escritura o dictado del teclado como alternativa." },
  speechRecognition: { label: "Reconocimiento de voz", ok: "El navegador ofrece reconocimiento directo.", fail: "No es bloqueante: permanece disponible la entrada manual." },
  speechSynthesis: { label: "Lectura en voz alta", ok: "El navegador puede leer respuestas.", fail: "No es bloqueante: las respuestas siguen visibles." },
  clipboard: { label: "Copiar al portapapeles", ok: "Se pueden copiar comprobantes y resúmenes.", fail: "El usuario deberá seleccionar y copiar el texto manualmente." },
  dialog: { label: "Confirmaciones modales", ok: "El navegador admite ventanas de confirmación.", fail: "Las confirmaciones principales no funcionan correctamente." },
});

function readFeatureChecks() {
  return {
    secureContext: window.isSecureContext,
    localStorage: (() => {
      try {
        const key = `${APP_CONFIG.storageNamespace}:validation-probe`;
        localStorage.setItem(key, "1");
        localStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    })(),
    serviceWorker: "serviceWorker" in navigator,
    online: navigator.onLine,
    microphoneApi: Boolean(navigator.mediaDevices?.getUserMedia),
    speechRecognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
    speechSynthesis: "speechSynthesis" in window,
    clipboard: Boolean(navigator.clipboard),
    dialog: typeof HTMLDialogElement !== "undefined",
  };
}

function readinessLabel(status) {
  return ({ blocked: "Bloqueado", pilot_ready: "Listo para piloto", needs_user_testing: "Faltan pruebas de usuario" })[status] ?? status;
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function renderFeatureSummary() {
  const result = evaluateFeatureChecks(featureChecks);
  const summary = document.querySelector("#validation-feature-summary");
  summary.textContent = `${result.passed}/${result.total} capacidades detectadas`;
  summary.className = `status ${result.blockingFailed.length ? "warning" : "success"}`;
}

function renderFeatures() {
  const container = document.querySelector("#validation-features");
  const evaluation = evaluateFeatureChecks(featureChecks);
  container.replaceChildren();
  evaluation.checks.forEach(({ id, ok, required }) => {
    const meta = FEATURE_META[id] ?? { label: id, ok: "Disponible", fail: "No disponible" };
    const row = document.createElement("article");
    row.className = `validation-check ${ok ? "pass" : "fail"}`;
    row.innerHTML = `<span aria-hidden="true"></span><div><strong></strong><small></small></div>`;
    row.querySelector("span").textContent = ok ? "✓" : "!";
    row.querySelector("strong").textContent = `${meta.label} · ${required ? "Esencial" : "Opcional"}`;
    row.querySelector("small").textContent = ok ? meta.ok : meta.fail;
    container.append(row);
  });
  renderFeatureSummary();
}

function renderScenarios() {
  const container = document.querySelector("#validation-scenarios");
  container.replaceChildren();
  REQUIRED_SCENARIOS.forEach((scenario) => {
    const row = document.createElement("article");
    row.className = "validation-scenario";
    row.dataset.id = scenario.id;
    row.innerHTML = `<label class="scenario-check"><input type="checkbox" name="completed"> <span></span></label><label>Tiempo en segundos<input type="number" name="seconds" min="1" max="3600"><small class="field-help"></small></label><label>Observación<input name="notes" maxlength="180" placeholder="Dónde dudó o se equivocó"></label>`;
    row.querySelector(".scenario-check span").textContent = scenario.label;
    row.querySelector("[name=seconds]").placeholder = `Meta ${scenario.targetSeconds}`;
    row.querySelector(".field-help").textContent = `Meta: ${scenario.targetSeconds} segundos.`;
    const completed = row.querySelector("[name=completed]");
    const seconds = row.querySelector("[name=seconds]");
    completed.addEventListener("change", () => {
      seconds.required = completed.checked;
      if (completed.checked && !seconds.value) seconds.focus();
    });
    container.append(row);
  });
}

function readScenarios() {
  return [...document.querySelectorAll(".validation-scenario")].map((row) => ({
    id: row.dataset.id,
    completed: row.querySelector("[name=completed]").checked,
    seconds: row.querySelector("[name=seconds]").value,
    notes: row.querySelector("[name=notes]").value.trim(),
  }));
}

function renderHistory() {
  const container = document.querySelector("#validation-history");
  container.replaceChildren();
  const recent = [...validations].reverse().slice(0, 6);
  if (!recent.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Todavía no hay pruebas guardadas en este navegador.";
    container.append(empty);
    return;
  }
  recent.forEach((validation) => {
    const row = document.createElement("article");
    row.className = "validation-history-row";
    row.innerHTML = `<div><strong></strong><small></small></div><b></b>`;
    row.querySelector("strong").textContent = validation.participant || "Prueba sin nombre";
    row.querySelector("small").textContent = `${validation.profile ?? "Perfil no indicado"} · ${new Date(validation.createdAt).toLocaleString("es-CL")}`;
    row.querySelector("b").textContent = readinessLabel(validation.readiness.status);
    container.append(row);
  });
}

function renderResult(readiness) {
  resultRegion.replaceChildren();
  const title = document.createElement("strong");
  title.textContent = readinessLabel(readiness.status);
  const summary = document.createElement("p");
  summary.textContent = readiness.blockers.length
    ? `Bloqueadores: ${readiness.blockers.join(", ")}`
    : "No se registraron bloqueadores técnicos críticos.";
  const details = document.createElement("small");
  const optional = readiness.warnings.length ? ` · ${readiness.warnings.length} capacidad(es) opcional(es) no disponibles` : "";
  details.textContent = `${readiness.scenarioResult.completed}/${REQUIRED_SCENARIOS.length} escenarios completados${optional}.`;
  resultRegion.append(title, summary, details);
  resultRegion.dataset.state = readiness.status === "blocked" ? "error" : readiness.status === "pilot_ready" ? "success" : "warning";
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  featureChecks = readFeatureChecks();
  const criticalIssues = event.currentTarget.criticalIssues.value.split("\n").map((item) => item.trim()).filter(Boolean);
  const scenarios = readScenarios();
  const incompleteTiming = scenarios.find((scenario) => scenario.completed && !(Number(scenario.seconds) > 0));
  if (incompleteTiming) {
    const row = document.querySelector(`.validation-scenario[data-id="${incompleteTiming.id}"]`);
    resultRegion.replaceChildren();
    const message = document.createElement("p");
    message.textContent = "Una tarea marcada como completada necesita un tiempo mayor a cero.";
    resultRegion.append(message);
    resultRegion.dataset.state = "error";
    row?.querySelector("[name=seconds]")?.focus();
    return;
  }
  const readiness = pilotReadiness({ features: featureChecks, scenarios, criticalIssues });
  validations.push({
    id: crypto.randomUUID(),
    participant: event.currentTarget.participant.value.trim(),
    profile: event.currentTarget.profile.value,
    createdAt: new Date().toISOString(),
    featureChecks,
    scenarios,
    criticalIssues,
    readiness,
  });
  writeStorage("pilot-validations", validations);
  renderResult(readiness);
  renderHistory();
  form.reset();
  renderScenarios();
  resultRegion.scrollIntoView({ behavior: "smooth", block: "center" });
});

window.addEventListener("online", () => {
  featureChecks = readFeatureChecks();
  renderFeatures();
});
window.addEventListener("offline", () => {
  featureChecks = readFeatureChecks();
  renderFeatures();
});

applyTheme();
renderFeatures();
renderScenarios();
renderHistory();
