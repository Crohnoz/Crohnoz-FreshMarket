import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { confirmAction, setButtonPending, setStatus, showToast } from "../core/ui-feedback.js";
import { products } from "../data/demo-data.js";
import { initialInventoryLots, initialPurchases, initialSuppliers } from "../data/operations-demo.js";
import { createInventoryLot } from "../domain/inventory.js";
import { buildPriceDecision, calculateUnitCost } from "../domain/purchasing.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const suppliers = readStorage("suppliers", initialSuppliers);
let purchases = readStorage("purchase-orders", initialPurchases);
let lots = readStorage("inventory-lots", initialInventoryLots);
let prices = readStorage("prices", Object.fromEntries(products.map((product) => [product.id, product.price])));
const form = document.querySelector("#purchase-form");
const submitButton = form.querySelector("button[type=submit]");
const applySuggested = form.elements.applySuggested;
const statusRegion = document.querySelector("#purchase-status");
let decision = null;
let operationVersion = 0;

function todayISO() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function cloneValue(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function formatDateOnly(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Sin fecha" : date.toLocaleDateString("es-CL");
}

function productById(id) { return products.find((product) => product.id === id) ?? null; }
function supplierById(id) { return suppliers.find((supplier) => supplier.id === id) ?? null; }

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

function populate() {
  form.supplierId.innerHTML = suppliers.map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`).join("");
  form.productId.innerHTML = products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("");
  form.totalCost.min = "1";
  const help = document.createElement("small");
  help.id = "purchase-quantity-help";
  help.className = "field-help";
  form.quantity.closest("label").append(help);
}

function clearDecision(message = "Completa una cantidad y un costo válidos para calcular.") {
  decision = null;
  ["#purchase-unit-cost", "#purchase-current-price", "#purchase-suggested-price", "#purchase-margin"].forEach((selector) => {
    document.querySelector(selector).textContent = "—";
  });
  document.querySelector("#price-decision").textContent = message;
  applySuggested.checked = false;
  applySuggested.disabled = true;
  submitButton.disabled = true;
}

function recalculate() {
  const product = productById(form.productId.value);
  document.querySelector("#purchase-quantity-help").textContent = product
    ? `La cantidad se registra en ${product.baseUnitLabel}.`
    : "";
  if (!product) {
    clearDecision("Selecciona un producto para continuar.");
    return;
  }

  const quantity = Number(form.quantity.value);
  const totalCost = Number(form.totalCost.value);
  if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(totalCost) || totalCost <= 0) {
    clearDecision();
    return;
  }
  if (form.bestBeforeDate.value && form.receivedAt.value && form.bestBeforeDate.value < form.receivedAt.value) {
    clearDecision("La fecha de consumo preferente no puede ser anterior a la recepción.");
    return;
  }

  try {
    const unitCost = calculateUnitCost(totalCost, quantity);
    decision = buildPriceDecision({
      currentPrice: prices[product.id] ?? product.price,
      unitCost,
      targetMarginPercent: form.targetMarginPercent.value,
      expectedWastePercent: form.expectedWastePercent.value,
    });
    document.querySelector("#purchase-unit-cost").textContent = `${formatCLP(unitCost)}/${product.baseUnitLabel}`;
    document.querySelector("#purchase-current-price").textContent = formatCLP(decision.currentPrice);
    document.querySelector("#purchase-suggested-price").textContent = formatCLP(decision.suggestedPrice);
    document.querySelector("#purchase-margin").textContent = `${decision.currentMargin}% → ${decision.suggestedMargin}%`;
    document.querySelector("#price-decision").textContent = decision.action === "raise"
      ? "El costo nuevo exige revisar el precio para proteger el margen y la merma esperada."
      : decision.action === "keep"
        ? "El precio actual protege el objetivo. No es necesario cambiarlo."
        : "El precio podría revisarse a la baja, pero solo después de aprobación humana.";
    const changesPrice = decision.suggestedPrice !== decision.currentPrice;
    applySuggested.disabled = !changesPrice;
    if (!changesPrice) applySuggested.checked = false;
    submitButton.disabled = false;
  } catch (error) {
    clearDecision(error.message);
  }
}

function renderHistory() {
  const container = document.querySelector("#purchase-history");
  container.replaceChildren();
  const recent = [...purchases].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 12);
  if (!recent.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Todavía no hay compras registradas en este navegador.";
    container.append(empty);
    return;
  }
  recent.forEach((purchase) => {
    const line = purchase.lines[0];
    const row = document.createElement("article");
    row.className = "purchase-row";
    row.innerHTML = `<div><strong></strong><small></small></div><div><span></span><b></b></div>`;
    row.querySelector("strong").textContent = `${line.productName} · ${line.quantity} ${line.unit}`;
    row.querySelector("small").textContent = `${purchase.supplierName} · ${formatDateOnly(purchase.createdAt)} · ${purchase.settlement === "cash" ? "Efectivo" : "Transferencia"}`;
    row.querySelector("span").textContent = `${formatCLP(line.unitCost)}/${line.unit}`;
    row.querySelector("b").textContent = formatCLP(purchase.total);
    container.append(row);
  });
}

function offerUndo(snapshot, productName) {
  const version = ++operationVersion;
  showToast({
    message: `Compra de ${productName} guardada.`,
    state: "success",
    actionLabel: "Deshacer",
    onAction: () => {
      if (version !== operationVersion) throw new Error("Solo puede deshacerse la compra más reciente.");
      purchases = snapshot.purchases;
      lots = snapshot.lots;
      prices = snapshot.prices;
      operationVersion += 1;
      writeStorage("purchase-orders", purchases);
      writeStorage("inventory-lots", lots);
      writeStorage("prices", prices);
      renderHistory();
      recalculate();
      announce("La última compra fue deshecha junto con su lote y precio.", "success");
    },
  });
}

form.addEventListener("input", recalculate);
form.addEventListener("change", recalculate);
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  recalculate();
  if (!decision) {
    announce("Revisa la cantidad, el costo y las fechas antes de guardar.", "error");
    return;
  }
  const product = productById(form.productId.value);
  const supplier = supplierById(form.supplierId.value);
  if (!product || !supplier) {
    announce("Selecciona un producto y proveedor válidos.", "error");
    return;
  }

  const priceApplied = applySuggested.checked && !applySuggested.disabled;
  if (priceApplied) {
    const accepted = await confirmAction({
      title: `Cambiar el precio de ${product.name}`,
      message: "La compra se guardará y también se actualizará el precio del catálogo demo.",
      detail: `${formatCLP(decision.currentPrice)} → ${formatCLP(decision.suggestedPrice)} por ${product.baseUnitLabel}`,
      confirmLabel: "Guardar y cambiar precio",
    });
    if (!accepted) {
      announce("No se guardó la compra. Puedes desmarcar el cambio de precio y volver a intentar.", "warning");
      return;
    }
  }

  const snapshot = {
    purchases: cloneValue(purchases),
    lots: cloneValue(lots),
    prices: cloneValue(prices),
  };
  setButtonPending(submitButton, true, "Guardando compra…");
  try {
    const quantity = Number(form.quantity.value);
    const total = Math.round(Number(form.totalCost.value));
    const unitCost = calculateUnitCost(total, quantity);
    const purchaseId = crypto.randomUUID();
    const lot = createInventoryLot({
      productId: product.id,
      productName: product.name,
      unit: product.baseUnitLabel,
      receivedQuantity: quantity,
      unitCost,
      receivedAt: form.receivedAt.value,
      bestBeforeDate: form.bestBeforeDate.value,
      condition: form.condition.value,
      ripeness: form.ripeness.value,
      supplierId: supplier.id,
      source: "purchase",
      notes: `Compra ${purchaseId}`,
    });
    purchases.push({
      id: purchaseId,
      supplierId: supplier.id,
      supplierName: supplier.name,
      createdAt: new Date().toISOString(),
      settlement: form.settlement.value,
      total,
      lines: [{
        productId: product.id,
        productName: product.name,
        quantity,
        unit: product.baseUnitLabel,
        unitCost,
        targetMarginPercent: Number(form.targetMarginPercent.value),
        expectedWastePercent: Number(form.expectedWastePercent.value),
        suggestedPrice: decision.suggestedPrice,
      }],
      lotIds: [lot.id],
    });
    lots.push(lot);
    if (priceApplied) prices[product.id] = decision.suggestedPrice;
    writeStorage("purchase-orders", purchases);
    writeStorage("inventory-lots", lots);
    writeStorage("prices", prices);
    announce(priceApplied
      ? "Compra y lote guardados. El precio sugerido quedó aplicado."
      : "Compra y lote guardados. El precio se mantuvo sin cambios.", "success");
    form.reset();
    form.receivedAt.value = todayISO();
    form.targetMarginPercent.value = 30;
    form.expectedWastePercent.value = 8;
    renderHistory();
    recalculate();
    offerUndo(snapshot, product.name);
  } catch (error) {
    announce(error.message ?? "No se pudo guardar la compra.", "error");
  } finally {
    setButtonPending(submitButton, false);
    recalculate();
  }
});

applyTheme();
populate();
form.receivedAt.value = todayISO();
renderHistory();
recalculate();
