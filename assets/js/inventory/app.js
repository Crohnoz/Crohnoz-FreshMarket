import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP, formatQuantity } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { products } from "../data/demo-data.js";
import { initialInventoryLots } from "../data/operations-demo.js";
import { applyLotMovement, createInventoryLot, inventorySummary, lotRemaining, lotRisk, recommendFEFO } from "../domain/inventory.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let lots = readStorage("inventory-lots", initialInventoryLots);
const receiveForm = document.querySelector("#receive-lot-form");
const movementForm = document.querySelector("#lot-movement-form");
const filter = document.querySelector("#inventory-filter");
const productFilter = document.querySelector("#inventory-product-filter");
const statusRegion = document.querySelector("#inventory-status");

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function productById(id) { return products.find((product) => product.id === id) ?? null; }
function riskLabel(level) { return ({ critical: "Vender hoy", attention: "Priorizar", healthy: "Normal", exhausted: "Agotado" })[level] ?? level; }
function conditionLabel(value) { return ({ good: "Buena", ripe: "Maduro", soft: "Blando", overripe: "Sobremaduro", damaged: "Dañado" })[value] ?? value; }
function unitLabel(unit) { return ({ unit: "unidad", units: "unidades", bag: "malla", pack: "pack", box: "caja" })[unit] ?? unit; }
function quantityLabel(value, unit) { return formatQuantity(value, unitLabel(unit)); }
function normalizeText(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es"); }

function formatDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return "Sin fecha";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CL", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(year, month - 1, day));
}

function lotCode(id) {
  const value = String(id ?? "");
  if (value.startsWith("lot-")) return `Lote ${value.slice(4).replaceAll("-", " · ").toUpperCase()}`;
  return `Lote ${value.slice(-8).toUpperCase()}`;
}

function announce(message, state = "success") {
  statusRegion.textContent = message;
  statusRegion.dataset.state = state;
}

function installFieldHelp() {
  const quantityLabelElement = receiveForm.receivedQuantity.closest("label");
  const unitHelp = document.createElement("small");
  unitHelp.id = "receive-unit-help";
  unitHelp.className = "field-help";
  quantityLabelElement.append(unitHelp);

  const movementQuantityLabel = movementForm.quantity.closest("label");
  const movementHelp = document.createElement("small");
  movementHelp.id = "lot-movement-help";
  movementHelp.className = "field-help";
  movementQuantityLabel.append(movementHelp);
}

function populateProducts() {
  for (const select of [receiveForm.productId, productFilter]) {
    if (!select) continue;
    const first = select === productFilter ? '<option value="">Todos los productos</option>' : "";
    select.innerHTML = first + products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");
  }
}

function syncReceiveUnit() {
  const product = productById(receiveForm.productId.value);
  const help = document.querySelector("#receive-unit-help");
  if (help) help.textContent = product ? `Ingresa la cantidad en ${product.baseUnitLabel}.` : "";
}

function activeLots() { return recommendFEFO(lots); }

function populateLots() {
  const select = movementForm.lotId;
  const active = activeLots();
  const quantity = movementForm.quantity;
  const submit = movementForm.querySelector("button[type=submit]");

  if (!active.length) {
    select.innerHTML = '<option value="">No hay lotes con saldo</option>';
    select.disabled = true;
    quantity.disabled = true;
    submit.disabled = true;
    document.querySelector("#lot-movement-help").textContent = "Recibe mercadería antes de registrar una salida.";
    return;
  }

  const previous = select.value;
  select.innerHTML = active.map((lot) => `<option value="${lot.id}">${lot.productName} · ${quantityLabel(lot.remaining, lot.unit)} · ${riskLabel(lot.risk.level)}</option>`).join("");
  if (active.some((lot) => lot.id === previous)) select.value = previous;
  select.disabled = false;
  quantity.disabled = false;
  submit.disabled = false;
  syncMovementLimits();
}

function selectedMovementLot() { return lots.find((lot) => lot.id === movementForm.lotId.value) ?? null; }

