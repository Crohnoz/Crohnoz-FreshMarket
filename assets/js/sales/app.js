import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP, formatQuantity } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { confirmAction, setStatus, showToast } from "../core/ui-feedback.js";
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
const statusRegion = document.querySelector("#sales-status");
let mutationVersion = 0;

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function cloneValue(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function announce(message, state = "success") {
  setStatus(statusRegion, message, state);
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function statusLabel(value) {
  return ({
    pending_weighing: "Pendiente de pesar",
    preparing: "Preparando",
    pending_customer_confirmation: "Esperando cliente",
    confirmed: "Confirmado",
    ready: "Listo",
    delivering: "En reparto",
    delivered: "Entregado",
    cancelled: "Cancelado",
  })[value] ?? value;
}

function settlementLabel(value) { return ({ cash: "Efectivo", transfer: "Transferencia", credit: "Fiado" })[value] ?? value; }
function selectedOrder() { return orders.find((order) => order.id === selectedOrderId) ?? null; }
function filteredOrders() {
  const filter = document.querySelector("#sales-status-filter").value;
  return orders.filter((order) => !filter || order.status === filter);
}
function persist() {
  writeStorage("orders", orders);
  writeStorage("order-payments", payments);
  writeStorage("daily-transactions", transactions);
  writeStorage("credit-customers", customers);
  writeStorage("credit-ledger", ledger);
}

function offerUndo(message, restore) {
  const version = ++mutationVersion;
  showToast({
    message,
    state: "success",
    actionLabel: "Deshacer",
    onAction: () => {
      if (version !== mutationVersion) throw new Error("Solo puede deshacerse la operación más reciente.");
      restore();
      mutationVersion += 1;
      persist();
      renderAll();
      announce("La última operación fue deshecha.", "success");
    },
  });
}

function renderOrderList() {
  const container = document.querySelector("#sales-orders");
  const visible = filteredOrders();
  container.replaceChildren();
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay pedidos con este estado.";
    container.append(empty);
    return;
  }
  visible.forEach((order) => {
    const total = orderTotal(order);
    const paid = paymentSummary(payments, order.id, total);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `sales-order-row${order.id === selectedOrderId ? " selected" : ""}`;
    button.setAttribute("aria-pressed", String(order.id === selectedOrderId));
    button.innerHTML = `<div><span></span><strong></strong><small></small></div><div><b></b><small></small></div>`;
    button.querySelector("span").textContent = order.id;
    button.querySelector("strong").textContent = order.customer;
    button.querySelector("div small").textContent = `${statusLabel(order.status)} · ${order.fulfillment}`;
    button.querySelector("b").textContent = formatCLP(total);
    button.querySelector("div:last-child small").textContent = paid.status === "paid" ? "Pagado" : `Pendiente ${formatCLP(paid.due)}`;
    button.addEventListener("click", () => {
      selectedOrderId = order.id;
      renderAll();
    });
    container.append(button);
  });
}

function availableAction(order) {
  if (order.status === "pending_customer_confirmation") return { id: "confirm_difference", label: "Cliente confirma diferencia" };
  if (order.status === "confirmed") return { id: "mark_ready", label: "Marcar pedido listo" };
  if (order.status === "ready" && order.fulfillment === "Delivery") return { id: "start_delivery", label: "Iniciar reparto" };
  if (order.status === "ready" && order.fulfillment !== "Delivery") return { id: "complete_pickup", label: "Marcar como retirado" };
  if (order.status === "delivering") return { id: "deliver", label: "Marcar entregado" };
  return null;
}

function renderDetail() {
  const order = selectedOrder();
  const empty = document.querySelector("#sales-empty");
  const detail = document.querySelector("#sales-detail");
  if (!order) {
    empty.hidden = false;
    detail.hidden = true;
    empty.textContent = "Selecciona un pedido de la lista para revisar sus productos y pagos.";
    return;
  }
  empty.hidden = true;
  detail.hidden = false;
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
  warning.textContent = difference.requiresConfirmation
    ? `${difference.changedLines} línea(s) requieren confirmación explícita del cliente antes de continuar el pedido.`
    : "";

  const action = availableAction(order);
  const actionButton = document.querySelector("#sales-state-action");
  actionButton.hidden = !action;
  if (action) {
    actionButton.textContent = action.label;
    actionButton.dataset.action = action.id;
  } else {
    actionButton.removeAttribute("data-action");
  }

  const paymentForm = document.querySelector("#order-payment-form");
  paymentForm.amount.value = paid.due > 0 ? paid.due : "";
  paymentForm.amount.max = paid.due;
  paymentForm.querySelector("button").disabled = paid.due <= 0;
  document.querySelector("#receipt-preview").value = createReceiptText({ businessName: business.name, order, payments });
}

function renderPayments() {
  const order = selectedOrder();
  const container = document.querySelector("#sales-payments");
  container.replaceChildren();
  if (!order) return;
  const relevant = paymentSummary(payments, order.id, orderTotal(order)).payments;
  if (!relevant.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Este pedido todavía no tiene pagos registrados.";
    container.append(empty);
    return;
  }
  relevant.forEach((payment) => {
    const row = document.createElement("article");
    row.className = "payment-row";
    row.innerHTML = `<div><strong></strong><small></small></div><b></b>`;
    row.querySelector("strong").textContent = settlementLabel(payment.settlement);
    row.querySelector("small").textContent = new Date(payment.createdAt).toLocaleString("es-CL");
    row.querySelector("b").textContent = formatCLP(payment.amount);
    container.append(row);
  });
}

function renderAll() {
  renderOrderList();
  renderDetail();
  renderPayments();
}

function customerForOrder(order) {
  const normalized = order.customer.toLocaleLowerCase("es").trim();
  let customer = customers.find((item) => item.name.toLocaleLowerCase("es").trim() === normalized);
  if (!customer) {
    customer = { id: crypto.randomUUID(), name: order.customer, phone: "", notes: `Creado desde pedido ${order.id}`, creditLimit: 0 };
    customers.push(customer);
  }
  return customer;
}

document.querySelector("#sales-status-filter").addEventListener("change", () => {
  const visible = filteredOrders();
  if (!visible.some((order) => order.id === selectedOrderId)) selectedOrderId = visible[0]?.id ?? null;
  renderAll();
});

document.querySelector("#sales-state-action").addEventListener("click", async (event) => {
  const order = selectedOrder();
  const actionId = event.currentTarget.dataset.action;
  if (!order || !actionId) return;
  const action = availableAction(order);
  const finalAction = ["complete_pickup", "deliver"].includes(actionId);
  const accepted = await confirmAction({
    title: action?.label ?? "Actualizar pedido",
    message: finalAction
      ? `El pedido ${order.id} quedará finalizado para ${order.customer}.`
      : `Se actualizará el estado del pedido ${order.id}.`,
    detail: `${order.fulfillment} · ${formatCLP(orderTotal(order))}`,
    confirmLabel: action?.label ?? "Actualizar",
  });
  if (!accepted) return;
  const previousOrders = cloneValue(orders);
  try {
    const updated = nextOrderState(order, actionId);
    orders = orders.map((item) => item.id === updated.id ? updated : item);
    persist();
    announce(`Pedido ${updated.id}: ${statusLabel(updated.status)}.`, "success");
    renderAll();
    offerUndo(`Pedido ${updated.id} actualizado.`, () => { orders = previousOrders; });
  } catch (error) {
    announce(error.message, "error");
  }
});

document.querySelector("#order-payment-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const order = selectedOrder();
  if (!order) {
    announce("Selecciona un pedido antes de registrar el pago.", "error");
    return;
  }
  const total = orderTotal(order);
  const before = paymentSummary(payments, order.id, total);
  const amount = Math.round(Number(event.currentTarget.amount.value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > before.due) {
    announce("El pago debe ser mayor a cero y no superar el saldo pendiente.", "error");
    event.currentTarget.amount.focus();
    return;
  }
  const settlement = event.currentTarget.settlement.value;
  const accepted = await confirmAction({
    title: `Registrar ${settlementLabel(settlement).toLocaleLowerCase("es")}`,
    message: `${order.customer} · pedido ${order.id}`,
    detail: `${formatCLP(amount)} de ${formatCLP(before.due)} pendientes`,
    confirmLabel: settlement === "credit" ? "Registrar venta fiada" : "Registrar pago",
  });
  if (!accepted) return;

  const snapshot = {
    payments: cloneValue(payments),
    transactions: cloneValue(transactions),
    customers: cloneValue(customers),
    ledger: cloneValue(ledger),
  };
  const createdAt = new Date().toISOString();
  const payment = {
    id: crypto.randomUUID(),
    orderId: order.id,
    amount,
    settlement,
    status: "confirmed",
    createdAt,
  };
  let customerId = null;
  if (settlement === "credit") customerId = customerForOrder(order).id;
  payments.push(payment);
  const transaction = {
    id: crypto.randomUUID(),
    type: "sale",
    counterparty: order.customer,
    settlement,
    customerId,
    lines: [{ product: `Cobro ${order.id}`, quantity: 1, unitPrice: amount }],
    total: amount,
    createdAt,
    source: "order-payment",
    referenceId: payment.id,
    orderId: order.id,
  };
  transactions.push(transaction);
  if (settlement === "credit") {
    ledger.push({
      id: crypto.randomUUID(),
      customerId,
      type: "charge",
      amount,
      settlement: "credit",
      description: `Pedido ${order.id}`,
      occurredAt: localDateKey(),
      source: "daily-transaction",
      referenceId: transaction.id,
    });
  }
  persist();
  announce(settlement === "credit"
    ? "Venta fiada registrada y vinculada a la cuenta del cliente."
    : "Pago registrado y comprobante actualizado.", "success");
  renderAll();
  offerUndo(`${settlementLabel(settlement)} de ${formatCLP(amount)} registrado.`, () => {
    payments = snapshot.payments;
    transactions = snapshot.transactions;
    customers = snapshot.customers;
    ledger = snapshot.ledger;
  });
});

document.querySelector("#copy-receipt").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector("#receipt-preview").value);
    announce("Comprobante copiado.", "success");
    showToast({ message: "Comprobante copiado al portapapeles.", state: "success", duration: 3500 });
  } catch {
    announce("El navegador no permitió copiar automáticamente. Puedes seleccionar el texto manualmente.", "warning");
  }
});

applyTheme();
renderAll();
