import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { products } from "../data/demo-data.js";
import { initialInventoryLots, initialPurchases, initialSuppliers } from "../data/operations-demo.js";
import { createInventoryLot } from "../domain/inventory.js";
import { buildPriceDecision, calculateUnitCost } from "../domain/purchasing.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let suppliers = readStorage("suppliers", initialSuppliers);
let purchases = readStorage("purchase-orders", initialPurchases);
let lots = readStorage("inventory-lots", initialInventoryLots);
let prices = readStorage("prices", Object.fromEntries(products.map((product) => [product.id, product.price])));
const form = document.querySelector("#purchase-form");
let decision = null;

function todayISO() { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function productById(id) { return products.find((product) => product.id === id); }
function supplierById(id) { return suppliers.find((supplier) => supplier.id === id); }
function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function populate() {
  form.supplierId.innerHTML = suppliers.map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`).join("");
  form.productId.innerHTML = products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");
}

function recalculate() {
  const product = productById(form.productId.value);
  try {
    const unitCost = calculateUnitCost(form.totalCost.value, form.quantity.value);
    decision = buildPriceDecision({ currentPrice: prices[product.id] ?? product.price, unitCost, targetMarginPercent: form.targetMarginPercent.value, expectedWastePercent: form.expectedWastePercent.value });
    document.querySelector("#purchase-unit-cost").textContent = `${formatCLP(unitCost)}/${product.baseUnitLabel}`;
    document.querySelector("#purchase-current-price").textContent = formatCLP(decision.currentPrice);
    document.querySelector("#purchase-suggested-price").textContent = formatCLP(decision.suggestedPrice);
    document.querySelector("#purchase-margin").textContent = `${decision.currentMargin}% → ${decision.suggestedMargin}%`;
    document.querySelector("#price-decision").textContent = decision.action === "raise" ? "El costo nuevo exige revisar el precio." : decision.action === "keep" ? "El precio actual protege el objetivo." : "El precio podría revisarse a la baja, con aprobación humana.";
  } catch {
    decision = null;
    ["#purchase-unit-cost", "#purchase-current-price", "#purchase-suggested-price", "#purchase-margin"].forEach((selector) => { document.querySelector(selector).textContent = "—"; });
  }
}

function renderHistory() {
  const container = document.querySelector("#purchase-history");
  container.replaceChildren();
  [...purchases].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 12).forEach((purchase) => {
    const line = purchase.lines[0];
    const row = document.createElement("article");
    row.className = "purchase-row";
    row.innerHTML = `<div><strong></strong><small></small></div><div><span></span><b></b></div>`;
    row.querySelector("strong").textContent = `${line.productName} · ${line.quantity} ${line.unit}`;
    row.querySelector("small").textContent = `${purchase.supplierName} · ${new Date(purchase.createdAt).toLocaleDateString("es-CL")} · ${purchase.settlement === "cash" ? "Efectivo" : "Transferencia"}`;
    row.querySelector("span").textContent = `${formatCLP(line.unitCost)}/${line.unit}`;
    row.querySelector("b").textContent = formatCLP(purchase.total);
    container.append(row);
  });
}

form.addEventListener("input", recalculate);
form.addEventListener("change", recalculate);
form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!decision) return;
  const product = productById(form.productId.value);
  const supplier = supplierById(form.supplierId.value);
  const quantity = Number(form.quantity.value);
  const total = Math.round(Number(form.totalCost.value));
  const unitCost = calculateUnitCost(total, quantity);
  const purchaseId = crypto.randomUUID();
  const lot = createInventoryLot({ productId: product.id, productName: product.name, unit: product.baseUnitLabel, receivedQuantity: quantity, unitCost, receivedAt: form.receivedAt.value, bestBeforeDate: form.bestBeforeDate.value, condition: form.condition.value, ripeness: form.ripeness.value, supplierId: supplier.id, source: "purchase", notes: `Compra ${purchaseId}` });
  purchases.push({ id: purchaseId, supplierId: supplier.id, supplierName: supplier.name, createdAt: new Date().toISOString(), settlement: form.settlement.value, total, lines: [{ productId: product.id, productName: product.name, quantity, unit: product.baseUnitLabel, unitCost, targetMarginPercent: Number(form.targetMarginPercent.value), expectedWastePercent: Number(form.expectedWastePercent.value), suggestedPrice: decision.suggestedPrice }], lotIds: [lot.id] });
  lots.push(lot);
  if (form.applySuggested.checked) prices[product.id] = decision.suggestedPrice;
  writeStorage("purchase-orders", purchases);
  writeStorage("inventory-lots", lots);
  writeStorage("prices", prices);
  document.querySelector("#purchase-status").textContent = form.applySuggested.checked ? "Compra y lote guardados. El precio sugerido quedó aplicado." : "Compra y lote guardados. El precio quedó solo como sugerencia.";
  form.reset();
  form.receivedAt.value = todayISO();
  form.targetMarginPercent.value = 30;
  form.expectedWastePercent.value = 8;
  renderHistory();
  recalculate();
});

applyTheme();
populate();
form.receivedAt.value = todayISO();
renderHistory();
recalculate();
