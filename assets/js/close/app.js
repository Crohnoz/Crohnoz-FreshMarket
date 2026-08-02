import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { initialCustomers, initialDailyTransactions, initialLedgerEntries } from "../data/receivables-demo.js";
import { products } from "../data/demo-data.js";
import {
  buildCashReconciliation,
  canSaveDailyClose,
  createDailyCloseAssistant,
  formatWasteQuantities,
  localDateKey,
  summarizeDailyOperations,
} from "../domain/daily-close.js";
import { speakText } from "../assistant/speech.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const transactions = readStorage("daily-transactions", initialDailyTransactions);
const customers = readStorage("credit-customers", initialCustomers);
let ledgerEntries = readStorage("credit-ledger", initialLedgerEntries);
const waste = readStorage("waste", []);
let savedCloses = readStorage("daily-closes", []);

const productMeta = Object.fromEntries(products.map((product) => [product.id, {
  unitCost: product.cost ?? 0,
  unit: product.baseUnit,
}]));
const form = document.querySelector("#close-form");
const dateInput = document.querySelector("#close-date");
const saveButton = document.querySelector("#save-close");
const statusRegion = document.querySelector("#close-save-status");
let currentSummary = null;
let currentReconciliation = null;
let currentReport = null;

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function announce(message, state = "success") {
  statusRegion.textContent = message;
  statusRegion.dataset.state = state;
}

function numberField(name) {
  const value = form.elements[name].value;
  return value === "" ? 0 : Number(value);
}

function countedCashValue() {
  const value = form.elements.countedCash.value;
  return value === "" ? null : Number(value);
}

function readChecklist() {
  return {
    salesRecorded: form.elements.salesRecorded.checked,
    expensesRecorded: form.elements.expensesRecorded.checked,
    cashCounted: form.elements.cashCounted.checked,
  };
}

function enrichedWaste() {
  return waste.map((item) => ({
    ...item,
    unit: item.unit ?? productMeta[item.productId]?.unit ?? "kg",
    unitCost: item.unitCost ?? productMeta[item.productId]?.unitCost ?? 0,
  }));
}

function stateLabel(status) {
  return ({
    pending_count: "Falta contar la caja",
    balanced: "Caja dentro de tolerancia",
    review: "Revisar diferencia",
  })[status] ?? "Pendiente de revisión";
}

function setCloseState() {
  const state = document.querySelector("#close-state");
  if (currentSummary.unclassifiedPayments.length) {
    state.textContent = "Clasifica los abonos";
    state.className = "status warning";
    return;
  }
  state.textContent = stateLabel(currentReconciliation.status);
  state.className = `status ${currentReconciliation.status === "balanced" ? "success" : "warning"}`;
}

function breakdownRow(title, detail, amount, emphasis = false) {
  const row = document.createElement("article");
  row.className = `breakdown-row${emphasis ? " emphasis" : ""}`;
  row.innerHTML = `<div><strong></strong><small></small></div><strong></strong>`;
  row.querySelector("div strong").textContent = title;
  row.querySelector("small").textContent = detail;
  row.querySelector(":scope > strong").textContent = formatCLP(amount);
  return row;
}

function renderBreakdown() {
  const container = document.querySelector("#close-breakdown");
  container.replaceChildren(
    breakdownRow("Ventas en efectivo", `${currentSummary.sales.count} venta(s) total(es) en distintos medios`, currentSummary.sales.cash, true),
    breakdownRow("Ventas por transferencia", "Se informan, pero no entran a la caja física", currentSummary.sales.transfer),
    breakdownRow("Ventas fiadas", "Aumentan las cuentas por cobrar", currentSummary.sales.credit),
    breakdownRow("Fiados anotados sin venta", `${currentSummary.manualCreditChargeCount} movimiento(s) manual(es)`, currentSummary.manualCreditCharges),
    breakdownRow("Abonos en efectivo", "Sí aumentan la caja esperada", currentSummary.payments.cash, true),
    breakdownRow("Abonos por transferencia", "Reducen deuda, pero no aumentan la caja física", currentSummary.payments.transfer),
    breakdownRow("Compras en efectivo", "Se descuentan de la caja esperada", currentSummary.purchases.cash),
    breakdownRow("Compras por transferencia", "No afectan el efectivo contado", currentSummary.purchases.transfer),
    breakdownRow("Merma estimada", `${formatWasteQuantities(currentSummary.waste)} en ${currentSummary.waste.count} registro(s)`, currentSummary.waste.estimatedCost),
  );
}

