import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage, snapshotStorage } from "../core/storage.js";
import { initialOrders, products } from "../data/demo-data.js";
import { initialInventoryLots, initialPurchases } from "../data/operations-demo.js";
import { initialCustomers, initialDailyTransactions, initialLedgerEntries } from "../data/receivables-demo.js";
import { auditDataIntegrity } from "../domain/data-integrity.js";
import { inventorySummary } from "../domain/inventory.js";
import { chooseOperatorRecommendation, operatorTaskGroups } from "../domain/operator-guidance.js";
import { buildOperatorReadiness, normalizeResumeTarget } from "../domain/operator-readiness.js";
import { buildReceivablesSummary } from "../domain/receivables.js";
import { OPERATOR_TASKS, operatorTaskById, operatorTaskSearch } from "../domain/operator-tasks.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const orders = readStorage("orders", initialOrders);
const lots = readStorage("inventory-lots", initialInventoryLots);
const closes = readStorage("daily-closes", []);
const purchases = readStorage("purchase-orders", initialPurchases);
const waste = readStorage("waste", []);
const customers = readStorage("credit-customers", initialCustomers);
const entries = readStorage("credit-ledger", initialLedgerEntries);
const transactions = readStorage("daily-transactions", initialDailyTransactions);
const continuityMeta = readStorage("continuity-meta", {});
const visitedPages = readStorage("visited-operator-pages-v1", []);
const lastRoute = readStorage("last-operator-route", null);
const receivables = buildReceivablesSummary(customers, entries);
const localSnapshot = snapshotStorage();
const baseIntegrityReport = auditDataIntegrity(localSnapshot.entries, { products });
const integrityReport = localSnapshot.invalidKeys.length
  ? {
    ...baseIntegrityReport,
    status: "blocked",
    counts: {
      ...baseIntegrityReport.counts,
      critical: baseIntegrityReport.counts.critical + localSnapshot.invalidKeys.length,
    },
  }
  : baseIntegrityReport;
let activeGroup = "all";

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 20) return "Buenas tardes";
  return "Buenas noches";
}

function applyBusiness() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
  document.querySelector("#operator-greeting").textContent = `${greeting()}. ¿Qué necesitas hacer?`;
}

function renderMetrics() {
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  const today = todayISO();
  const todayMovements = [
    ...entries.filter((entry) => String(entry.occurredAt).startsWith(today)),
    ...transactions.filter((transaction) => String(transaction.createdAt).startsWith(today)),
  ];
  document.querySelector("#home-active-orders").textContent = activeOrders.length;
  document.querySelector("#home-pending-weight").textContent = activeOrders.filter((order) => order.status === "pending_weighing").length;
  document.querySelector("#home-outstanding").textContent = formatCLP(receivables.totalOutstanding);
  document.querySelector("#home-movements").textContent = todayMovements.length;
}

function taskCard(task) {
  const link = document.createElement("a");
  link.className = `operator-task operator-task-${task.tone}`;
  link.href = task.href;
  link.dataset.taskId = task.id;
  link.innerHTML = `
    <span class="operator-task-icon" aria-hidden="true"></span>
    <div><h2></h2><p></p></div>
    <span class="operator-task-arrow" aria-hidden="true">→</span>`;
  link.querySelector(".operator-task-icon").textContent = task.icon;
  link.querySelector("h2").textContent = task.title;
  link.querySelector("p").textContent = task.description;
  return link;
}

function filteredTasks() {
  const query = document.querySelector("#task-search").value;
  return operatorTaskSearch(query).filter((task) => activeGroup === "all" || task.group === activeGroup);
}

function renderTasks() {
  const tasks = filteredTasks();
  const { frequent, secondary } = operatorTaskGroups(tasks);
  const frequentContainer = document.querySelector("#operator-tasks");
  const secondaryContainer = document.querySelector("#operator-more-tasks");
  frequentContainer.replaceChildren(...frequent.map(taskCard));
  secondaryContainer.replaceChildren(...secondary.map(taskCard));
  document.querySelector("#frequent-task-count").textContent = `${frequent.length} acción${frequent.length === 1 ? "" : "es"}`;
  document.querySelector("#secondary-task-label").hidden = secondary.length === 0;
  secondaryContainer.hidden = secondary.length === 0;
  document.querySelector("#task-empty").hidden = tasks.length > 0;
}

function userActivityCount() {
  return Math.max(0, entries.length - initialLedgerEntries.length)
    + Math.max(0, transactions.length - initialDailyTransactions.length)
    + Math.max(0, purchases.length - initialPurchases.length)
    + waste.length
    + closes.length;
}

