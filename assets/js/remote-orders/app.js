import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { ApiError, connectionState } from "../core/connection.js";
import { formatCLP } from "../core/format.js";
import { readStorage } from "../core/storage.js";
import { setStatus } from "../core/ui-feedback.js";
import {
  createRemoteOrderPayload,
  generateRemotePublicId,
  remoteOrderStatusLabel,
  saleUnitLabel,
} from "../domain/remote-orders.js";
import { createRemoteOrder, listRemoteOrders, listRemoteProducts } from "../repositories/api-market.js";

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

let products = [];
let orders = [];
let loading = false;
let activeRequestKey = newRequestKey();

function newRequestKey() {
  if (globalThis.crypto?.randomUUID) return `browser-${crypto.randomUUID()}`;
  return `browser-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function renderOrders() {
  orderBody.replaceChildren();
  document.querySelector("#remote-order-count").textContent = `${orders.length} pedido${orders.length === 1 ? "" : "s"}`;
  for (const order of orders) {
    const row = document.createElement("tr");
    const created = order.createdAt ? new Date(order.createdAt).toLocaleString("es-CL") : "Sin fecha";
    const values = [
      order.publicId,
      order.customerName,
      remoteOrderStatusLabel(order.status),
      formatCLP(order.total),
      created,
    ];
    values.forEach((value, index) => {
      const cell = document.createElement("td");
      if (index === 2) {
        const chip = document.createElement("span");
        chip.className = "remote-status-chip";
        chip.textContent = value;
        cell.append(chip);
      } else {
        cell.textContent = value;
      }
      row.append(cell);
    });
    orderBody.append(row);
  }
  document.querySelector("#remote-orders-empty").hidden = orders.length > 0;
}

function setLoading(value) {
  loading = value;
  submitButton.disabled = value;
  document.querySelector("#refresh-remote").disabled = value;
  submitButton.textContent = value ? "Guardando en servidor…" : "Crear pedido remoto";
}

async function loadRemoteData({ quiet = false } = {}) {
  const state = currentConnectedState();
  if (state.state !== "connected" || loading) return;
  setLoading(true);
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
  const lines = order.items.map((item) => `• ${item.productName || item.productId}: ${item.requestedQuantity} × ${formatCLP(item.unitPrice)}`);
  return [
    `Pedido: ${order.publicId}`,
    `Cliente: ${order.customerName}`,
    ...lines,
    `Total servidor: ${formatCLP(order.total)}`,
    `Estado: ${remoteOrderStatusLabel(order.status)}`,
  ].join("\n");
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
    activeRequestKey = newRequestKey();
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
  }
});

productSearch.addEventListener("input", renderProducts);
document.querySelector("#refresh-remote").addEventListener("click", () => loadRemoteData());
window.addEventListener("crohnoz:connection-changed", () => {
  const state = currentConnectedState();
  if (state.state === "connected") loadRemoteData({ quiet: true });
});

applyTheme();
currentConnectedState();
loadRemoteData();