function renderMetrics() {
  document.querySelector("#close-sales").textContent = formatCLP(currentSummary.sales.total);
  document.querySelector("#close-sales-count").textContent = `${currentSummary.sales.count} operación(es) de venta`;
  document.querySelector("#close-credit").textContent = formatCLP(currentSummary.creditGenerated);
  document.querySelector("#close-payments").textContent = formatCLP(currentSummary.payments.total);
  document.querySelector("#close-payments-detail").textContent = `${formatCLP(currentSummary.payments.cash)} efectivo · ${formatCLP(currentSummary.payments.transfer)} transferencia`;
  document.querySelector("#close-expected").textContent = formatCLP(currentReconciliation.expectedCash);
  document.querySelector("#formula-result").textContent = formatCLP(currentReconciliation.expectedCash);
  const difference = document.querySelector("#close-difference");
  const detail = document.querySelector("#close-difference-detail");
  if (currentReconciliation.difference === null) {
    difference.textContent = "—";
    detail.textContent = "Falta contar la caja";
    return;
  }
  const sign = currentReconciliation.difference > 0 ? "+" : "";
  difference.textContent = `${sign}${formatCLP(currentReconciliation.difference)}`;
  detail.textContent = currentReconciliation.status === "balanced"
    ? "Dentro de la tolerancia"
    : currentReconciliation.difference > 0
      ? "Hay más efectivo de lo esperado"
      : "Falta efectivo respecto del registro";
}

function customerName(customerId) {
  return customers.find((customer) => customer.id === customerId)?.name ?? "Persona sin identificar";
}

function classifyPayment(entryId, settlement) {
  if (!["cash", "transfer"].includes(settlement)) return;
  const entry = ledgerEntries.find((item) => item.id === entryId);
  if (!entry) return;
  entry.settlement = settlement;
  writeStorage("credit-ledger", ledgerEntries);
  announce("Abono clasificado. La caja fue recalculada.", "success");
  recalculate();
}

function renderUnclassified() {
  const panel = document.querySelector("#unclassified-panel");
  const list = document.querySelector("#unclassified-list");
  list.replaceChildren();
  panel.hidden = currentSummary.unclassifiedPayments.length === 0;
  currentSummary.unclassifiedPayments.forEach((entry) => {
    const row = document.createElement("article");
    row.className = "unclassified-row";
    row.innerHTML = `
      <div><strong></strong><small></small></div>
      <label>Medio de pago<select><option value="">Seleccionar</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option></select></label>
      <button class="button secondary" type="button" disabled>Aplicar</button>`;
    row.querySelector("strong").textContent = `${customerName(entry.customerId)} · ${formatCLP(entry.amount)}`;
    row.querySelector("small").textContent = entry.description || "Abono sin detalle";
    const select = row.querySelector("select");
    const button = row.querySelector("button");
    select.addEventListener("change", () => { button.disabled = !select.value; });
    button.addEventListener("click", () => classifyPayment(entry.id, select.value));
    list.append(row);
  });
}

