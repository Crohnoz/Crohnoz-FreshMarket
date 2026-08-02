import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, replaceStorageSnapshot, resetDemoStorage, snapshotStorage, writeStorage } from "../core/storage.js";
import { confirmAction, setButtonPending, setStatus, showToast } from "../core/ui-feedback.js";
import { products, initialOrders } from "../data/demo-data.js";
import { initialInventoryLots, initialOrderPayments, initialPurchases, initialSuppliers } from "../data/operations-demo.js";
import { initialCustomers, initialDailyTransactions, initialLedgerEntries } from "../data/receivables-demo.js";
import { buildBackupFilename, createBackupEnvelope, formatBackupSize, parseBackupText, serializeBackup, summarizeBackupEntries } from "../domain/backup.js";
import { auditDataIntegrity, integrityStatusLabel } from "../domain/data-integrity.js";

const form = document.querySelector("#business-form");
const preview = document.querySelector("#business-preview");
const exportButton = document.querySelector("#export-backup");
const importButton = document.querySelector("#import-backup");
const fileInput = document.querySelector("#backup-file");
let business = readStorage("business", DEFAULT_BUSINESS);
let pendingBackup = null;

function continuityMeta() {
  return readStorage("continuity-meta", {
    lastBackupAt: null,
    lastRestoreAt: null,
    businessConfiguredAt: null,
  });
}

function updateContinuityMeta(patch) {
  const next = { ...continuityMeta(), ...patch };
  writeStorage("continuity-meta", next);
  return next;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Nunca";
  return new Intl.DateTimeFormat("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
}

function fillForm() {
  Object.entries(business).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value;
  });
  applyTheme();
}

function readForm() {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || DEFAULT_BUSINESS.name).trim(),
    tagline: String(data.get("tagline") || DEFAULT_BUSINESS.tagline).trim(),
    whatsapp: String(data.get("whatsapp") || "").replace(/\D/g, ""),
    primaryColor: String(data.get("primaryColor") || DEFAULT_BUSINESS.primaryColor),
    accentColor: String(data.get("accentColor") || DEFAULT_BUSINESS.accentColor),
    darkMode: form.elements.darkMode.checked,
    isOpen: form.elements.isOpen.checked,
    deliveryFee: Math.max(0, Math.round(Number(data.get("deliveryFee")) || 0)),
    tolerancePercent: Math.max(0, Number(data.get("tolerancePercent")) || 0),
    maxExtraAmount: Math.max(0, Math.round(Number(data.get("maxExtraAmount")) || 0)),
  };
}

function renderPreview() {
  const current = readForm();
  preview.style.setProperty("--preview-primary", current.primaryColor);
  preview.style.setProperty("--preview-accent", current.accentColor);
  preview.dataset.theme = current.darkMode ? "dark" : "light";
  preview.querySelector("h2").textContent = current.name;
  preview.querySelector("p").textContent = current.tagline;
  preview.querySelector("[data-status]").textContent = current.isOpen ? "Abierto ahora" : "Cerrado temporalmente";
  preview.querySelector("[data-status]").className = `status ${current.isOpen ? "success" : "warning"}`;
  preview.querySelector("[data-tolerance]").textContent = `${current.tolerancePercent}% de tolerancia`;
}

function renderContinuity() {
  const snapshot = snapshotStorage();
  const summary = summarizeBackupEntries(snapshot.entries);
  const integrity = auditDataIntegrity(snapshot.entries, { products });
  const meta = continuityMeta();
  document.querySelector("#continuity-collections").textContent = summary.collections;
  document.querySelector("#continuity-records").textContent = summary.estimatedRecords;
  document.querySelector("#continuity-size").textContent = formatBackupSize(Math.max(snapshot.bytes, summary.bytes));
  document.querySelector("#continuity-last-backup").textContent = formatDateTime(meta.lastBackupAt);

  const badge = document.querySelector("#continuity-health-badge");
  const health = document.querySelector("#continuity-health");
  if (snapshot.invalidKeys.length) {
    badge.textContent = "Datos ilegibles";
    badge.className = "status danger";
    health.dataset.state = "error";
    health.textContent = `Hay ${snapshot.invalidKeys.length} colección(es) locales con JSON dañado. La exportación está bloqueada para no generar una copia incompleta.`;
    exportButton.disabled = true;
    return;
  }

  exportButton.disabled = false;
  if (integrity.status === "blocked") {
    badge.textContent = "Datos incoherentes";
    badge.className = "status danger";
    health.dataset.state = "error";
    health.textContent = `El almacenamiento se puede leer, pero existen ${integrity.counts.critical} error(es) crítico(s). Descarga una copia de resguardo y revisa Integridad antes de seguir operando.`;
    return;
  }
  if (snapshot.backend !== "localStorage") {
    badge.textContent = "Persistencia limitada";
    badge.className = "status warning";
    health.dataset.state = "warning";
    health.textContent = "El navegador está usando memoria temporal total o parcialmente. Descarga un respaldo antes de cerrar esta pestaña.";
    return;
  }
  if (integrity.status === "review") {
    badge.textContent = "Revisión recomendada";
    badge.className = "status warning";
    health.dataset.state = "warning";
    health.textContent = `Los datos son legibles y no tienen errores críticos, pero existen ${integrity.counts.warning} advertencia(s) de coherencia.`;
    return;
  }

  badge.textContent = "Datos coherentes";
  badge.className = "status success";
  health.dataset.state = "success";
  health.textContent = meta.lastBackupAt
    ? `El almacenamiento local se puede leer y el diagnóstico no detectó incoherencias. Última copia: ${formatDateTime(meta.lastBackupAt)}.`
    : "El almacenamiento local se puede leer y el diagnóstico no detectó incoherencias, pero todavía no existe una copia descargada.";
}

