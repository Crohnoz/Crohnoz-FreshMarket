import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { initialCustomers, initialDailyTransactions, initialLedgerEntries } from "../data/receivables-demo.js";
import {
  buildReceivablesSummary,
  calculateTransactionTotal,
  createAssistantReport,
  customerBalance,
  parseNotebookText,
} from "../domain/receivables.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let customers = readStorage("credit-customers", initialCustomers);
let entries = readStorage("credit-ledger", initialLedgerEntries);
let transactions = readStorage("daily-transactions", initialDailyTransactions);
let importCandidates = [];

function persist() {
  writeStorage("credit-customers", customers);
  writeStorage("credit-ledger", entries);
  writeStorage("daily-transactions", transactions);
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fillCustomerSelects() {
  ["#ledger-customer", "#credit-customer"].forEach((selector) => {
    const select = document.querySelector(selector);
    const selected = select.value;
    select.replaceChildren();
    [...customers].sort((a, b) => a.name.localeCompare(b.name, "es")).forEach((customer) => {
      const option = document.createElement("option");
      option.value = customer.id;
      option.textContent = customer.name;
      select.append(option);
    });
    if ([...select.options].some((option) => option.value === selected)) select.value = selected;
  });
}

function renderMetrics() {
  const summary = buildReceivablesSummary(customers, entries);
  document.querySelector("#metric-outstanding").textContent = formatCLP(summary.totalOutstanding);
  document.querySelector("#metric-debtors").textContent = summary.debtorCount;
  document.querySelector("#metric-average").textContent = formatCLP(summary.averageDebt);
  const today = todayISO();
  document.querySelector("#metric-today").textContent = [
    ...entries.filter((entry) => String(entry.occurredAt).startsWith(today)),
    ...transactions.filter((transaction) => String(transaction.createdAt).startsWith(today)),
  ].length;
}

function renderCustomers() {
  const list = document.querySelector("#customer-list");
  list.replaceChildren();
  const ordered = [...customers].sort(
    (a, b) => customerBalance(entries, b.id) - customerBalance(entries, a.id),
  );
  ordered.forEach((customer) => {
    const balance = Math.max(0, customerBalance(entries, customer.id));
    const row = document.createElement("article");
    row.className = "customer-row";
    row.innerHTML = `<div><strong></strong><small></small></div><strong class="${balance ? "balance-positive" : "balance-zero"}"></strong><button class="button small secondary" type="button">Registrar abono</button>`;
    row.querySelector("div strong").textContent = customer.name;
    row.querySelector("small").textContent = customer.phone || customer.notes || "Sin teléfono registrado";
    row.querySelector(".balance-positive, .balance-zero").textContent = formatCLP(balance);
    row.querySelector("button").addEventListener("click", () => {
      document.querySelector("#ledger-customer").value = customer.id;
      document.querySelector("#ledger-form [name=type]").value = "payment";
      document.querySelector("#ledger-form [name=amount]").focus();
    });
    list.append(row);
  });
}

function renderAssistant() {
  const report = createAssistantReport(customers, entries);
  const container = document.querySelector("#assistant-report");
  container.replaceChildren();
  const card = document.createElement("div");
  const summary = buildReceivablesSummary(customers, entries);
  card.innerHTML = `<strong></strong><ul></ul>`;
  card.querySelector("strong").textContent = report.headline.replace(
    String(summary.totalOutstanding),
    formatCLP(summary.totalOutstanding),
  );
  report.observations.forEach((observation) => {
    const li = document.createElement("li");
    li.textContent = observation.replace(String(summary.averageDebt), formatCLP(summary.averageDebt));
    card.querySelector("ul").append(li);
  });
  container.append(card);
}

function renderDailyLog() {
  const container = document.querySelector("#daily-log");
  container.replaceChildren();
  [...transactions].reverse().slice(0, 8).forEach((transaction) => {
    const article = document.createElement("article");
    article.innerHTML = `<div><strong></strong><small></small></div><strong></strong>`;
    article.querySelector("div strong").textContent = transaction.counterparty;
    article.querySelector("small").textContent = `${transaction.type === "sale" ? "Venta" : "Compra"} · ${transaction.settlement} · ${transaction.lines.length} ítems`;
    article.querySelector(":scope > strong").textContent = formatCLP(transaction.total);
    container.append(article);
  });
}

function addTransactionLine(defaults = {}) {
  const row = document.createElement("div");
  row.className = "transaction-line";
  row.innerHTML = `
    <label>Producto<input name="product" maxlength="80" required></label>
    <label>Cantidad<input name="quantity" type="number" min="0.001" step="0.001" inputmode="decimal" required></label>
    <label>Precio unitario<input name="unitPrice" type="number" min="0" step="1" inputmode="numeric" required></label>
    <button class="button small secondary" type="button">Quitar</button>`;
  row.querySelector("[name=product]").value = defaults.product ?? "";
  row.querySelector("[name=quantity]").value = defaults.quantity ?? 1;
  row.querySelector("[name=unitPrice]").value = defaults.unitPrice ?? 0;
  row.querySelectorAll("input").forEach((input) => input.addEventListener("input", renderTransactionTotal));
  row.querySelector("button").addEventListener("click", () => {
    if (document.querySelectorAll(".transaction-line").length > 1) row.remove();
    renderTransactionTotal();
  });
  document.querySelector("#transaction-lines").append(row);
  renderTransactionTotal();
}

function readTransactionLines() {
  return [...document.querySelectorAll(".transaction-line")].map((row) => ({
    product: row.querySelector("[name=product]").value.trim(),
    quantity: Number(row.querySelector("[name=quantity]").value),
    unitPrice: Number(row.querySelector("[name=unitPrice]").value),
  }));
}

function renderTransactionTotal() {
  try {
    document.querySelector("#transaction-total").textContent = formatCLP(calculateTransactionTotal(readTransactionLines()));
  } catch {
    document.querySelector("#transaction-total").textContent = "$0";
  }
}

function registerLedgerMovement(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const amount = Math.round(Number(form.amount.value));
  if (!Number.isFinite(amount) || amount <= 0) return;
  entries.push({
    id: crypto.randomUUID(),
    customerId: form.customerId.value,
    type: form.type.value,
    amount,
    description: form.description.value.trim() || (form.type.value === "charge" ? "Fiado" : "Abono"),
    occurredAt: todayISO(),
    source: "manual",
  });
  form.reset();
  persist();
  renderAll();
}

function createCustomer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.name.value.trim();
  if (!name) return;
  customers.push({
    id: crypto.randomUUID(),
    name,
    phone: form.phone.value.trim(),
    notes: form.notes.value.trim(),
    creditLimit: 0,
  });
  form.reset();
  persist();
  renderAll();
}

