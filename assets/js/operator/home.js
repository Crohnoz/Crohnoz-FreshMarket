import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage } from "../core/storage.js";
import { initialOrders } from "../data/demo-data.js";
import { initialInventoryLots } from "../data/operations-demo.js";
import { initialCustomers, initialDailyTransactions, initialLedgerEntries } from "../data/receivables-demo.js";
import { inventorySummary } from "../domain/inventory.js";
import { chooseOperatorRecommendation, operatorTaskGroups } from "../domain/operator-guidance.js";
import { buildReceivablesSummary } from "../domain/receivables.js";
import { OPERATOR_TASKS, operatorTaskById, operatorTaskSearch } from "../domain/operator-tasks.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const orders = readStorage("orders", initialOrders);
const lots = readStorage("inventory-lots", initialInventoryLots);
const closes = readStorage("daily-closes", []);
const customers = readStorage("credit-customers", initialCustomers);
const entries = readStorage("credit-ledger", initialLedgerEntries);
const transactions = readStorage("daily-transactions", initialDailyTransactions);
const receivables = buildReceivablesSummary(customers, entries);
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

function renderRecommendation() {
  const recommendation = chooseOperatorRecommendation({
    orders,
    inventorySummary: inventorySummary(lots),
    closes,
    outstanding: receivables.totalOutstanding,
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
bindControls();