function assistantObservations() {
  const parts = [
    `Las ventas del día suman ${formatCLP(currentSummary.sales.total)}.`,
    `En efectivo entraron ${formatCLP(currentSummary.sales.cash + currentSummary.payments.cash)} por ventas y abonos.`,
  ];
  if (currentSummary.sales.transfer || currentSummary.payments.transfer) {
    parts.push(`Se registraron ${formatCLP(currentSummary.sales.transfer + currentSummary.payments.transfer)} por transferencia.`);
  }
  if (currentSummary.creditGenerated) {
    parts.push(`Se generaron ${formatCLP(currentSummary.creditGenerated)} en nuevas cuentas por cobrar.`);
  }
  if (currentSummary.purchases.total) {
    parts.push(`Las compras registradas suman ${formatCLP(currentSummary.purchases.total)}.`);
  }
  if (currentSummary.waste.count) {
    parts.push(`La merma registrada corresponde a ${formatWasteQuantities(currentSummary.waste)}, con costo estimado de ${formatCLP(currentSummary.waste.estimatedCost)}.`);
  }
  return parts;
}

function formattedWarnings() {
  return currentReport.warnings.map((warning) => {
    if (currentReconciliation.difference === null) return warning;
    return warning.replace(
      String(Math.abs(currentReconciliation.difference)),
      formatCLP(Math.abs(currentReconciliation.difference)),
    );
  });
}

function assistantText() {
  const parts = [currentReport.headline, ...assistantObservations()];
  if (currentReconciliation.countedCash === null) {
    parts.push("Todavía falta ingresar el efectivo contado.");
  } else {
    parts.push(`Se contaron ${formatCLP(currentReconciliation.countedCash)}.`);
    parts.push(currentReconciliation.difference === 0
      ? "No existe diferencia de caja."
      : `La diferencia es de ${formatCLP(currentReconciliation.difference)}.`);
  }
  formattedWarnings().forEach((warning) => parts.push(`Atención: ${warning}`));
  return parts.join(" ");
}

function renderAssistant() {
  const container = document.querySelector("#close-assistant");
  container.replaceChildren();
  const headline = document.createElement("strong");
  headline.className = "close-assistant-headline";
  headline.textContent = currentReport.headline;
  const list = document.createElement("ul");
  assistantObservations().forEach((observation) => {
    const item = document.createElement("li");
    item.textContent = observation;
    list.append(item);
  });
  const warnings = document.createElement("div");
  warnings.className = "close-assistant-warnings";
  formattedWarnings().forEach((warning) => {
    const item = document.createElement("div");
    item.className = "close-assistant-warning";
    item.textContent = warning;
    warnings.append(item);
  });
  container.append(headline, list, warnings);
}

function formatCloseDate(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return Number.isFinite(year)
    ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium" }).format(new Date(year, month - 1, day))
    : dateKey;
}

function renderSavedCloses() {
  const container = document.querySelector("#saved-closes");
  container.replaceChildren();
  if (!savedCloses.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Todavía no hay cierres guardados en este navegador.";
    container.append(empty);
    return;
  }
  [...savedCloses].sort((a, b) => b.dateKey.localeCompare(a.dateKey)).slice(0, 6).forEach((close) => {
    const row = document.createElement("article");
    row.className = "saved-close-row";
    row.innerHTML = `<div><strong></strong><small></small></div><b></b>`;
    row.querySelector("strong").textContent = formatCloseDate(close.dateKey);
    row.querySelector("small").textContent = `Esperado ${formatCLP(close.reconciliation.expectedCash)} · contado ${formatCLP(close.reconciliation.countedCash)}`;
    const state = row.querySelector("b");
    state.dataset.state = close.reconciliation.status;
    state.textContent = close.reconciliation.difference === 0
      ? "Cuadrado"
      : `${close.reconciliation.difference > 0 ? "+" : ""}${formatCLP(close.reconciliation.difference)}`;
    container.append(row);
  });
}