function registerTransaction(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const lines = readTransactionLines();
  let total;
  try {
    total = calculateTransactionTotal(lines);
  } catch {
    return;
  }
  const transaction = {
    id: crypto.randomUUID(),
    type: form.type.value,
    counterparty: form.counterparty.value.trim(),
    settlement: form.settlement.value,
    customerId: form.customerId.value || null,
    lines,
    total,
    createdAt: new Date().toISOString(),
  };
  transactions.push(transaction);
  if (transaction.type === "sale" && transaction.settlement === "credit" && transaction.customerId) {
    entries.push({
      id: crypto.randomUUID(),
      customerId: transaction.customerId,
      type: "charge",
      amount: total,
      description: `Venta fiada: ${lines.map((line) => line.product).join(", ")}`,
      occurredAt: todayISO(),
      source: "daily-transaction",
      referenceId: transaction.id,
    });
  }
  form.reset();
  document.querySelector("#transaction-lines").replaceChildren();
  addTransactionLine();
  persist();
  renderAll();
}

function toggleCreditCustomer() {
  const credit = document.querySelector("#settlement").value === "credit";
  document.querySelector("#credit-customer-label").hidden = !credit;
  document.querySelector("#credit-customer").required = credit;
}

function previewPhoto(event) {
  const file = event.target.files?.[0];
  const preview = document.querySelector("#photo-preview");
  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    return;
  }
  preview.src = URL.createObjectURL(file);
  preview.hidden = false;
}

function analyzeImport(event) {
  event.preventDefault();
  importCandidates = parseNotebookText(document.querySelector("#notebook-text").value);
  const container = document.querySelector("#import-results");
  container.replaceChildren();
  importCandidates.forEach((candidate, index) => {
    const row = document.createElement("label");
    row.className = "import-candidate";
    row.innerHTML = `<input type="checkbox"><div><strong></strong><small></small></div><span></span><b></b>`;
    const checkbox = row.querySelector("input");
    checkbox.dataset.index = index;
    checkbox.checked = candidate.valid;
    checkbox.disabled = !candidate.valid;
    row.querySelector("strong").textContent = candidate.valid ? candidate.name : `Línea ${candidate.line}`;
    row.querySelector("small").textContent = candidate.raw;
    row.querySelector("span").textContent = candidate.valid ? (candidate.type === "payment" ? "Abono" : "Fiado") : candidate.reason;
    row.querySelector("b").textContent = candidate.amount ? formatCLP(candidate.amount) : "Revisar";
    container.append(row);
  });
  document.querySelector("#confirm-import").hidden = !importCandidates.some((candidate) => candidate.valid);
}

function findOrCreateCustomer(name) {
  const normalized = name.toLocaleLowerCase("es").trim();
  let customer = customers.find((item) => item.name.toLocaleLowerCase("es").trim() === normalized);
  if (!customer) {
    customer = { id: crypto.randomUUID(), name, phone: "", notes: "Importado desde cuaderno", creditLimit: 0 };
    customers.push(customer);
  }
  return customer;
}

function confirmImport() {
  document.querySelectorAll(".import-candidate input:checked").forEach((checkbox) => {
    const candidate = importCandidates[Number(checkbox.dataset.index)];
    if (!candidate?.valid) return;
    const customer = findOrCreateCustomer(candidate.name);
    entries.push({
      id: crypto.randomUUID(),
      customerId: customer.id,
      type: candidate.type,
      amount: candidate.amount,
      description: "Importado desde transcripción del cuaderno",
      occurredAt: todayISO(),
      source: "notebook-import",
      rawText: candidate.raw,
    });
  });
  persist();
  importCandidates = [];
  document.querySelector("#import-results").replaceChildren();
  document.querySelector("#confirm-import").hidden = true;
  document.querySelector("#notebook-text").value = "";
  renderAll();
}

function renderAll() {
  fillCustomerSelects();
  renderMetrics();
  renderCustomers();
  renderAssistant();
  renderDailyLog();
  toggleCreditCustomer();
}

applyTheme();
addTransactionLine({ product: "Tomate", quantity: 5, unitPrice: 1490 });
renderAll();
document.querySelector("#ledger-form").addEventListener("submit", registerLedgerMovement);
document.querySelector("#customer-form").addEventListener("submit", createCustomer);
document.querySelector("#transaction-form").addEventListener("submit", registerTransaction);
document.querySelector("#add-line").addEventListener("click", () => addTransactionLine());
document.querySelector("#settlement").addEventListener("change", toggleCreditCustomer);
document.querySelector("#notebook-photo").addEventListener("change", previewPhoto);
document.querySelector("#import-form").addEventListener("submit", analyzeImport);
document.querySelector("#confirm-import").addEventListener("click", confirmImport);
