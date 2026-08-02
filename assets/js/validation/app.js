import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { initialPilotValidations } from "../data/operations-demo.js";
import { evaluateFeatureChecks, pilotReadiness, REQUIRED_SCENARIOS } from "../domain/pilot-validation.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let validations = readStorage("pilot-validations", initialPilotValidations);
const featureChecks = {
  secureContext: window.isSecureContext,
  localStorage: (() => { try { localStorage.setItem("cfm-test", "1"); localStorage.removeItem("cfm-test"); return true; } catch { return false; } })(),
  serviceWorker: "serviceWorker" in navigator,
  online: navigator.onLine,
  microphoneApi: Boolean(navigator.mediaDevices?.getUserMedia),
  speechRecognition: Boolean(window.SpeechRecognition || window.webkitSpeechRecognition),
  speechSynthesis: "speechSynthesis" in window,
  clipboard: Boolean(navigator.clipboard),
  dialog: typeof HTMLDialogElement !== "undefined",
};

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function renderFeatures() {
  const container = document.querySelector("#validation-features");
  container.replaceChildren();
  Object.entries(featureChecks).forEach(([id, ok]) => {
    const row = document.createElement("article");
    row.className = `validation-check ${ok ? "pass" : "fail"}`;
    row.innerHTML = `<span>${ok ? "✓" : "!"}</span><div><strong></strong><small></small></div>`;
    row.querySelector("strong").textContent = id;
    row.querySelector("small").textContent = ok ? "Disponible" : "No disponible o requiere prueba física";
    container.append(row);
  });
}

function renderScenarios() {
  const container = document.querySelector("#validation-scenarios");
  container.innerHTML = REQUIRED_SCENARIOS.map((scenario) => `<article class="validation-scenario" data-id="${scenario.id}"><label class="scenario-check"><input type="checkbox" name="completed"> ${scenario.label}</label><label>Tiempo en segundos<input type="number" name="seconds" min="0" max="3600" placeholder="Meta ${scenario.targetSeconds}"></label><label>Observación<input name="notes" maxlength="180" placeholder="Dónde dudó o se equivocó"></label></article>`).join("");
}

function readScenarios() {
  return [...document.querySelectorAll(".validation-scenario")].map((row) => ({ id: row.dataset.id, completed: row.querySelector("[name=completed]").checked, seconds: row.querySelector("[name=seconds]").value, notes: row.querySelector("[name=notes]").value }));
}

function renderHistory() {
  const container = document.querySelector("#validation-history");
  container.replaceChildren();
  [...validations].reverse().slice(0, 6).forEach((validation) => {
    const row = document.createElement("article");
    row.className = "validation-history-row";
    row.innerHTML = `<div><strong></strong><small></small></div><b></b>`;
    row.querySelector("strong").textContent = validation.participant || "Prueba sin nombre";
    row.querySelector("small").textContent = new Date(validation.createdAt).toLocaleString("es-CL");
    row.querySelector("b").textContent = validation.readiness.status;
    container.append(row);
  });
}

document.querySelector("#validation-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const criticalIssues = event.currentTarget.criticalIssues.value.split("\n").map((item) => item.trim()).filter(Boolean);
  const scenarios = readScenarios();
  const readiness = pilotReadiness({ features: featureChecks, scenarios, criticalIssues });
  validations.push({ id: crypto.randomUUID(), participant: event.currentTarget.participant.value.trim(), profile: event.currentTarget.profile.value, createdAt: new Date().toISOString(), featureChecks, scenarios, criticalIssues, readiness });
  writeStorage("pilot-validations", validations);
  document.querySelector("#validation-result").innerHTML = `<strong>${readiness.status}</strong><p>${readiness.blockers.length ? `Bloqueadores: ${readiness.blockers.join(", ")}` : "No se registraron bloqueadores técnicos críticos."}</p><small>${readiness.scenarioResult.completed}/${REQUIRED_SCENARIOS.length} escenarios completados.</small>`;
  renderHistory();
});

applyTheme();
renderFeatures();
renderScenarios();
renderHistory();
document.querySelector("#validation-feature-summary").textContent = `${evaluateFeatureChecks(featureChecks).passed}/${Object.keys(featureChecks).length} capacidades detectadas`;