function syncMovementLimits() {
  const lot = selectedMovementLot();
  const quantity = movementForm.quantity;
  const help = document.querySelector("#lot-movement-help");
  if (!lot) return;
  const remaining = lotRemaining(lot);
  const isPositiveAdjustment = movementForm.type.value === "adjustment";
  if (isPositiveAdjustment) {
    quantity.removeAttribute("max");
    help.textContent = `Este ajuste aumenta el saldo actual de ${quantityLabel(remaining, lot.unit)}.`;
    return;
  }
  quantity.max = String(remaining);
  if (Number(quantity.value) > remaining) quantity.value = "";
  help.textContent = `Máximo disponible: ${quantityLabel(remaining, lot.unit)}.`;
}

function renderMetrics() {
  const summary = inventorySummary(lots);
  document.querySelector("#inventory-active").textContent = summary.activeLots;
  document.querySelector("#inventory-critical").textContent = summary.criticalLots;
  document.querySelector("#inventory-value").textContent = formatCLP(summary.stockValue);
  document.querySelector("#inventory-risk-value").textContent = formatCLP(summary.atRiskValue);
}

function renderRecommendations() {
  const container = document.querySelector("#inventory-recommendations");
  const recommendations = activeLots().slice(0, 5);
  container.replaceChildren();
  if (!recommendations.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay lotes activos. Recibe mercadería para comenzar la rotación.";
    container.append(empty);
    return;
  }
  recommendations.forEach((lot, index) => {
    const row = document.createElement("article");
    row.className = `inventory-recommendation risk-${lot.risk.level}`;
    row.innerHTML = `<b></b><div><strong></strong><small></small></div><span></span>`;
    row.querySelector("b").textContent = index + 1;
    row.querySelector("strong").textContent = lot.productName;
    row.querySelector("small").textContent = lot.risk.reason;
    row.querySelector("span").textContent = quantityLabel(lot.remaining, lot.unit);
    container.append(row);
  });
}

function applyProductImage(card, product) {
  const image = card.querySelector("img");
  const fallback = card.querySelector(".inventory-lot-image span");
  fallback.textContent = product?.emoji ?? "🥬";
  if (!product?.image) {
    image.hidden = true;
    fallback.hidden = false;
    return;
  }
  image.src = product.image;
  image.alt = product.imageAlt;
  image.style.objectPosition = product.imagePosition ?? "center";
  fallback.hidden = true;
  image.addEventListener("error", () => {
    image.hidden = true;
    fallback.hidden = false;
  }, { once: true });
}

