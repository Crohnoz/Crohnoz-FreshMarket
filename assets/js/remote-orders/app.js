import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { ApiError, connectionState } from "../core/connection.js";
import { formatCLP } from "../core/format.js";
import { readStorage } from "../core/storage.js";
import { confirmAction, setStatus } from "../core/ui-feedback.js";
import {
  createRemoteOrderPayload,
  createRemoteWeighingPayload,
  generateRemotePublicId,
  remoteOrderCanBeReady,
  remoteOrderStatusLabel,
  saleUnitLabel,
} from "../domain/remote-orders.js";
import {
  confirmRemoteOrderWeighing,
  createRemoteOrder,
  listRemoteOrders,
  listRemoteProducts,
  markRemoteOrderReady,
  startRemoteOrderPreparation,
} from "../repositories/api-market.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const blocker = document.querySelector("#remote-blocker");
const blockerMessage = document.querySelector("#remote-blocker-message");
const workspace = document.querySelector("#remote-workspace");
const statusRegion = document.querySelector("#remote-status");
const productBody = document.querySelector("#remote-products-body");
const orderBody = document.querySelector("#remote-orders-body");
const productSearch = document.querySelector("#remote-product-search");
const orderForm = document.querySelector("#remote-order-form");
const submitButton = document.querySelector("#create-remote-order");
const refreshButton = document.querySelector("#refresh-remote");
const weighingDialog = document.querySelector("#remote-weighing-dialog");
const weighingForm = document.querySelector("#remote-weighing-form");
const weighingLines = document.querySelector("#remote-weighing-lines");
const weighingStatus = document.querySelector("#remote-weighing-status");
const weighingSave = document.querySelector("#save-remote-weighing");

let products = [];
let orders = [];
let loading = false;
let activeRequestKey = newRequestKey("order-create");
let activeWeighingOrder = null;
const workflowKeys = new Map();

