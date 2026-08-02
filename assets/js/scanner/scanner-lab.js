import { APP_CONFIG } from "../core/config.js";
import { localDateTime } from "../core/format.js";
import { createScannerCapture } from "./scanner-capture.js";
import { inspectBarcode } from "./barcode-validation.js";

const history = [];
const errors = [];
const elements = {
  captureState: document.querySelector("#capture-state"),
  focusState: document.querySelector("#focus-state"),
  currentCode: document.querySelector("#current-code"),
  currentMeta: document.querySelector("#current-meta"),
  historyBody: document.querySelector("#history-body"),
  errorList: document.querySelector("#error-list"),
  eventLog: document.querySelector("#event-log"),
};

function settingsFromForm() {
  return {
    thresholdMs: Number(document.querySelector("#threshold").value),
    idleTimeoutMs: Number(document.querySelector("#idle-timeout").value),
    minLength: Number(document.querySelector("#min-length").value),
    terminator: document.querySelector("#terminator").value,
    duplicateWindowMs: Number(document.querySelector("#duplicate-window").value),
    captureInInputs: document.querySelector("#capture-inputs").checked,
  };
}

function beep() {
  if (!document.querySelector("#sound-enabled").checked) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const context = new AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.value = 0.04;
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.07);
  } catch (error) {
    errors.push(`Sonido no disponible: ${error.message}`);
    renderErrors();
  }
}

function handleScan(payload) {
  const inspection = inspectBarcode(payload.code);
  const record = {
    id: history.length + 1,
    ...payload,
    ...inspection,
    displayTime: localDateTime(new Date(payload.capturedAt)),
  };
  history.unshift(record);
  if (history.length > 100) history.pop();
  elements.currentCode.textContent = inspection.normalized || "—";
  elements.currentMeta.textContent = `${inspection.format} · ${inspection.valid ? "válido/aceptado" : "revisar"} · ${payload.averageIntervalMs} ms entre caracteres · ${payload.terminator}`;
  elements.currentCode.className = payload.accepted && inspection.valid ? "scan-code success" : "scan-code warning";
  if (payload.accepted && inspection.valid) beep();
  renderHistory();
}

function handleEvent(event) {
  elements.eventLog.textContent = JSON.stringify({
    key: event.key,
    code: event.code,
    repeat: event.repeat,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    meta: event.metaKey,
    target: event.target?.tagName,
    at: localDateTime(),
  }, null, 2);
}

function renderHistory() {
  elements.historyBody.replaceChildren();
  history.forEach((record) => {
    const tr = document.createElement("tr");
    const values = [record.id, record.displayTime, record.normalized, record.format, `${record.durationMs} ms`, `${record.averageIntervalMs} ms`, record.terminator, record.duplicate ? "Sí" : "No", record.accepted && record.valid ? "Aceptado" : "Revisar"];
    values.forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value;
      tr.append(td);
    });
    elements.historyBody.append(tr);
  });
  document.querySelector("#scan-count").textContent = history.length;
}

function renderErrors() {
  elements.errorList.replaceChildren();
  if (!errors.length) {
    const li = document.createElement("li");
    li.textContent = "Sin errores registrados.";
    elements.errorList.append(li);
    return;
  }
  errors.forEach((error) => {
    const li = document.createElement("li");
    li.textContent = error;
    elements.errorList.append(li);
  });
}

const capture = createScannerCapture({
  ...settingsFromForm(),
  onScan: handleScan,
  onEvent: handleEvent,
  onStatus: (active) => {
    elements.captureState.textContent = active ? "Captura activa" : "Captura pausada";
    elements.captureState.className = active ? "status success" : "status warning";
    document.querySelector("#toggle-capture").textContent = active ? "Pausar captura" : "Iniciar captura";
  },
});

function updateFocus() {
  const active = document.activeElement;
  elements.focusState.textContent = `${active?.tagName ?? "desconocido"}${active?.id ? `#${active.id}` : ""}`;
}

function exportHistory() {
  const payload = {
    app: APP_CONFIG.appName,
    version: APP_CONFIG.version,
    exportedAt: new Date().toISOString(),
    settings: settingsFromForm(),
    history,
    errors,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `scanner-diagnostic-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#toggle-capture").addEventListener("click", () => capture.isActive() ? capture.stop() : capture.start());
document.querySelector("#scanner-settings").addEventListener("input", () => capture.update(settingsFromForm()));
document.querySelector("#manual-form").addEventListener("submit", (event) => {
  event.preventDefault();
  capture.processManual(document.querySelector("#manual-code").value);
  document.querySelector("#manual-code").value = "";
});
document.querySelector("#clear-current").addEventListener("click", () => {
  elements.currentCode.textContent = "—";
  elements.currentMeta.textContent = "Esperando una lectura";
});
document.querySelector("#clear-history").addEventListener("click", () => { history.splice(0); renderHistory(); });
document.querySelector("#export-history").addEventListener("click", exportHistory);
window.addEventListener("focusin", updateFocus);
window.addEventListener("focusout", () => window.setTimeout(updateFocus));
document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
renderErrors();
renderHistory();
updateFocus();
capture.start();