function renderLots() {
  const container = document.querySelector("#inventory-lots");
  const query = normalizeText(filter.value.trim());
  const productId = productFilter.value;
  const ordered = activeLots().filter((lot) => (
    (!productId || lot.productId === productId)
    && (!query || normalizeText(`${lot.productName} ${lot.notes} ${lot.id}`).includes(query))
  ));
  container.replaceChildren();

  if (!ordered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = query || productId
      ? "No encontramos lotes con esos filtros. Prueba otro producto o borra la búsqueda."
      : "No hay stock disponible en este momento.";
    container.append(empty);
    return;
  }

  ordered.forEach((lot) => {
    const product = productById(lot.productId);
    const risk = lotRisk(lot);
    const card = document.createElement("article");
    card.className = `card inventory-lot risk-${risk.level}`;
    card.innerHTML = `<div class="inventory-lot-image"><img loading="lazy" decoding="async"><span aria-hidden="true"></span></div><div class="inventory-lot-main"><div class="inventory-lot-title"><div><p class="eyebrow"></p><h3></h3></div><span class="status"></span></div><div class="inventory-lot-numbers"><strong></strong><small></small></div><dl><div><dt>Recibido</dt><dd></dd></div><div><dt>Consumir antes</dt><dd></dd></div><div><dt>Calidad</dt><dd></dd></div><div><dt>Costo</dt><dd></dd></div></dl><p class="inventory-note"></p><button class="button secondary small" type="button">Registrar salida</button></div>`;
    applyProductImage(card, product);
    card.querySelector(".eyebrow").textContent = lotCode(lot.id);
    card.querySelector("h3").textContent = lot.productName;
    const status = card.querySelector(".status");
    status.textContent = riskLabel(risk.level);
    status.classList.add(risk.level === "healthy" ? "success" : risk.level === "critical" ? "danger" : "warning");
    card.querySelector(".inventory-lot-numbers strong").textContent = quantityLabel(lotRemaining(lot), lot.unit);
    card.querySelector(".inventory-lot-numbers small").textContent = `de ${quantityLabel(lot.receivedQuantity, lot.unit)} recibidos`;
    const dds = card.querySelectorAll("dd");
    dds[0].textContent = formatDateOnly(lot.receivedAt);
    dds[1].textContent = formatDateOnly(lot.bestBeforeDate);
    dds[2].textContent = `${conditionLabel(lot.condition)} · nivel ${lot.ripeness}/5`;
    dds[3].textContent = `${formatCLP(lot.unitCost)}/${unitLabel(lot.unit)}`;
    card.querySelector(".inventory-note").textContent = lot.notes || risk.reason;
    const movementButton = card.querySelector("button");
    movementButton.setAttribute("aria-label", `Registrar salida para ${lot.productName}`);
    movementButton.addEventListener("click", () => {
      movementForm.lotId.value = lot.id;
      syncMovementLimits();
      movementForm.scrollIntoView({ behavior: "smooth", block: "center" });
      movementForm.quantity.focus({ preventScroll: true });
    });
    container.append(card);
  });
}

function renderAll() {
  renderMetrics();
  renderRecommendations();
  renderLots();
  populateLots();
}

receiveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const product = productById(receiveForm.productId.value);
  if (!product) {
    announce("Selecciona un producto válido.", "error");
    return;
  }
  if (receiveForm.bestBeforeDate.value && receiveForm.bestBeforeDate.value < receiveForm.receivedAt.value) {
    announce("La fecha de consumo preferente no puede ser anterior a la recepción.", "error");
    receiveForm.bestBeforeDate.focus();
    return;
  }
  try {
    lots.push(createInventoryLot({
      productId: product.id,
      productName: product.name,
      unit: product.baseUnitLabel,
      receivedQuantity: receiveForm.receivedQuantity.value,
      unitCost: receiveForm.unitCost.value,
      receivedAt: receiveForm.receivedAt.value,
      bestBeforeDate: receiveForm.bestBeforeDate.value,
      condition: receiveForm.condition.value,
      ripeness: receiveForm.ripeness.value,
      notes: receiveForm.notes.value,
    }));
    writeStorage("inventory-lots", lots);
    receiveForm.reset();
    receiveForm.receivedAt.value = todayISO();
    syncReceiveUnit();
    announce("Lote recibido y agregado a la rotación.", "success");
    renderAll();
  } catch (error) {
    announce(error.message, "error");
  }
});

movementForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const index = lots.findIndex((lot) => lot.id === movementForm.lotId.value);
  if (index < 0) {
    announce("Selecciona un lote con saldo disponible.", "error");
    return;
  }
  try {
    lots[index] = applyLotMovement(lots[index], { type: movementForm.type.value, quantity: movementForm.quantity.value });
    writeStorage("inventory-lots", lots);
    movementForm.quantity.value = "";
    announce("Movimiento guardado. El saldo y la prioridad se recalcularon.", "success");
    renderAll();
  } catch (error) {
    announce(error.message, "error");
  }
});

filter.addEventListener("input", renderLots);
productFilter.addEventListener("change", renderLots);
receiveForm.productId.addEventListener("change", syncReceiveUnit);
movementForm.lotId.addEventListener("change", syncMovementLimits);
movementForm.type.addEventListener("change", syncMovementLimits);

applyTheme();
installFieldHelp();
populateProducts();
receiveForm.receivedAt.value = todayISO();
syncReceiveUnit();
renderAll();
