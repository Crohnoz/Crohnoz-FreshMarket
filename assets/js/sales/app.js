import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP, formatQuantity } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { initialOrders } from "../data/demo-data.js";
import { initialCustomers, initialDailyTransactions, initialLedgerEntries } from "../data/receivables-demo.js";
import { initialOrderPayments } from "../data/operations-demo.js";
import { createReceiptText, nextOrderState, orderDifferenceSummary, orderLineTotal, orderTotal, paymentSummary } from "../domain/sales-flow.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let orders = readStorage("orders", initialOrders);
let payments = readStorage("order-payments", initialOrderPayments);
let transactions = readStorage("daily-transactions", initialDailyTransactions);
let customers = readStorage("credit-customers", initialCustomers);
let ledger = readStorage("credit-ledger", initialLedgerEntries);
let selectedOrderId = orders[0]?.id ?? null;

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}
function statusLabel(value) { return ({ pending_weighing: "Pendiente de pesar", preparing: "Preparando", pending_customer_confirmation: "Esperando cliente", confirmed: "Confirmado", ready: "Listo", delivering: "En reparto", delivered: "Entregado", cancelled: "Cancelado" })[value] ?? value; }
function settlementLabel(value) { return ({ cash: "Efectivo", transfer: "Transferencia", credit: "Fiado" })[value] ?? value; }
function selectedOrder() { return orders.find((order) => order.id === selectedOrderId) ?? null; }
function persist() { writeStorage("orders", orders); writeStorage("order-payments", payments); writeStorage("daily-transactions", transactions); writeStorage("credit-customers", customers); writeStorage("credit-ledger", ledger); }

