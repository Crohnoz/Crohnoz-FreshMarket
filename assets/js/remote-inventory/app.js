import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { ApiError, connectionState } from "../core/connection.js";
import { formatCLP } from "../core/format.js";
import { readStorage } from "../core/storage.js";
import { setStatus } from "../core/ui-feedback.js";
import {
  createRemoteReceptionPayload,
  remoteLotRisk,
  remoteQualityLabel,
} from "../domain/remote-inventory.js";
import { saleUnitLabel } from "../domain/remote-orders.js";
import {
  listRemoteLots,
  listRemoteProducts,
  receiveRemoteLot,
} from "../repositories/api-market.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const blocker = document.querySelector("#remote-inventory-blocker");
const blockerMessage = document.querySelector("#remote-inventory-blocker-message");
const workspace = document.querySelector("#remote-inventory-workspace");
const connectionSummary = document.querySelector("#remote-inventory-connection-summary");
const statusRegion = document.querySelector("#remote-inventory-status");
const refreshButton = document.querySelector("#refresh-remote-inventory");
const form = document.querySelector("#remote-reception-form");
const productSelect = document.querySelector("#remote-reception-product");
const receivedAt = document.querySelector("#remote-received-at");
const quantityInput = document.querySelector("#remote-reception-quantity");
const unitHelp = document.querySelector("#remote-reception-unit-help");
const submitButton = document.querySelector("#create-remote-reception");
const lotSearch = document.querySelector("#remote-lot-search");
const lotBody = document.querySelector("#remote-lots-body");

let products = [];
let lots = [];
let loading = false;
let activeRequestKey = newRequestKey();

function newRequestKey() {
  if (globalThis.crypto?.randomUUID) return `inventory-${crypto.randomUUID()}`;
  return `inventory-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayISO() {
  const now = new Date();
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
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
  const connected = state.state === "connected";
  blocker.hidden = connected;
  workspace.hidden = !connected;
  if (connected) {
    const firstName = state.session.user.first_name || state.session.user.username;
    connectionSummary.textContent = `${firstName} · ${state.membership.organization_name} · rol ${state.membership.role}.`;
  } else {
    blockerMessage.textContent = state.state === "organization-required"
      ? "La cuenta está autenticada, pero falta elegir el negocio activo."
      : state.state === "configured"
        ? "La API está configurada, pero la sesión no está iniciada o ya venció."
        : "Configura la API, inicia sesión y elige el negocio antes de recibir inventario.";
  }
  return state;
}

function productById(id) {
  return products.find((product) => product.id === id) ?? null;
}

function renderProductOptions() {
  const selected = productSelect.value;
  productSelect.replaceChildren(new Option("Selecciona un producto", ""));
  for (const product of products) {
    productSelect.append(new Option(`${product.name} · ${formatCLP(product.price)} / ${saleUnitLabel(product.saleUnit)}`, product.id));
  }
  if (products.some((product) => product.id === selected)) productSelect.value = selected;
  productSelect.disabled = products.length === 0 || loading;
  synchronizeSelectedProduct();
}

function synchronizeSelectedProduct() {
  const product = productById(productSelect.value);
  const unit = product ? saleUnitLabel(product.saleUnit) : "unidad del producto remoto";
  unitHelp.textContent = product
    ? `La recepción se guardará en ${unit}. El costo corresponde a cada ${unit}.`
    : "La unidad se toma del producto remoto.";
  quantityInput.step = product?.saleUnit === "kg" ? "0.001" : "1";
  quantityInput.min = product?.saleUnit === "kg" ? "0.001" : "1";
}

function formatQuantity(value, product) {
  const maximumFractionDigits = product?.saleUnit === "kg" ? 3 : 0;
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits }).format(value)} ${saleUnitLabel(product?.saleUnit ?? "unit")}`;
}

function readableDate(value) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-CL");
}