function save(event) {
  event.preventDefault();
  business = readForm();
  writeStorage("business", business);
  updateContinuityMeta({ businessConfiguredAt: new Date().toISOString() });
  applyTheme();
  setStatus("#save-status", "Configuración guardada en este navegador.", "success");
  showToast({ message: "Configuración actualizada.", state: "success" });
  renderPreview();
  renderContinuity();
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportBackup() {
  setButtonPending(exportButton, true, "Preparando respaldo…");
  try {
    const exportedAt = new Date();
    const filename = buildBackupFilename(business.name, exportedAt);
    const snapshot = snapshotStorage();
    if (snapshot.invalidKeys.length) throw new Error("Existen colecciones ilegibles y el respaldo fue bloqueado.");
    const envelope = createBackupEnvelope(snapshot.entries, {
      namespace: APP_CONFIG.storageNamespace,
      appVersion: APP_CONFIG.version,
      exportedAt: exportedAt.toISOString(),
    });
    const serialized = serializeBackup(envelope);
    downloadTextFile(serialized, filename);
    updateContinuityMeta({
      lastBackupAt: exportedAt.toISOString(),
      lastBackupFilename: filename,
      lastBackupChecksum: envelope.checksum,
      lastBackupVersion: envelope.version,
    });
    setStatus("#continuity-status", `Respaldo descargado y checksum generado: ${filename}.`, "success");
    showToast({ message: "Respaldo con checksum descargado.", state: "success" });
    renderContinuity();
  } catch (error) {
    setStatus("#continuity-status", error.message, "error");
    showToast({ message: error.message, state: "error" });
  } finally {
    setButtonPending(exportButton, false);
  }
}

function clearBackupPreview() {
  pendingBackup = null;
  importButton.disabled = true;
  const backupPreview = document.querySelector("#backup-preview");
  backupPreview.hidden = true;
  delete backupPreview.dataset.state;
  document.querySelector("#backup-preview-title").textContent = "";
  document.querySelector("#backup-preview-detail").textContent = "";
  document.querySelector("#backup-preview-integrity").textContent = "";
}

function backupInspectionText(envelope, integrity) {
  const checksumState = envelope.integrity.verified
    ? "Checksum verificado"
    : "Respaldo antiguo sin checksum";
  const dataState = integrity.status === "healthy"
    ? "datos coherentes"
    : `${integrityStatusLabel(integrity.status).toLocaleLowerCase("es")} (${integrity.counts.critical} crítico(s), ${integrity.counts.warning} advertencia(s))`;
  return `${checksumState} · ${dataState}.`;
}

async function inspectSelectedBackup() {
  clearBackupPreview();
  setStatus("#continuity-status", "", "info");
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const envelope = parseBackupText(await file.text(), { expectedNamespace: APP_CONFIG.storageNamespace });
    const summary = summarizeBackupEntries(envelope.entries);
    const integrity = auditDataIntegrity(envelope.entries, { products });
    pendingBackup = { envelope, fileName: file.name, summary, integrity };

    const backupPreview = document.querySelector("#backup-preview");
    backupPreview.dataset.state = integrity.status === "blocked"
      ? "error"
      : envelope.integrity.legacy || integrity.status === "review"
        ? "warning"
        : "success";
    document.querySelector("#backup-preview-title").textContent = file.name;
    document.querySelector("#backup-preview-detail").textContent = `${summary.collections} colecciones · ${summary.estimatedRecords} registros estimados · exportado ${formatDateTime(envelope.exportedAt)}.`;
    document.querySelector("#backup-preview-integrity").textContent = backupInspectionText(envelope, integrity);
    backupPreview.hidden = false;

    if (integrity.status === "blocked") {
      importButton.disabled = true;
      setStatus("#continuity-status", `Restauración bloqueada: el archivo contiene ${integrity.counts.critical} error(es) crítico(s) de coherencia.`, "error");
      return;
    }

    importButton.disabled = false;
    if (envelope.integrity.legacy) {
      setStatus("#continuity-status", "Archivo antiguo compatible. No posee checksum; restaura solo si reconoces su origen.", "warning");
    } else if (integrity.status === "review") {
      setStatus("#continuity-status", `Checksum correcto. El archivo contiene ${integrity.counts.warning} advertencia(s) no bloqueantes.`, "warning");
    } else {
      setStatus("#continuity-status", "Checksum correcto y datos coherentes. Revisa el resumen antes de restaurar.", "success");
    }
  } catch (error) {
    setStatus("#continuity-status", error.message, "error");
  }
}

