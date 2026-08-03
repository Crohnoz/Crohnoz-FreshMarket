import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { ApiError, connectionState } from "../core/connection.js";
import { formatCLP } from "../core/format.js";
import { readStorage } from "../core/storage.js";
import { setStatus } from "../core/ui-feedback.js";
import {
  createRemoteMovementPayload,
  createRemoteReceptionPayload,
  remoteLotRisk,
  remoteMovementLabel,
  remoteQualityLabel,
} from "../domain/remote-inventory.js";
import { saleUnitLabel } from "../domain/remote-orders.js";
import {
  createRemoteInventoryMovement,
  listRemoteInventoryMovements,
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
const receptionForm = document.querySelector("#remote-reception-form");
const productSelect = document.querySelector("#remote-reception-product");
const receivedAt = document.querySelector("#remote-received-at");
const receptionQuantity = document.querySelector("#remote-reception-quantity");
const receptionUnitHelp = document.querySelector("#remote-reception-unit-help");
const receptionButton = document.querySelector("#create-remote-reception");
const movementForm = document.querySelector("#remote-movement-form");
const movementLotSelect = document.querySelector("#remote-movement-lot");
const movementTypeSelect = document.querySelector("#remote-movement-type");
const movementQuantity = document.querySelector("#remote-movement-quantity");
const movementQuantityLabel = document.querySelector("#remote-movement-quantity-label");
const movementUnitHelp = document.querySelector("#remote-movement-unit-help");
const movementButton = document.querySelector("#create-remote-movement");
const adjustmentOption = document.querySelector("#remote-adjustment-option");
const movementRoleNote = document.querySelector("#remote-movement-role-note");
const lotSearch = document.querySelector("#remote-lot-search");
const lotBody = document.querySelector("#remote-lots-body");
const movementBody = document.querySelector("#remote-movements-body");

let products = [];
let lots = [];
let movements = [];
let loading = false;
let activeReceptionKey = newRequestKey("inventory-reception");
let activeMovementKey = newRequestKey("inventory-movement");

function newRequestKey(prefix) {
  if (globalThis.crypto?.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

function canAdjustInventory(state = connectionState()) {
  return ["owner", "manager"].includes(state.membership?.role);
}

function currentConnectedState() {
  const state = connectionState();
  const connected = state.state === "connected";
  blocker.hidden = connected;
  workspace.hidden = !connected;
  if (connected) {
    const firstName = state.session.user.first_name || state.session.user.username;
    connectionSummary.textContent = `${firstName} · ${state.membership.organization_name} · rol ${state.membership.role}.`;
    const canAdjust = canAdjustInventory(state);
    adjustmentOption.hidden = !canAdjust;
    adjustmentOption.disabled = !canAdjust;
    if (!canAdjust && movementTypeSelect.value === "adjustment") movementTypeSelect.value = "consumption";
    movementRoleNote.textContent = canAdjust
      ? "Tu rol permite consumo, merma, devolución y ajuste por conteo físico."
      : "Tu rol permite consumo, merma y devolución. El ajuste por conteo requiere administrador.";
  } else {
    blockerMessage.textContent = state.state === "organization-required"
      ? "La cuenta está autenticada, pero falta elegir el negocio activo."
      : state.state === "configured"
        ? "La API está configurada, pero la sesión no está iniciada o ya venció."
        : "Configura la API, inicia sesión y elige el negocio antes de operar inventario.";
  }
  synchronizeMovementForm();
  return state;
}

function productById(id) {
  return products.find((product) => product.id === id) ?? null;
}

function lotById(id) {
  return lots.find((lot) => lot.id === id) ?? null;
}

function saleUnitForLot(lot) {
  return lot?.productSaleUnit || productById(lot?.productId)?.saleUnit || "unit";
}

function compareFefoLots(left, right) {
  if (left.bestBefore && right.bestBefore && left.bestBefore !== right.bestBefore) {
    return left.bestBefore.localeCompare(right.bestBefore);
  }
  if (left.bestBefore && !right.bestBefore) return -1;
  if (!left.bestBefore && right.bestBefore) return 1;
  if (left.receivedAt !== right.receivedAt) return left.receivedAt.localeCompare(right.receivedAt);
  if (left.createdAt !== right.createdAt) return left.createdAt.localeCompare(right.createdAt);
  return left.id.localeCompare(right.id);
}

function fefoLotForProduct(productId) {
  return lots
    .filter((lot) => (
      lot.productId === productId
      && lot.status === "active"
      && lot.quantityAvailable > 0
      && lot.quality !== "damaged"
    ))
    .sort(compareFefoLots)[0] ?? null;
}

function isFefoLot(lot) {
  return Boolean(lot && fefoLotForProduct(lot.productId)?.id === lot.id);
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
  receptionUnitHelp.textContent = product
    ? `La recepción se guardará en ${unit}. El costo corresponde a cada ${unit}.`
    : "La unidad se toma del producto remoto.";
  receptionQuantity.step = product?.saleUnit === "kg" ? "0.001" : "1";
  receptionQuantity.min = product?.saleUnit === "kg" ? "0.001" : "1";
}

function formatQuantity(value, productOrUnit) {
  const saleUnit = typeof productOrUnit === "string" ? productOrUnit : productOrUnit?.saleUnit ?? "unit";
  const maximumFractionDigits = saleUnit === "kg" ? 3 : 0;
  return `${new Intl.NumberFormat("es-CL", { maximumFractionDigits }).format(value)} ${saleUnitLabel(saleUnit)}`;
}

function renderMovementLotOptions() {
  const selected = movementLotSelect.value;
  movementLotSelect.replaceChildren(new Option("Selecciona un lote", ""));
  for (const lot of lots) {
    const unit = saleUnitLabel(saleUnitForLot(lot));
    const fefo = isFefoLot(lot) ? " · FEFO primero" : "";
    const label = `${lot.productName} · ${formatQuantity(lot.quantityAvailable, saleUnitForLot(lot))} · ${lot.status === "depleted" ? "agotado" : unit}${fefo}`;
    movementLotSelect.append(new Option(label, lot.id));
  }
  if (lots.some((lot) => lot.id === selected)) movementLotSelect.value = selected;
  movementLotSelect.disabled = lots.length === 0 || loading;
  synchronizeMovementForm();
}

function synchronizeMovementForm() {
  if (!movementLotSelect || !movementTypeSelect) return;
  const state = connectionState();
  const lot = lotById(movementLotSelect.value);
  const movementType = movementTypeSelect.value;
  const adjustment = movementType === "adjustment";
  const consumption = movementType === "consumption";
  const unit = saleUnitLabel(saleUnitForLot(lot));
  const fefo = lot ? fefoLotForProduct(lot.productId) : null;
  const laterThanFefo = consumption && fefo && fefo.id !== lot?.id;
  const damagedConsumption = consumption && lot?.quality === "damaged";
  const emptyNonAdjustment = Boolean(lot && lot.quantityAvailable <= 0 && !adjustment);
  const unauthorizedAdjustment = adjustment && !canAdjustInventory(state);

  movementQuantityLabel.textContent = adjustment ? "Nuevo saldo disponible" : "Cantidad a descontar";
  movementQuantity.step = saleUnitForLot(lot) === "kg" ? "0.001" : "1";
  movementQuantity.min = adjustment ? "0" : (saleUnitForLot(lot) === "kg" ? "0.001" : "1");
  movementQuantity.max = lot ? String(adjustment ? lot.quantityReceived : lot.quantityAvailable) : "";

  if (!lot) {
    movementUnitHelp.textContent = "Selecciona un lote para revisar saldo y unidad.";
  } else if (laterThanFefo) {
    movementUnitHelp.textContent = `Para consumo usa primero el lote FEFO de ${fefo.productName}, con prioridad ${fefo.bestBefore || fefo.receivedAt}.`;
  } else if (damagedConsumption) {
    movementUnitHelp.textContent = "Este lote está dañado: registra merma o devolución, no consumo.";
  } else if (emptyNonAdjustment) {
    movementUnitHelp.textContent = "Este lote está agotado. Solo un administrador puede corregirlo mediante ajuste de conteo.";
  } else {
    movementUnitHelp.textContent = `${lot.productName}: ${formatQuantity(lot.quantityAvailable, saleUnitForLot(lot))} disponibles de ${formatQuantity(lot.quantityReceived, saleUnitForLot(lot))}. Ingresa ${unit}.`;
  }

  movementButton.disabled = Boolean(
    loading
    || !lot
    || laterThanFefo
    || damagedConsumption
    || emptyNonAdjustment
    || unauthorizedAdjustment
  );
}

function readableDate(value) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("es-CL");
}

function readableDateTime(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Fecha inválida" : date.toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
}

function chooseLotForMovement(lotId) {
  movementLotSelect.value = lotId;
  synchronizeMovementForm();
  movementForm.scrollIntoView({ behavior: "smooth", block: "center" });
  movementTypeSelect.focus();
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
    const saleUnit = saleUnitForLot(lot);
    const risk = remoteLotRisk(lot);
    if (risk.level === "danger") critical += 1;
    const row = document.createElement("tr");

    const productCell = document.createElement("td");
    const productWrap = document.createElement("span");
    productWrap.className = "remote-lot-product";
    const strong = document.createElement("strong");
    strong.textContent = lot.productName;
    const quality = document.createElement("small");
    const fefoLabel = isFefoLot(lot) ? " · FEFO primero" : "";
    quality.textContent = `${remoteQualityLabel(lot.quality)} · versión ${lot.version}${fefoLabel}`;
    productWrap.append(strong, quality);
    if (lot.notes) {
      const note = document.createElement("small");
      note.className = "remote-lot-note";
      note.textContent = lot.notes;
      productWrap.append(note);
    }
    productCell.append(productWrap);

    const availableCell = document.createElement("td");
    availableCell.textContent = `${formatQuantity(lot.quantityAvailable, saleUnit)} de ${formatQuantity(lot.quantityReceived, saleUnit)}`;

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
    costCell.textContent = `${formatCLP(lot.unitCost)} / ${saleUnitLabel(saleUnit)}`;

    const actionCell = document.createElement("td");
    const actionButton = document.createElement("button");
    actionButton.type = "button";
    actionButton.className = "button small secondary";
    actionButton.textContent = lot.status === "depleted" ? "Ajustar" : "Mover";
    actionButton.addEventListener("click", () => chooseLotForMovement(lot.id));
    actionCell.append(actionButton);

    row.append(productCell, availableCell, receivedCell, preferredCell, riskCell, costCell, actionCell);
    lotBody.append(row);
  }
  document.querySelector("#remote-lot-count").textContent = String(visible.length);
  document.querySelector("#remote-critical-count").textContent = String(critical);
  document.querySelector("#remote-lots-empty").hidden = visible.length > 0;
}

function renderMovements() {
  movementBody.replaceChildren();
  for (const movement of movements) {
    const row = document.createElement("tr");
    const dateCell = document.createElement("td");
    dateCell.textContent = readableDateTime(movement.createdAt);
    const productCell = document.createElement("td");
    productCell.textContent = movement.productName;
    const typeCell = document.createElement("td");
    typeCell.textContent = remoteMovementLabel(movement.movementType);
    const deltaCell = document.createElement("td");
    const sign = movement.quantityDelta > 0 ? "+" : "";
    deltaCell.textContent = `${sign}${formatQuantity(movement.quantityDelta, movement.productSaleUnit)}`;
    deltaCell.dataset.delta = movement.quantityDelta > 0 ? "positive" : "negative";
    const balanceCell = document.createElement("td");
    balanceCell.textContent = `${formatQuantity(movement.quantityBefore, movement.productSaleUnit)} → ${formatQuantity(movement.quantityAfter, movement.productSaleUnit)}`;
    const reasonCell = document.createElement("td");
    reasonCell.textContent = movement.reference ? `${movement.reason} · ${movement.reference}` : movement.reason;
    const actorCell = document.createElement("td");
    actorCell.textContent = movement.actor || "Usuario autenticado";
    row.append(dateCell, productCell, typeCell, deltaCell, balanceCell, reasonCell, actorCell);
    movementBody.append(row);
  }
  document.querySelector("#remote-movement-count").textContent = String(movements.length);
  document.querySelector("#remote-movements-empty").hidden = movements.length > 0;
}

function setLoading(value) {
  loading = value;
  receptionButton.disabled = value || products.length === 0;
  refreshButton.disabled = value;
  productSelect.disabled = value || products.length === 0;
  movementLotSelect.disabled = value || lots.length === 0;
  receptionButton.textContent = value ? "Guardando en servidor…" : "Registrar recepción remota";
  movementButton.textContent = value ? "Guardando en servidor…" : "Registrar movimiento remoto";
  synchronizeMovementForm();
}

async function loadRemoteData({ quiet = false, force = false } = {}) {
  const state = currentConnectedState();
  if (state.state !== "connected" || (loading && !force)) return;
  const inheritedLoading = loading;
  if (!inheritedLoading) setLoading(true);
  if (!quiet) announce("Consultando catálogo, lotes y movimientos del servidor…", "loading");
  try {
    [products, lots, movements] = await Promise.all([
      listRemoteProducts(),
      listRemoteLots(),
      listRemoteInventoryMovements(),
    ]);
    renderProductOptions();
    renderMovementLotOptions();
    renderLots();
    renderMovements();
    if (!quiet) {
      announce(`Servidor actualizado: ${products.length} productos, ${lots.length} lotes y ${movements.length} movimientos.`, "success");
    }
  } catch (error) {
    announce(error instanceof ApiError ? error.message : "No fue posible actualizar el inventario remoto.", "error");
    currentConnectedState();
  } finally {
    if (!inheritedLoading) setLoading(false);
  }
}

function receptionSummary(lot) {
  const saleUnit = saleUnitForLot(lot);
  return [
    `Producto: ${lot.productName}`,
    `Recepción: ${readableDate(lot.receivedAt)}`,
    `Cantidad: ${formatQuantity(lot.quantityReceived, saleUnit)}`,
    `Disponible: ${formatQuantity(lot.quantityAvailable, saleUnit)}`,
    `Costo unitario: ${formatCLP(lot.unitCost)}`,
    `Calidad: ${remoteQualityLabel(lot.quality)}`,
  ].join("\n");
}

function movementSummary(result) {
  const { lot, movement } = result;
  return [
    `Producto: ${movement.productName}`,
    `Movimiento: ${remoteMovementLabel(movement.movementType)}`,
    `Variación: ${formatQuantity(movement.quantityDelta, movement.productSaleUnit)}`,
    `Saldo anterior: ${formatQuantity(movement.quantityBefore, movement.productSaleUnit)}`,
    `Saldo resultante: ${formatQuantity(movement.quantityAfter, movement.productSaleUnit)}`,
    `Versión del lote: ${lot.version}`,
  ].join("\n");
}

receptionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loading || currentConnectedState().state !== "connected") return;
  const data = new FormData(receptionForm);
  const product = productById(data.get("productId"));
  let payload;
  try {
    payload = createRemoteReceptionPayload({
      productId: data.get("productId"),
      productSaleUnit: product?.saleUnit,
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
    const lot = await receiveRemoteLot(payload, { idempotencyKey: activeReceptionKey });
    document.querySelector("#remote-reception-summary").value = receptionSummary(lot);
    document.querySelector("#remote-reception-created").hidden = false;
    activeReceptionKey = newRequestKey("inventory-reception");
    receptionForm.reset();
    receivedAt.value = todayISO();
    await loadRemoteData({ quiet: true, force: true });
    announce(`Recepción de ${lot.productName} confirmada por Django.`, "success");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "No fue posible registrar la recepción remota.";
    announce(`${message} La clave de reintento se conserva para intentarlo nuevamente sin duplicar.`, "error");
    currentConnectedState();
  } finally {
    setLoading(false);
  }
});

movementForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const state = currentConnectedState();
  if (loading || state.state !== "connected") return;
  const data = new FormData(movementForm);
  const lot = lotById(data.get("lotId"));
  if (data.get("movementType") === "adjustment" && !canAdjustInventory(state)) {
    announce("El ajuste por conteo requiere rol administrador.", "error");
    return;
  }
  let payload;
  try {
    payload = createRemoteMovementPayload({
      lot,
      movementType: data.get("movementType"),
      quantity: data.get("quantity"),
      reason: data.get("reason"),
      reference: data.get("reference"),
    });
  } catch (error) {
    announce(error.message, "error");
    return;
  }

  setLoading(true);
  announce("Registrando movimiento trazable. Un reintento no lo duplicará…", "loading");
  try {
    const result = await createRemoteInventoryMovement(lot, payload, { idempotencyKey: activeMovementKey });
    document.querySelector("#remote-movement-summary").value = movementSummary(result);
    document.querySelector("#remote-movement-created").hidden = false;
    activeMovementKey = newRequestKey("inventory-movement");
    const selectedLot = lot.id;
    movementForm.reset();
    movementLotSelect.value = selectedLot;
    await loadRemoteData({ quiet: true, force: true });
    announce(`${remoteMovementLabel(result.movement.movementType)} de ${result.movement.productName} confirmado por Django.`, "success");
  } catch (error) {
    const message = error instanceof ApiError ? error.message : "No fue posible registrar el movimiento remoto.";
    announce(`${message} La clave de reintento se conserva para intentarlo nuevamente sin duplicar.`, "error");
    currentConnectedState();
  } finally {
    setLoading(false);
  }
});

productSelect.addEventListener("change", synchronizeSelectedProduct);
movementLotSelect.addEventListener("change", synchronizeMovementForm);
movementTypeSelect.addEventListener("change", synchronizeMovementForm);
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