import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { products } from "../data/demo-data.js";
import { initialInventoryLots } from "../data/operations-demo.js";
import { applyLotMovement, createInventoryLot, inventorySummary, lotRemaining, lotRisk, recommendFEFO } from "../domain/inventory.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let lots = readStorage("inventory-lots", initialInventoryLots);
const receiveForm = document.querySelector("#receive-lot-form");
const movementForm = document.querySelector("#lot-movement-form");
const filter = document.querySelector("#inventory-filter");

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

function productById(id) { return products.find((product) => product.id === id); }
function riskLabel(level) { return ({ critical: "Vender hoy", attention: "Priorizar", healthy: "Normal", exhausted: "Agotado" })[level] ?? level; }
function conditionLabel(value) { return ({ good: "Buena", ripe: "Maduro", soft: "Blando", overripe: "Sobremaduro", damaged: "Dañado" })[value] ?? value; }

function populateProducts() {
  for (const select of [receiveForm.productId, document.querySelector("#inventory-product-filter")]) {
    if (!select) continue;
    const first = select.id === "inventory-product-filter" ? '<option value="">Todos los productos</option>' : "";
    select.innerHTML = first + products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");
  }
}

function populateLots() {
  const select = movementForm.lotId;
  const active = recommendFEFO(lots);
  select.innerHTML = active.map((lot) => `<option value="${lot.id}">${lot.productName} · ${lot.remaining} ${lot.unit} · ${riskLabel(lot.risk.level)}</option>`).join("");
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
  const recommendations = recommendFEFO(lots).slice(0, 5);
  container.replaceChildren();
  if (!recommendations.length) { container.textContent = "No hay lotes activos."; return; }
  recommendations.forEach((lot, index) => {
    const row = document.createElement("article");
    row.className = `inventory-recommendation risk-${lot.risk.level}`;
    row.innerHTML = `<b>${index + 1}</b><div><strong></strong><small></small></div><span></span>`;
    row.querySelector("strong").textContent = lot.productName;
    row.querySelector("small").textContent = lot.risk.reason;
    row.querySelector("span").textContent = `${lot.remaining} ${lot.unit}`;
    container.append(row);
  });
}

function renderLots() {
  const container = document.querySelector("#inventory-lots");
  const query = filter.value.trim().toLocaleLowerCase("es");
  const productId = document.querySelector("#inventory-product-filter").value;
  const ordered = recommendFEFO(lots).filter((lot) => (!productId || lot.productId === productId) && (!query || `${lot.productName} ${lot.notes}`.toLocaleLowerCase("es").includes(query)));
  container.replaceChildren();
  ordered.forEach((lot) => {
    const product = productById(lot.productId);
    const risk = lotRisk(lot);
    const card = document.createElement("article");
    card.className = `card inventory-lot risk-${risk.level}`;
    card.innerHTML = `<div class="inventory-lot-image"><img alt="" loading="lazy"><span aria-hidden="true"></span></div><div class="inventory-lot-main"><div class="inventory-lot-title"><div><p class="eyebrow"></p><h3></h3></div><span class="status"></span></div><div class="inventory-lot-numbers"><strong></strong><small></small></div><dl><div><dt>Recibido</dt><dd></dd></div><div><dt>Consumir antes</dt><dd></dd></div><div><dt>Calidad</dt><dd></dd></div><div><dt>Costo</dt><dd></dd></div></dl><p class="inventory-note"></p><button class="button secondary small" type="button">Registrar salida</button></div>`;
    const image = card.querySelector("img");
    const fallback = card.querySelector(".inventory-lot-image span");
    if (product?.image) { image.src = product.image; image.alt = product.imageAlt; fallback.hidden = true; } else { image.hidden = true; fallback.textContent = product?.emoji ?? "🥬"; }
    card.querySelector(".eyebrow").textContent = lot.id;
    card.querySelector("h3").textContent = lot.productName;
    const status = card.querySelector(".status");
    status.textContent = riskLabel(risk.level);
    status.classList.add(risk.level === "healthy" ? "success" : "warning");
    card.querySelector(".inventory-lot-numbers strong").textContent = `${lotRemaining(lot)} ${lot.unit}`;
    card.querySelector(".inventory-lot-numbers small").textContent = `de ${lot.receivedQuantity} ${lot.unit} recibidos`;
    const dds = card.querySelectorAll("dd");
    dds[0].textContent = lot.receivedAt;
    dds[1].textContent = lot.bestBeforeDate || "Sin fecha";
    dds[2].textContent = `${conditionLabel(lot.condition)} · nivel ${lot.ripeness}/5`;
    dds[3].textContent = `${formatCLP(lot.unitCost)}/${lot.unit}`;
    card.querySelector(".inventory-note").textContent = lot.notes || risk.reason;
    card.querySelector("button").addEventListener("click", () => { movementForm.lotId.value = lot.id; movementForm.quantity.focus(); movementForm.scrollIntoView({ behavior: "smooth", block: "center" }); });
    container.append(card);
  });
}

function renderAll() { renderMetrics(); renderRecommendations(); renderLots(); populateLots(); }

receiveForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const product = productById(receiveForm.productId.value);
  try {
    lots.push(createInventoryLot({ productId: product.id, productName: product.name, unit: product.baseUnitLabel, receivedQuantity: receiveForm.receivedQuantity.value, unitCost: receiveForm.unitCost.value, receivedAt: receiveForm.receivedAt.value, bestBeforeDate: receiveForm.bestBeforeDate.value, condition: receiveForm.condition.value, ripeness: receiveForm.ripeness.value, notes: receiveForm.notes.value }));
    writeStorage("inventory-lots", lots);
    receiveForm.reset();
    receiveForm.receivedAt.value = todayISO();
    document.querySelector("#inventory-status").textContent = "Lote recibido y agregado a la rotación.";
    renderAll();
  } catch (error) { document.querySelector("#inventory-status").textContent = error.message; }
});

movementForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const index = lots.findIndex((lot) => lot.id === movementForm.lotId.value);
  if (index < 0) return;
  try {
    lots[index] = applyLotMovement(lots[index], { type: movementForm.type.value, quantity: movementForm.quantity.value });
    writeStorage("inventory-lots", lots);
    movementForm.reset();
    document.querySelector("#inventory-status").textContent = "Movimiento guardado en el lote.";
    renderAll();
  } catch (error) { document.querySelector("#inventory-status").textContent = error.message; }
});

filter.addEventListener("input", renderLots);
document.querySelector("#inventory-product-filter").addEventListener("change", renderLots);
applyTheme();
populateProducts();
receiveForm.receivedAt.value = todayISO();
renderAll();