async function importBackup() {
  if (!pendingBackup || pendingBackup.integrity.status === "blocked") return;
  const accepted = await confirmAction({
    title: "¿Restaurar este respaldo?",
    message: "Los datos actuales de este navegador serán reemplazados por el contenido del archivo.",
    detail: `${pendingBackup.fileName} · ${pendingBackup.summary.collections} colecciones · ${pendingBackup.summary.estimatedRecords} registros · ${backupInspectionText(pendingBackup.envelope, pendingBackup.integrity)}`,
    confirmLabel: "Sí, restaurar",
    cancelLabel: "Conservar datos actuales",
    tone: "danger",
  });
  if (!accepted) return;

  setButtonPending(importButton, true, "Restaurando…");
  try {
    replaceStorageSnapshot(pendingBackup.envelope.entries);
    const restoredAt = new Date().toISOString();
    const importedMeta = continuityMeta();
    updateContinuityMeta({
      ...importedMeta,
      lastRestoreAt: restoredAt,
      restoredFrom: pendingBackup.fileName,
      restoredExportedAt: pendingBackup.envelope.exportedAt,
      restoredBackupVersion: pendingBackup.envelope.version,
      restoredChecksumVerified: pendingBackup.envelope.integrity.verified,
    });
    writeStorage("integrity-meta", {
      lastScanAt: restoredAt,
      status: pendingBackup.integrity.status,
      counts: pendingBackup.integrity.counts,
      rulesetVersion: pendingBackup.integrity.rulesetVersion,
      source: "restore-validation",
    });
    business = readStorage("business", DEFAULT_BUSINESS);
    fillForm();
    renderPreview();
    clearBackupPreview();
    fileInput.value = "";
    renderContinuity();
    setStatus("#continuity-status", "Respaldo restaurado. Revisa la configuración y el último cierre antes de continuar.", "success");
    showToast({ message: "Datos restaurados desde el respaldo validado.", state: "success", duration: 8000 });
  } catch (error) {
    setStatus("#continuity-status", error.message, "error");
    showToast({ message: error.message, state: "error" });
  } finally {
    const canRestore = Boolean(pendingBackup && pendingBackup.integrity.status !== "blocked");
    setButtonPending(importButton, false);
    importButton.disabled = !canRestore;
  }
}

function seedDemoData() {
  writeStorage("business", { ...DEFAULT_BUSINESS });
  writeStorage("orders", initialOrders);
  writeStorage("prices", Object.fromEntries(products.map((product) => [product.id, product.price])));
  writeStorage("inventory-lots", initialInventoryLots);
  writeStorage("suppliers", initialSuppliers);
  writeStorage("purchase-orders", initialPurchases);
  writeStorage("order-payments", initialOrderPayments);
  writeStorage("credit-customers", initialCustomers);
  writeStorage("credit-ledger", initialLedgerEntries);
  writeStorage("daily-transactions", initialDailyTransactions);
  writeStorage("cart", []);
  writeStorage("waste", []);
  writeStorage("daily-closes", []);
  writeStorage("continuity-meta", { lastResetAt: new Date().toISOString(), lastBackupAt: null, lastRestoreAt: null, businessConfiguredAt: null });
  writeStorage("integrity-meta", { lastScanAt: null, status: null, counts: { critical: 0, warning: 0, info: 0 }, rulesetVersion: 1, source: "demo-reset" });
}

async function reset() {
  const accepted = await confirmAction({
    title: "¿Restablecer todo el piloto?",
    message: "Se eliminarán configuración, pedidos, compras, cuentas, inventario, cierres y progreso guardados en este navegador.",
    detail: "Esta acción no puede deshacerse. Descarga un respaldo antes si necesitas conservar algo.",
    confirmLabel: "Sí, borrar y restablecer",
    cancelLabel: "Cancelar",
    tone: "danger",
  });
  if (!accepted) return;
  resetDemoStorage();
  seedDemoData();
  business = readStorage("business", DEFAULT_BUSINESS);
  fillForm();
  renderPreview();
  clearBackupPreview();
  fileInput.value = "";
  renderContinuity();
  setStatus("#save-status", "Datos demo restablecidos.", "success");
  setStatus("#continuity-status", "El piloto volvió a su estado inicial.", "success");
  showToast({ message: "Datos demo restablecidos.", state: "success" });
}

fillForm();
renderPreview();
renderContinuity();
form.addEventListener("input", renderPreview);
form.addEventListener("submit", save);
exportButton.addEventListener("click", exportBackup);
fileInput.addEventListener("change", inspectSelectedBackup);
importButton.addEventListener("click", importBackup);
document.querySelector("#reset-demo").addEventListener("click", reset);
document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