function renderOrderList() {
  const container = document.querySelector("#sales-orders");
  const filter = document.querySelector("#sales-status-filter").value;
  container.replaceChildren();
  orders.filter((order) => !filter || order.status === filter).forEach((order) => {
    const total = orderTotal(order);
    const paid = paymentSummary(payments, order.id, total);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sales-order-row${order.id === selectedOrderId ? " selected" : ""}`;
    button.innerHTML = `<div><span></span><strong></strong><small></small></div><div><b></b><small></small></div>`;
    button.querySelector("span").textContent = order.id;
    button.querySelector("strong").textContent = order.customer;
    button.querySelector("div small").textContent = `${statusLabel(order.status)} · ${order.fulfillment}`;
    button.querySelector("b").textContent = formatCLP(total);
    button.querySelector("div:last-child small").textContent = paid.status === "paid" ? "Pagado" : `Pendiente ${formatCLP(paid.due)}`;
    button.addEventListener("click", () => { selectedOrderId = order.id; renderAll(); });
    container.append(button);
  });
}

function availableAction(order) {
  if (order.status === "pending_customer_confirmation") return { id: "confirm_difference", label: "Cliente confirma diferencia" };
  if (order.status === "confirmed") return { id: "mark_ready", label: "Marcar pedido listo" };
  if (order.status === "ready" && order.fulfillment === "Delivery") return { id: "start_delivery", label: "Iniciar reparto" };
  if (order.status === "delivering") return { id: "deliver", label: "Marcar entregado" };
  return null;
}

function renderDetail() {
  const order = selectedOrder();
  const empty = document.querySelector("#sales-empty");
  const detail = document.querySelector("#sales-detail");
  if (!order) { empty.hidden = false; detail.hidden = true; return; }
  empty.hidden = true; detail.hidden = false;
  const total = orderTotal(order);
  const paid = paymentSummary(payments, order.id, total);
  const difference = orderDifferenceSummary(order);
  document.querySelector("#sales-order-id").textContent = order.id;
  document.querySelector("#sales-customer").textContent = order.customer;
  document.querySelector("#sales-order-meta").textContent = `${order.fulfillment} · ${statusLabel(order.status)}`;
  document.querySelector("#sales-order-total").textContent = formatCLP(total);
  document.querySelector("#sales-order-paid").textContent = formatCLP(paid.paid);
  document.querySelector("#sales-order-due").textContent = formatCLP(paid.due);
  const lines = document.querySelector("#sales-lines");
  lines.replaceChildren();
  order.lines.forEach((line) => {
    const row = document.createElement("article");
    row.className = "sales-line";
    row.innerHTML = `<div><strong></strong><small></small></div><b></b>`;
    row.querySelector("strong").textContent = line.name;
    row.querySelector("small").textContent = `Solicitado ${formatQuantity(line.requestedQuantity, line.unit)} · real ${formatQuantity(Number.isFinite(Number(line.actualQuantity)) ? line.actualQuantity : line.requestedQuantity, line.unit)}`;
    row.querySelector("b").textContent = formatCLP(orderLineTotal(line));
    lines.append(row);
  });
  const warning = document.querySelector("#sales-confirmation-warning");
  warning.hidden = !difference.requiresConfirmation;
  warning.textContent = difference.requiresConfirmation ? `${difference.changedLines} línea(s) requieren confirmación explícita del cliente.` : "";
  const action = availableAction(order);
  const actionButton = document.querySelector("#sales-state-action");
  actionButton.hidden = !action;
  if (action) { actionButton.textContent = action.label; actionButton.dataset.action = action.id; }
  const paymentForm = document.querySelector("#order-payment-form");
  paymentForm.amount.value = paid.due;
  paymentForm.amount.max = paid.due;
  paymentForm.querySelector("button").disabled = paid.due <= 0;
  document.querySelector("#receipt-preview").value = createReceiptText({ businessName: business.name, order, payments });
}

function renderPayments() {
  const order = selectedOrder();
  const container = document.querySelector("#sales-payments");
  container.replaceChildren();
  if (!order) return;
  paymentSummary(payments, order.id, orderTotal(order)).payments.forEach((payment) => {
    const row = document.createElement("article");
    row.className = "payment-row";
    row.innerHTML = `<div><strong></strong><small></small></div><b></b>`;
    row.querySelector("strong").textContent = settlementLabel(payment.settlement);
    row.querySelector("small").textContent = new Date(payment.createdAt).toLocaleString("es-CL");
    row.querySelector("b").textContent = formatCLP(payment.amount);
    container.append(row);
  });
}
function renderAll() { renderOrderList(); renderDetail(); renderPayments(); }

function customerForOrder(order) {
  const normalized = order.customer.toLocaleLowerCase("es").trim();
  let customer = customers.find((item) => item.name.toLocaleLowerCase("es").trim() === normalized);
  if (!customer) { customer = { id: crypto.randomUUID(), name: order.customer, phone: "", notes: `Creado desde pedido ${order.id}`, creditLimit: 0 }; customers.push(customer); }
  return customer;
}

document.querySelector("#sales-status-filter").addEventListener("change", renderOrderList);
document.querySelector("#sales-state-action").addEventListener("click", (event) => {
  const order = selectedOrder();
  try { const updated = nextOrderState(order, event.currentTarget.dataset.action); orders = orders.map((item) => item.id === updated.id ? updated : item); persist(); renderAll(); }
  catch (error) { document.querySelector("#sales-status").textContent = error.message; }
});
document.querySelector("#order-payment-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const order = selectedOrder();
  const total = orderTotal(order);
  const before = paymentSummary(payments, order.id, total);
  const amount = Math.round(Number(event.currentTarget.amount.value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > before.due) { document.querySelector("#sales-status").textContent = "El pago debe ser mayor a cero y no superar el saldo."; return; }
  const settlement = event.currentTarget.settlement.value;
  const payment = { id: crypto.randomUUID(), orderId: order.id, amount, settlement, status: "confirmed", createdAt: new Date().toISOString() };
  payments.push(payment);
  const transaction = { id: crypto.randomUUID(), type: "sale", counterparty: order.customer, settlement, customerId: null, lines: [{ product: `Cobro ${order.id}`, quantity: 1, unitPrice: amount }], total: amount, createdAt: payment.createdAt, referenceId: payment.id, orderId: order.id };
  transactions.push(transaction);
  if (settlement === "credit") {
    const customer = customerForOrder(order);
    ledger.push({ id: crypto.randomUUID(), customerId: customer.id, type: "charge", amount, settlement: "credit", description: `Pedido ${order.id}`, occurredAt: payment.createdAt.slice(0, 10), source: "daily-transaction", referenceId: transaction.id });
  }
  persist();
  document.querySelector("#sales-status").textContent = "Pago registrado y comprobante actualizado.";
  renderAll();
});
document.querySelector("#copy-receipt").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(document.querySelector("#receipt-preview").value); document.querySelector("#sales-status").textContent = "Comprobante copiado."; }
  catch { document.querySelector("#sales-status").textContent = "El navegador no permitió copiar automáticamente."; }
});
applyTheme();
renderAll();