function newRequestKey(prefix = "browser") {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function workflowKey(orderId, action) {
  const mapKey = `${orderId}:${action}`;
  if (!workflowKeys.has(mapKey)) workflowKeys.set(mapKey, newRequestKey(action));
  return workflowKeys.get(mapKey);
}

function clearWorkflowKey(orderId, action) {
  workflowKeys.delete(`${orderId}:${action}`);
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function announce(message, state = "success") {
  setStatus(statusRegion, message, state);
}

function normalizedSearch(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function currentConnectedState() {
  const state = connectionState();
  blocker.hidden = state.state === "connected";
  workspace.hidden = state.state !== "connected";
  if (state.state === "connected") {
    const firstName = state.session.user.first_name || state.session.user.username;
    document.querySelector("#remote-connection-summary").textContent = `${firstName} · ${state.membership.organization_name} · rol ${state.membership.role}.`;
  } else {
    blockerMessage.textContent = state.state === "organization-required"
      ? "La cuenta está autenticada, pero falta elegir el negocio activo."
      : state.state === "configured"
        ? "La API está configurada, pero la sesión no está iniciada o ya venció."
        : "Configura la API, inicia sesión y elige el negocio antes de usar esta operación.";
  }
  return state;
}

function quantityStep(product) {
  return product.saleUnit === "kg" ? "0.001" : "1";
}

function formatQuantity(value, unit) {
  const maximumFractionDigits = unit === "kg" ? 3 : 0;
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits }).format(value)} ${saleUnitLabel(unit)}`;
}

function renderProducts() {
  const query = normalizedSearch(productSearch.value);
  const visible = products.filter((product) => !query || normalizedSearch(`${product.name} ${product.sku} ${product.category}`).includes(query));
  productBody.replaceChildren();
  for (const product of visible) {
    const row = document.createElement("tr");
    const nameCell = document.createElement("td");
    const name = document.createElement("span");
    name.className = "remote-product-name";
    const strong = document.createElement("strong");
    strong.textContent = product.name;
    const meta = document.createElement("small");
    meta.textContent = `${product.sku || "Sin SKU"} · ${product.category}`;
    name.append(strong, meta);
    nameCell.append(name);

    const priceCell = document.createElement("td");
    priceCell.textContent = `${formatCLP(product.price)} / ${saleUnitLabel(product.saleUnit)}`;

    const quantityCell = document.createElement("td");
    const input = document.createElement("input");
    input.className = "remote-quantity";
    input.type = "number";
    input.min = "0";
    input.step = quantityStep(product);
    input.inputMode = "decimal";
    input.placeholder = "0";
    input.dataset.productId = product.id;
    input.dataset.unitPrice = String(product.price);
    input.setAttribute("aria-label", `Cantidad de ${product.name}`);
    quantityCell.append(input);

    row.append(nameCell, priceCell, quantityCell);
    productBody.append(row);
  }
  document.querySelector("#remote-products-empty").hidden = visible.length > 0;
}

function appendOrderLines(cell, order) {
  const wrap = document.createElement("span");
  wrap.className = "remote-order-lines";
  for (const item of order.items) {
    const line = document.createElement("small");
    const requested = formatQuantity(item.requestedQuantity, item.productSaleUnit);
    const actual = item.actualQuantity === null ? "sin cantidad real" : formatQuantity(item.actualQuantity, item.productSaleUnit);
    line.textContent = `${item.productName}: ${requested} · ${actual}`;
    wrap.append(line);
  }
  cell.append(wrap);
}

function actionButton({ label, action, order, tone = "secondary" }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `button ${tone} small`;
  button.textContent = label;
  button.dataset.remoteAction = action;
  button.dataset.orderId = order.id;
  button.disabled = loading;
  return button;
}

function appendOrderActions(cell, order) {
  const wrap = document.createElement("div");
  wrap.className = "remote-order-actions";
  if (order.status === "confirmed") {
    wrap.append(actionButton({ label: "Comenzar preparación", action: "start", order, tone: "primary" }));
  } else if (order.status === "preparing") {
    wrap.append(actionButton({
      label: remoteOrderCanBeReady(order) ? "Revisar cantidades" : "Registrar cantidades",
      action: "weigh",
      order,
    }));
    if (remoteOrderCanBeReady(order)) {
      wrap.append(actionButton({ label: "Marcar listo", action: "ready", order, tone: "primary" }));
    }
  } else {
    const note = document.createElement("small");
    note.className = "remote-order-meta";
    note.textContent = order.status === "ready" ? "Preparación terminada" : "Sin acción en este bloque";
    wrap.append(note);
  }
  cell.append(wrap);
}

function renderOrders() {
  orderBody.replaceChildren();
  document.querySelector("#remote-order-count").textContent = `${orders.length} pedido${orders.length === 1 ? "" : "s"}`;
  for (const order of orders) {
    const row = document.createElement("tr");
    const created = order.createdAt ? new Date(order.createdAt).toLocaleString("es-CL") : "Sin fecha";

    const idCell = document.createElement("td");
    idCell.textContent = order.publicId;
    const customerCell = document.createElement("td");
    customerCell.textContent = order.customerName;
    const detailCell = document.createElement("td");
    appendOrderLines(detailCell, order);
    const statusCell = document.createElement("td");
    const chip = document.createElement("span");
    chip.className = "remote-status-chip";
    chip.textContent = `${remoteOrderStatusLabel(order.status)} · v${order.version}`;
    statusCell.append(chip);
    const totalCell = document.createElement("td");
    totalCell.textContent = formatCLP(order.total);
    const createdCell = document.createElement("td");
    createdCell.textContent = created;
    const actionCell = document.createElement("td");
    appendOrderActions(actionCell, order);

    row.append(idCell, customerCell, detailCell, statusCell, totalCell, createdCell, actionCell);
    orderBody.append(row);
  }
  document.querySelector("#remote-orders-empty").hidden = orders.length > 0;
}

function setLoading(value, label = "Guardando en servidor…") {
  loading = value;
  submitButton.disabled = value;
  refreshButton.disabled = value;
  weighingSave.disabled = value;
  submitButton.textContent = value ? label : "Crear pedido remoto";
  orderBody.querySelectorAll("button[data-remote-action]").forEach((button) => { button.disabled = value; });
}

async function loadRemoteData({ quiet = false } = {}) {
  const state = currentConnectedState();
  if (state.state !== "connected" || loading) return;
  setLoading(true, "Consultando servidor…");
  if (!quiet) announce("Consultando catálogo y pedidos del servidor…", "loading");
  try {
    [products, orders] = await Promise.all([listRemoteProducts(), listRemoteOrders()]);
    renderProducts();
    renderOrders();
    announce(`Servidor actualizado: ${products.length} productos y ${orders.length} pedidos.`, "success");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "No fue posible actualizar la operación remota.";
    announce(message, "error");
    currentConnectedState();
  } finally {
    setLoading(false);
  }
}

function selectedLines() {
  return [...productBody.querySelectorAll("input[data-product-id]")]
    .map((input) => ({
      productId: input.dataset.productId,
      unitPrice: Number(input.dataset.unitPrice),
      quantity: Number(input.value),
    }))
    .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
}

function clearQuantities() {
  productBody.querySelectorAll("input[data-product-id]").forEach((input) => { input.value = ""; });
}

function createdSummary(order) {
  const lines = order.items.map((item) => `• ${item.productName || item.productId}: ${formatQuantity(item.requestedQuantity, item.productSaleUnit)} × ${formatCLP(item.unitPrice)}`);
  return [
    `Pedido: ${order.publicId}`,
    `Cliente: ${order.customerName}`,
    ...lines,
    `Total servidor: ${formatCLP(order.total)}`,
    `Estado: ${remoteOrderStatusLabel(order.status)}`,
  ].join("\n");
}

function orderById(id) {
  return orders.find((order) => order.id === id) ?? null;
}

function replaceOrder(updated) {
  orders = orders.map((order) => order.id === updated.id ? updated : order);
  renderOrders();
}

async function startPreparation(order) {
  const accepted = await confirmAction({
    title: `¿Comenzar ${order.publicId}?`,
    message: `El pedido de ${order.customerName} pasará a preparación.`,
    detail: "Después deberás registrar todas las cantidades reales.",
    confirmLabel: "Comenzar preparación",
  });
  if (!accepted) return;
  const action = "start-preparing";
  setLoading(true, "Actualizando pedido…");
  announce(`Iniciando preparación de ${order.publicId}…`, "loading");
  try {
    const updated = await startRemoteOrderPreparation(order, { idempotencyKey: workflowKey(order.id, action) });
    clearWorkflowKey(order.id, action);
    replaceOrder(updated);
    announce(`${updated.publicId} quedó en preparación.`, "success");
  } catch (error) {
    announce(`${error instanceof ApiError ? error.message : "No fue posible comenzar la preparación."} La clave de reintento se conserva.`, "error");
  } finally {
    setLoading(false);
    renderOrders();
  }
}

function closeWeighingDialog() {
  activeWeighingOrder = null;
  setStatus(weighingStatus, "");
  if (weighingDialog.open) weighingDialog.close();
}

function openWeighingDialog(order) {
  activeWeighingOrder = order;
  document.querySelector("#remote-weighing-title").textContent = `Cantidades reales · ${order.publicId}`;
  document.querySelector("#remote-weighing-meta").textContent = `${order.customerName} · ${order.items.length} línea${order.items.length === 1 ? "" : "s"} · versión ${order.version}`;
  weighingLines.replaceChildren();
  for (const item of order.items) {
    const row = document.createElement("div");
    row.className = "remote-weighing-line";
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.productName;
    const requested = document.createElement("small");
    requested.textContent = `Solicitado: ${formatQuantity(item.requestedQuantity, item.productSaleUnit)} · ${formatCLP(item.unitPrice)} / ${saleUnitLabel(item.productSaleUnit)}`;
    copy.append(name, requested);

    const label = document.createElement("label");
    label.textContent = `Cantidad real (${saleUnitLabel(item.productSaleUnit)})`;
    const input = document.createElement("input");
    input.type = "number";
    input.min = item.productSaleUnit === "kg" ? "0.001" : "1";
    input.step = item.productSaleUnit === "kg" ? "0.001" : "1";
    input.inputMode = "decimal";
    input.required = true;
    input.dataset.itemId = item.id;
    input.value = String(item.actualQuantity ?? item.requestedQuantity);
    label.append(input);
    row.append(copy, label);
    weighingLines.append(row);
  }
  setStatus(weighingStatus, "");
  if (typeof weighingDialog.showModal === "function") weighingDialog.showModal();
  else weighingDialog.setAttribute("open", "");
  weighingLines.querySelector("input")?.focus();
}

async function saveWeighing() {
  const order = activeWeighingOrder;
  if (!order) return;
  const values = [...weighingLines.querySelectorAll("input[data-item-id]")].map((input) => ({
    id: input.dataset.itemId,
    actualQuantity: input.value,
  }));
  let items;
  try {
    items = createRemoteWeighingPayload(order, values);
  } catch (error) {
    setStatus(weighingStatus, error.message, "error");
    return;
  }
  const action = "confirm-weighing";
  setLoading(true, "Guardando cantidades…");
  setStatus(weighingStatus, "Guardando cantidades reales en Django…", "loading");
  try {
    const updated = await confirmRemoteOrderWeighing(order, items, { idempotencyKey: workflowKey(order.id, action) });
    clearWorkflowKey(order.id, action);
    replaceOrder(updated);
    closeWeighingDialog();
    announce(`Cantidades de ${updated.publicId} confirmadas. Total actualizado: ${formatCLP(updated.total)}.`, "success");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "No fue posible guardar las cantidades reales.";
    setStatus(weighingStatus, `${message} La clave de reintento se conserva.`, "error");
  } finally {
    setLoading(false);
    renderOrders();
  }
}

async function markReady(order) {
  const accepted = await confirmAction({
    title: `¿Marcar ${order.publicId} como listo?`,
    message: `El total confirmado es ${formatCLP(order.total)}.`,
    detail: "La entrega y el pago permanecen fuera de este bloque remoto.",
    confirmLabel: "Marcar listo",
  });
  if (!accepted) return;
  const action = "mark-ready";
  setLoading(true, "Actualizando pedido…");
  announce(`Marcando ${order.publicId} como listo…`, "loading");
  try {
    const updated = await markRemoteOrderReady(order, { idempotencyKey: workflowKey(order.id, action) });
    clearWorkflowKey(order.id, action);
    replaceOrder(updated);
    announce(`${updated.publicId} está listo para la siguiente etapa.`, "success");
  } catch (error) {
    announce(`${error instanceof ApiError ? error.message : "No fue posible marcar el pedido listo."} La clave de reintento se conserva.`, "error");
  } finally {
    setLoading(false);
    renderOrders();
  }
}

orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loading) return;
  const state = currentConnectedState();
  if (state.state !== "connected") return;
  const data = new FormData(orderForm);
  const randomSuffix = activeRequestKey.slice(-6);
  let payload;
  try {
    payload = createRemoteOrderPayload({
      customerName: data.get("customerName"),
      publicId: generateRemotePublicId(new Date(), randomSuffix),
      idempotencyKey: activeRequestKey,
      notes: `${data.get("fulfillment")} · ${String(data.get("notes") ?? "").trim()}`.replace(/ · $/, ""),
      lines: selectedLines(),
    });
  } catch (error) {
    announce(error.message, "error");
    return;
  }

  setLoading(true);
  announce("Creando pedido en el servidor. Un reintento no lo duplicará…", "loading");
  try {
    const created = await createRemoteOrder(payload);
    document.querySelector("#remote-created-summary").value = createdSummary(created);
    document.querySelector("#remote-created").hidden = false;
    activeRequestKey = newRequestKey("order-create");
    orderForm.reset();
    clearQuantities();
    orders = await listRemoteOrders();
    renderOrders();
    announce(`Pedido ${created.publicId} confirmado por Django.`, "success");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "No fue posible crear el pedido remoto.";
    announce(`${message} La clave de reintento se conserva para intentarlo nuevamente sin duplicar.`, "error");
    currentConnectedState();
  } finally {
    setLoading(false);
    renderOrders();
  }
});

orderBody.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-remote-action]");
  if (!button || loading) return;
  const order = orderById(button.dataset.orderId);
  if (!order) {
    announce("El pedido cambió. Actualiza la pantalla.", "error");
    return;
  }
  if (button.dataset.remoteAction === "start") startPreparation(order);
  if (button.dataset.remoteAction === "weigh") openWeighingDialog(order);
  if (button.dataset.remoteAction === "ready") markReady(order);
});

weighingForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!loading) saveWeighing();
});
document.querySelector("#close-remote-weighing").addEventListener("click", closeWeighingDialog);
document.querySelector("#cancel-remote-weighing").addEventListener("click", closeWeighingDialog);
weighingDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeWeighingDialog();
});
weighingDialog.addEventListener("click", (event) => {
  if (event.target === weighingDialog && !loading) closeWeighingDialog();
});

productSearch.addEventListener("input", renderProducts);
refreshButton.addEventListener("click", () => loadRemoteData());
window.addEventListener("crohnoz:connection-changed", () => {
  closeWeighingDialog();
  const state = currentConnectedState();
  if (state.state === "connected") loadRemoteData({ quiet: true });
});

applyTheme();
currentConnectedState();
loadRemoteData();