function recalculate() {
  try {
    currentSummary = summarizeDailyOperations({
      transactions,
      ledgerEntries,
      waste: enrichedWaste(),
      dateKey: dateInput.value || localDateKey(),
    });
    currentReconciliation = buildCashReconciliation({
      summary: currentSummary,
      openingCash: numberField("openingCash"),
      countedCash: countedCashValue(),
      otherCashIn: numberField("otherCashIn"),
      cashExpenses: numberField("cashExpenses"),
      cashWithdrawals: numberField("cashWithdrawals"),
      tolerance: numberField("tolerance"),
    });
    currentReport = createDailyCloseAssistant(currentSummary, currentReconciliation);
    renderMetrics();
    renderBreakdown();
    renderUnclassified();
    renderAssistant();
    setCloseState();
    saveButton.disabled = !canSaveDailyClose({
      summary: currentSummary,
      reconciliation: currentReconciliation,
      checklist: readChecklist(),
    });
    if (statusRegion.dataset.state === "error") announce("", "");
  } catch (error) {
    saveButton.disabled = true;
    announce(error.message || "Revisa los montos ingresados.", "error");
  }
}

function resetFormForDate() {
  const existing = savedCloses.find((close) => close.dateKey === dateInput.value);
  form.elements.openingCash.value = existing?.reconciliation.openingCash ?? 20000;
  form.elements.countedCash.value = existing?.reconciliation.countedCash ?? "";
  form.elements.otherCashIn.value = existing?.reconciliation.otherCashIn ?? 0;
  form.elements.cashExpenses.value = existing?.reconciliation.cashExpenses ?? 0;
  form.elements.cashWithdrawals.value = existing?.reconciliation.cashWithdrawals ?? 0;
  form.elements.tolerance.value = existing?.tolerance ?? 100;
  form.elements.notes.value = existing?.notes ?? "";
  form.elements.salesRecorded.checked = existing?.checklist.salesRecorded ?? false;
  form.elements.expensesRecorded.checked = existing?.checklist.expensesRecorded ?? false;
  form.elements.cashCounted.checked = existing?.checklist.cashCounted ?? false;
  announce(existing
    ? "Este día ya tiene un cierre. Al guardar, se actualizará la copia local."
    : "", existing ? "warning" : "");
  recalculate();
}

function saveClose(event) {
  event.preventDefault();
  recalculate();
  const checklist = readChecklist();
  if (!canSaveDailyClose({ summary: currentSummary, reconciliation: currentReconciliation, checklist })) {
    announce("Falta clasificar movimientos, contar la caja o completar la lista de revisión.", "warning");
    return;
  }
  const snapshot = {
    id: savedCloses.find((item) => item.dateKey === dateInput.value)?.id ?? crypto.randomUUID(),
    dateKey: dateInput.value,
    savedAt: new Date().toISOString(),
    summary: currentSummary,
    reconciliation: currentReconciliation,
    checklist,
    tolerance: numberField("tolerance"),
    notes: form.elements.notes.value.trim(),
    assistant: currentReport,
    version: 2,
  };
  savedCloses = [...savedCloses.filter((item) => item.dateKey !== snapshot.dateKey), snapshot];
  writeStorage("daily-closes", savedCloses);
  announce(currentReconciliation.status === "balanced"
    ? "Cierre guardado. La caja quedó dentro de la tolerancia."
    : "Cierre guardado con una diferencia pendiente de revisión.",
  currentReconciliation.status === "balanced" ? "success" : "warning");
  renderSavedCloses();
}

async function copySummary() {
  try {
    await navigator.clipboard.writeText(assistantText());
    announce("Resumen copiado.", "success");
  } catch {
    announce("El navegador no permitió copiar automáticamente.", "warning");
  }
}

applyTheme();
dateInput.value = localDateKey();
resetFormForDate();
renderSavedCloses();
form.addEventListener("input", recalculate);
form.addEventListener("change", recalculate);
form.addEventListener("submit", saveClose);
dateInput.addEventListener("change", resetFormForDate);
document.querySelector("#recalculate-close").addEventListener("click", recalculate);
document.querySelector("#speak-close").addEventListener("click", () => {
  if (!speakText(assistantText())) announce("Este navegador no ofrece lectura en voz alta.", "warning");
});
document.querySelector("#copy-close").addEventListener("click", copySummary);
