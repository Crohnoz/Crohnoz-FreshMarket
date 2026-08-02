import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, snapshotStorage, writeStorage } from "../core/storage.js";
import { products } from "../data/demo-data.js";
import { materializePilotEntries } from "../data/pilot-state.js";
import { auditDataIntegrity, integrityStatusDescription, integrityStatusLabel } from "../domain/data-integrity.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const statusRegion = document.querySelector("#integrity-live-status");
let activeSeverity = "all";
let currentReport = null;
let currentSnapshot = null;
let currentEffectiveEntries = null;
let generatedAt = null;

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function addStorageParseIssues(report, snapshot) {
  if (!snapshot.invalidKeys.length) return report;
  const storageIssues = snapshot.invalidKeys.map((name) => ({
    severity: "critical",
    code: "unreadable-storage-entry",
    collection: name,
    recordId: null,
    message: `La colección ${name} no contiene JSON legible y fue omitida del análisis.`,
    recommendation: "Conserva un respaldo del estado actual y recupera una copia válida antes de continuar.",
  }));
  const issues = [...storageIssues, ...report.issues];
  return {
    ...report,
    status: "blocked",
    counts: { ...report.counts, critical: report.counts.critical + storageIssues.length },
    issues,
    byCollection: storageIssues.reduce((result, item) => {
      result[item.collection] = (result[item.collection] ?? 0) + 1;
      return result;
    }, { ...report.byCollection }),
  };
}

function statusIcon(status) {
  return ({ healthy: "✓", review: "!", blocked: "×" })[status] ?? "…";
}

function scoreText(status) {
  return ({ healthy: "OK", review: "REVISAR", blocked: "DETENER" })[status] ?? "—";
}

function renderStatus() {
  const card = document.querySelector("#integrity-status-card");
  card.dataset.state = currentReport.status;
  document.querySelector("#integrity-status-icon").textContent = statusIcon(currentReport.status);
  document.querySelector("#integrity-status-title").textContent = integrityStatusLabel(currentReport.status);
  document.querySelector("#integrity-status-description").textContent = integrityStatusDescription(currentReport);
  document.querySelector("#integrity-scanned-at").textContent = `Último análisis: ${formatDateTime(generatedAt)} · reglas v${currentReport.rulesetVersion}`;
  document.querySelector("#integrity-score").textContent = scoreText(currentReport.status);
}

function renderMetrics() {
  document.querySelector("#integrity-collections").textContent = currentReport.collectionsChecked;
  document.querySelector("#integrity-records").textContent = currentReport.recordsChecked;
  document.querySelector("#integrity-critical").textContent = currentReport.counts.critical;
  document.querySelector("#integrity-warning").textContent = currentReport.counts.warning;
}

function issueCard(item) {
  const article = document.createElement("article");
  article.className = "integrity-issue";
  article.dataset.severity = item.severity;
  article.innerHTML = `
    <div class="integrity-issue-badge" aria-hidden="true"></div>
    <div>
      <div class="integrity-issue-heading"><h3></h3><span class="integrity-issue-code"></span></div>
      <p></p>
      <small></small>
      <div class="integrity-issue-meta"></div>
    </div>`;
  article.querySelector(".integrity-issue-badge").textContent = item.severity === "critical" ? "×" : "!";
  article.querySelector("h3").textContent = item.severity === "critical" ? "Corrección necesaria" : "Revisión recomendada";
  article.querySelector(".integrity-issue-code").textContent = item.code;
  article.querySelector("p").textContent = item.message;
  article.querySelector("small").textContent = `Acción sugerida: ${item.recommendation}`;
  const meta = article.querySelector(".integrity-issue-meta");
  const collection = document.createElement("span");
  collection.textContent = item.collection;
  meta.append(collection);
  if (item.recordId) {
    const record = document.createElement("span");
    record.textContent = item.recordId;
    meta.append(record);
  }
  return article;
}

function filteredIssues() {
  const query = normalize(document.querySelector("#integrity-search").value);
  return currentReport.issues.filter((item) => {
    if (activeSeverity !== "all" && item.severity !== activeSeverity) return false;
    if (!query) return true;
    const haystack = normalize(`${item.code} ${item.collection} ${item.recordId ?? ""} ${item.message} ${item.recommendation}`);
    return query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
  });
}

function renderIssues() {
  const issues = filteredIssues();
  const container = document.querySelector("#integrity-issues");
  container.replaceChildren(...issues.map(issueCard));
  document.querySelector("#integrity-empty").hidden = issues.length > 0;
  const total = currentReport.issues.length;
  document.querySelector("#integrity-result-count").textContent = total
    ? `${issues.length} de ${total} hallazgo(s) visibles.`
    : "No se detectaron hallazgos en las colecciones revisadas.";
}

function announce(message, state = "success") {
  statusRegion.textContent = message;
  statusRegion.dataset.state = state;
  window.setTimeout(() => {
    if (statusRegion.textContent === message) statusRegion.textContent = "";
  }, 6000);
}

function runAudit({ announceResult = true } = {}) {
  currentSnapshot = snapshotStorage();
  currentEffectiveEntries = materializePilotEntries(currentSnapshot.entries);
  generatedAt = new Date().toISOString();
  currentReport = addStorageParseIssues(
    auditDataIntegrity(currentEffectiveEntries, { products }),
    currentSnapshot,
  );
  writeStorage("integrity-meta", {
    lastScanAt: generatedAt,
    status: currentReport.status,
    counts: currentReport.counts,
    rulesetVersion: currentReport.rulesetVersion,
  });
  renderStatus();
  renderMetrics();
  renderIssues();
  if (announceResult) {
    announce(currentReport.status === "healthy"
      ? "Análisis completado sin hallazgos."
      : `Análisis completado: ${currentReport.counts.critical} crítico(s) y ${currentReport.counts.warning} advertencia(s).`,
    currentReport.status === "blocked" ? "error" : currentReport.status === "review" ? "warning" : "success");
  }
}

function diagnosticFilename() {
  const date = new Date(generatedAt);
  const datePart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `fresh-market-integridad-${datePart}.json`;
}

function downloadReport() {
  if (!currentReport) runAudit({ announceResult: false });
  const diagnostic = {
    format: "crohnoz-fresh-market-integrity-report",
    version: 1,
    appVersion: APP_CONFIG.version,
    generatedAt,
    storage: {
      namespace: currentSnapshot.namespace,
      backend: currentSnapshot.backend,
      persistedCollections: currentSnapshot.collections,
      effectiveCollections: Object.keys(currentEffectiveEntries).length,
      invalidKeys: [...currentSnapshot.invalidKeys],
    },
    report: currentReport,
    note: "Este informe contiene hallazgos y referencias, no una copia restaurable de los datos.",
  };
  const blob = new Blob([JSON.stringify(diagnostic, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = diagnosticFilename();
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  announce("Informe de integridad descargado.", "success");
}

function bindControls() {
  document.querySelector("#run-integrity").addEventListener("click", () => runAudit());
  document.querySelector("#download-integrity").addEventListener("click", downloadReport);
  document.querySelector("#integrity-search").addEventListener("input", renderIssues);
  document.querySelectorAll("#integrity-filters [data-severity]").forEach((button) => {
    button.addEventListener("click", () => {
      activeSeverity = button.dataset.severity;
      document.querySelectorAll("#integrity-filters [data-severity]").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      renderIssues();
    });
  });
}

applyTheme();
bindControls();
runAudit({ announceResult: false });