function renderRecommendation() {
  const recommendation = chooseOperatorRecommendation({
    orders,
    inventorySummary: inventorySummary(lots),
    integritySummary: integrityReport,
    closes,
    outstanding: receivables.totalOutstanding,
    activityCount: userActivityCount(),
    lastBackupAt: continuityMeta.lastBackupAt,
    now: new Date(),
  });
  const task = operatorTaskById(recommendation.taskId) ?? OPERATOR_TASKS[0];
  const container = document.querySelector("#operator-recommendation");
  container.dataset.urgency = recommendation.urgency;
  container.querySelector(".operator-recommendation-icon").textContent = task.icon;
  document.querySelector("#recommendation-title").textContent = task.title;
  document.querySelector("#recommendation-reason").textContent = recommendation.reason;
  const action = document.querySelector("#recommendation-action");
  action.href = task.href;
  action.textContent = `Ir a ${task.shortTitle.toLocaleLowerCase("es")}`;
}

function renderAssistantSummary() {
  const container = document.querySelector("#home-assistant-summary");
  const top = receivables.topDebtor;
  container.replaceChildren();
  const strong = document.createElement("strong");
  const span = document.createElement("span");
  if (!receivables.totalOutstanding) {
    strong.textContent = "Las cuentas están al día.";
    span.textContent = "No hay deuda pendiente registrada.";
    container.append(strong, span);
    return;
  }
  strong.textContent = `Hay ${formatCLP(receivables.totalOutstanding)} por cobrar.`;
  span.textContent = top
    ? `${top.name} mantiene el saldo más alto. Puedes revisar o registrar un abono desde Fiados.`
    : "Revisa las cuentas pendientes desde el libro digital.";
  const link = document.createElement("a");
  link.className = "button secondary";
  link.href = "cuentas.html?task=payment#ledger-form";
  link.textContent = "Registrar un abono";
  container.append(strong, span, link);
}

function relativeVisit(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Puedes volver directamente a esa pantalla.";
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  const formatter = new Intl.RelativeTimeFormat("es", { numeric: "auto" });
  if (Math.abs(minutes) < 60) return `Visitada ${formatter.format(minutes, "minute")}.`;
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return `Visitada ${formatter.format(hours, "hour")}.`;
  return `Visitada ${formatter.format(Math.round(hours / 24), "day")}.`;
}

function renderResume() {
  const card = document.querySelector("#resume-card");
  const target = normalizeResumeTarget(lastRoute);
  if (!target) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  document.querySelector("#resume-title").textContent = target.label;
  document.querySelector("#resume-detail").textContent = relativeVisit(target.visitedAt);
  const action = document.querySelector("#resume-action");
  action.href = target.href;
  action.textContent = `Volver a ${target.label.toLocaleLowerCase("es")}`;
}

function renderReadiness() {
  const readiness = buildOperatorReadiness({
    business,
    defaultBusiness: DEFAULT_BUSINESS,
    visitedPages,
    continuityMeta,
  });
  document.querySelector("#readiness-count").textContent = `${readiness.completed}/${readiness.total}`;
  const progress = document.querySelector("#readiness-progress");
  progress.style.width = `${readiness.percent}%`;
  progress.parentElement.setAttribute("aria-valuenow", String(readiness.percent));
  document.querySelector("#readiness-summary").textContent = readiness.ready
    ? "La puesta en marcha local está completa. El siguiente paso es validar el piloto en el dispositivo real."
    : `Completa ${readiness.total - readiness.completed} paso(s) para dejar preparado este navegador.`;

  const list = document.querySelector("#readiness-list");
  list.replaceChildren();
  readiness.items.forEach((item) => {
    const entry = document.createElement("li");
    entry.className = item.complete ? "complete" : "pending";
    const link = document.createElement("a");
    link.href = item.href;
    link.innerHTML = `<span class="readiness-check" aria-hidden="true"></span><span><strong></strong><small></small></span><b aria-hidden="true">→</b>`;
    link.querySelector(".readiness-check").textContent = item.complete ? "✓" : "○";
    link.querySelector("strong").textContent = item.label;
    link.querySelector("small").textContent = item.description;
    entry.append(link);
    list.append(entry);
  });
}

function bindControls() {
  document.querySelector("#task-search").addEventListener("input", renderTasks);
  document.querySelectorAll(".task-filter").forEach((button) => {
    button.addEventListener("click", () => {
      activeGroup = button.dataset.group;
      document.querySelectorAll(".task-filter").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
      renderTasks();
    });
  });
}

applyBusiness();
renderMetrics();
renderRecommendation();
renderTasks();
renderAssistantSummary();
renderResume();
renderReadiness();
bindControls();