function renderLots() {
  const query = normalizedSearch(lotSearch.value);
  const visible = lots.filter((lot) => {
    const risk = remoteLotRisk(lot);
    return !query || normalizedSearch(`${lot.productName} ${lot.status} ${lot.quality} ${risk.label} ${lot.notes}`).includes(query);
  });
  lotBody.replaceChildren();
  let critical = 0;
  for (const lot of visible) {
    const product = productById(lot.productId);
    const risk = remoteLotRisk(lot);
    if (risk.level === "danger") critical += 1;
    const row = document.createElement("tr");

    const productCell = document.createElement("td");
    const productWrap = document.createElement("span");
    productWrap.className = "remote-lot-product";
    const strong = document.createElement("strong");
    strong.textContent = lot.productName;
    const quality = document.createElement("small");
    quality.textContent = `${remoteQualityLabel(lot.quality)} · versión ${lot.version}`;
    productWrap.append(strong, quality);
    if (lot.notes) {
      const note = document.createElement("small");
      note.className = "remote-lot-note";
      note.textContent = lot.notes;
      productWrap.append(note);
    }
    productCell.append(productWrap);

    const availableCell = document.createElement("td");
    availableCell.textContent = `${formatQuantity(lot.quantityAvailable, product)} de ${formatQuantity(lot.quantityReceived, product)}`;

    const receivedCell = document.createElement("td");
    receivedCell.textContent = readableDate(lot.receivedAt);

    const preferredCell = document.createElement("td");
    preferredCell.textContent = readableDate(lot.bestBefore);

    const riskCell = document.createElement("td");
    const chip = document.createElement("span");
    chip.className = "remote-risk-chip";
    chip.dataset.level = risk.level;
    chip.textContent = risk.label;
    riskCell.append(chip);

    const costCell = document.createElement("td");
    costCell.textContent = `${formatCLP(lot.unitCost)} / ${saleUnitLabel(product?.saleUnit ?? "unit")}`;

    row.append(productCell, availableCell, receivedCell, preferredCell, riskCell, costCell);
    lotBody.append(row);
  }
  document.querySelector("#remote-lot-count").textContent = String(visible.length);
  document.querySelector("#remote-critical-count").textContent = String(critical);
  document.querySelector("#remote-lots-empty").hidden = visible.length > 0;
}

function setLoading(value) {
  loading = value;
  submitButton.disabled = value || products.length === 0;
  refreshButton.disabled = value;
  productSelect.disabled = value || products.length === 0;
  submitButton.textContent = value ? "Guardando en servidor…" : "Registrar recepción remota";
}

async function loadRemoteData({ quiet = false } = {}) {
  const state = currentConnectedState();
  if (state.state !== "connected" || loading) return;
  setLoading(true);
  if (!quiet) announce("Consultando catálogo y lotes del servidor…", "loading");
  try {
    [products, lots] = await Promise.all([listRemoteProducts(), listRemoteLots()]);
    renderProductOptions();
    renderLots();
    announce(`Servidor actualizado: ${products.length} productos y ${lots.length} lotes.`, "success");
  } catch (error) {
    announce(error instanceof ApiError ? error.message : "No fue posible actualizar el inventario remoto.", "error");
    currentConnectedState();
  } finally {
    setLoading(false);
  }
}

function receptionSummary(lot) {
  const product = productById(lot.productId);
  return [
    `Producto: ${lot.productName}`,
    `Recepción: ${readableDate(lot.receivedAt)}`,
    `Cantidad: ${formatQuantity(lot.quantityReceived, product)}`,
    `Disponible: ${formatQuantity(lot.quantityAvailable, product)}`,
    `Costo unitario: ${formatCLP(lot.unitCost)}`,
    `Calidad: ${remoteQualityLabel(lot.quality)}`,
  ].join("\n");
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loading || currentConnectedState().state !== "connected") return;
  const data = new FormData(form);
  let payload;
  try {
    payload = createRemoteReceptionPayload({
      productId: data.get("productId"),
      receivedAt: data.get("receivedAt"),
      bestBefore: data.get("bestBefore"),
      quantity: data.get("quantity"),
      unitCost: data.get("unitCost"),
      quality: data.get("quality"),
      notes: data.get("notes"),
    });
  } catch (error) {
    announce(error.message, "error");
    return;
  }

  setLoading(true);
  announce("Registrando la recepción. Un reintento no la duplicará…", "loading");
  try {
    const lot = await receiveRemoteLot(payload, { idempotencyKey: activeRequestKey });
    document.querySelector("#remote-reception-summary").value = receptionSummary(lot);
    document.querySelector("#remote-reception-created").hidden = false;
    activeRequestKey = newRequestKey();
    form.reset();
    receivedAt.value = todayISO();
    lots = await listRemoteLots();
    renderProductOptions();
    renderLots();
    announce(`Recepción de ${lot.productName} confirmada por Django.`, "success");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "No fue posible registrar la recepción remota.";
    announce(`${message} La clave de reintento se conserva para intentarlo nuevamente sin duplicar.`, "error");
    currentConnectedState();
  } finally {
    setLoading(false);
  }
});

productSelect.addEventListener("change", synchronizeSelectedProduct);
lotSearch.addEventListener("input", renderLots);
refreshButton.addEventListener("click", () => loadRemoteData());
window.addEventListener("crohnoz:connection-changed", () => {
  const state = currentConnectedState();
  if (state.state === "connected") loadRemoteData({ quiet: true });
});

applyTheme();
receivedAt.value = todayISO();
currentConnectedState();
loadRemoteData();
