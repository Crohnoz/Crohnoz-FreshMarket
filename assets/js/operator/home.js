import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage } from "../core/storage.js";
import { initialOrders } from "../data/demo-data.js";
import { initialCustomers, initialDailyTransactions, initialLedgerEntries } from "../data/receivables-demo.js";
import { buildReceivablesSummary } from "../domain/receivables.js";
import { OPERATOR_TASKS, operatorTaskSearch } from "../domain/operator-tasks.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const orders = readStorage("orders", initialOrders);
const customers = readStorage("credit-customers", initialCustomers);
const entries = readStorage("credit-ledger", initialLedgerEntries);
const transactions = readStorage("daily-transactions", initialDailyTransactions);
const receivables = buildReceivablesSummary(customers, entries);

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

function renderTasks(tasks = OPERATOR_TASKS) {
  const container = document.querySelector("#operator-tasks");
  container.replaceChildren();
  tasks.forEach((task) => container.append(taskCard(task)));
  document.querySelector("#task-empty").hidden = tasks.length > 0;
}

function renderAssistantSummary() {
  const container = document.querySelector("#home-assistant-summary");
  const top = receivables.topDebtor;
  if (!receivables.totalOutstanding) {
    container.innerHTML = "<strong>Las cuentas están al día.</strong><span>No hay deuda pendiente registrada.</span>";
    return;
  }
  container.replaceChildren();
  const strong = document.createElement("strong");
  strong.textContent = `Hay ${formatCLP(receivables.totalOutstanding)} por cobrar.`;
  const span = document.createElement("span");
  span.textContent = top
    ? `${top.name} mantiene el saldo más alto. Puedes revisar o registrar un abono desde Fiados.`
    : "Revisa las cuentas pendientes desde el libro digital.";
  const link = document.createElement("a");
  link.className = "button secondary";
  link.href = "cuentas.html?task=voice#voice-copilot";
  link.textContent = "Preguntarle al copiloto";
  container.append(strong, span, link);
}

function bindSearch() {
  const search = document.querySelector("#task-search");
  search.addEventListener("input", () => renderTasks(operatorTaskSearch(search.value)));
}

applyBusiness();
renderMetrics();
renderTasks();
renderAssistantSummary();
bindSearch();
