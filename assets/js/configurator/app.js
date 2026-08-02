import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, replaceStorageSnapshot, resetDemoStorage, snapshotStorage, writeStorage } from "../core/storage.js";
import { confirmAction, setButtonPending, setStatus, showToast } from "../core/ui-feedback.js";
import { products, initialOrders } from "../data/demo-data.js";
import { initialInventoryLots, initialOrderPayments, initialPurchases, initialSuppliers } from "../data/operations-demo.js";
import { initialCustomers, initialDailyTransactions, initialLedgerEntries } from "../data/receivables-demo.js";
import { buildBackupFilename, createBackupEnvelope, formatBackupSize, parseBackupText, serializeBackup, summarizeBackupEntries } from "../domain/backup.js";

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
  const meta = continuityMeta();
  document.querySelector("#continuity-collections").textContent = summary.collections;
  document.querySelector("#continuity-records").textContent = summary.estimatedRecords;
  document.querySelector("#continuity-size").textContent = formatBackupSize(Math.max(snapshot.bytes, summary.bytes));
  document.querySelector("#continuity-last-backup").textContent = formatDateTime(meta.lastBackupAt);

  const badge = document.querySelector("#continuity-health-badge");
  const health = document.querySelector("#continuity-health");
  if (snapshot.invalidKeys.length) {
    badge.textContent = "Requiere revisión";
    badge.className = "status danger";
    health.dataset.state = "error";
    health.textContent = `Hay ${snapshot.invalidKeys.length} colección(es) locales dañadas. No exportes hasta restablecer o revisar el piloto.`;
    exportButton.disabled = true;
    return;
  }
  exportButton.disabled = false;
  if (snapshot.backend !== "localStorage") {
    badge.textContent = "Persistencia limitada";
    badge.className = "status warning";
    health.dataset.state = "warning";
    health.textContent = "El navegador está usando memoria temporal total o parcialmente. Descarga un respaldo antes de cerrar esta pestaña.";
    return;
  }
  badge.textContent = "Datos legibles";
  badge.className = "status success";
  health.dataset.state = "success";
  health.textContent = meta.lastBackupAt
    ? `El almacenamiento local se puede leer. Última copia descargada: ${formatDateTime(meta.lastBackupAt)}.`
    : "El almacenamiento local se puede leer, pero todavía no existe una copia descargada.";
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
    updateContinuityMeta({ lastBackupAt: exportedAt.toISOString(), lastBackupFilename: filename });
    const snapshot = snapshotStorage();
    if (snapshot.invalidKeys.length) throw new Error("Existen colecciones dañadas y el respaldo fue bloqueado.");
    const envelope = createBackupEnvelope(snapshot.entries, {
      namespace: APP_CONFIG.storageNamespace,
      appVersion: APP_CONFIG.version,
      exportedAt: exportedAt.toISOString(),
    });
    downloadTextFile(serializeBackup(envelope), filename);
    setStatus("#continuity-status", `Respaldo descargado: ${filename}.`, "success");
    showToast({ message: "Respaldo local descargado.", state: "success" });
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
  document.querySelector("#backup-preview").hidden = true;
  document.querySelector("#backup-preview-title").textContent = "";
  document.querySelector("#backup-preview-detail").textContent = "";
}

async function inspectSelectedBackup() {
  clearBackupPreview();
  setStatus("#continuity-status", "", "info");
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    const envelope = parseBackupText(await file.text(), { expectedNamespace: APP_CONFIG.storageNamespace });
    const summary = summarizeBackupEntries(envelope.entries);
    pendingBackup = { envelope, fileName: file.name, summary };
    document.querySelector("#backup-preview-title").textContent = file.name;
    document.querySelector("#backup-preview-detail").textContent = `${summary.collections} colecciones · ${summary.estimatedRecords} registros estimados · exportado ${formatDateTime(envelope.exportedAt)}.`;
    document.querySelector("#backup-preview").hidden = false;
    importButton.disabled = false;
    setStatus("#continuity-status", "Archivo compatible. Revisa el resumen antes de restaurar.", "success");
  } catch (error) {
    setStatus("#continuity-status", error.message, "error");
  }
}

async function importBackup() {
  if (!pendingBackup) return;
  const accepted = await confirmAction({
    title: "¿Restaurar este respaldo?",
    message: "Los datos actuales de este navegador serán reemplazados por el contenido del archivo.",
    detail: `${pendingBackup.fileName} · ${pendingBackup.summary.collections} colecciones · ${pendingBackup.summary.estimatedRecords} registros estimados.`,
    confirmLabel: "Sí, restaurar",
    cancelLabel: "Conservar datos actuales",
    tone: "danger",
  });
  if (!accepted) return;

  setButtonPending(importButton, true, "Restaurando…");
  try {
    replaceStorageSnapshot(pendingBackup.envelope.entries);
    const importedMeta = continuityMeta();
    updateContinuityMeta({
      ...importedMeta,
      lastRestoreAt: new Date().toISOString(),
      restoredFrom: pendingBackup.fileName,
      restoredExportedAt: pendingBackup.envelope.exportedAt,
    });
    business = readStorage("business", DEFAULT_BUSINESS);
    fillForm();
    renderPreview();
    clearBackupPreview();
    fileInput.value = "";
    renderContinuity();
    setStatus("#continuity-status", "Respaldo restaurado. Revisa la configuración antes de continuar.", "success");
    showToast({ message: "Datos restaurados desde el respaldo.", state: "success", duration: 8000 });
  } catch (error) {
    setStatus("#continuity-status", error.message, "error");
    showToast({ message: error.message, state: "error" });
  } finally {
    setButtonPending(importButton, false);
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
