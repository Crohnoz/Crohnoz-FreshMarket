import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { formatCLP, formatQuantity } from "../core/format.js";
import { confirmAction, setStatus, showToast } from "../core/ui-feedback.js";
import { calculateWeightAdjustment } from "../domain/weight-adjustment.js";
import { applyLotMovement, lotRemaining, recommendFEFO } from "../domain/inventory.js";
import { formatWasteQuantities } from "../domain/daily-close.js";
import { initialOrders, products } from "../data/demo-data.js";
import { initialInventoryLots } from "../data/operations-demo.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let orders = readStorage("orders", initialOrders);
let prices = readStorage("prices", Object.fromEntries(products.map((product) => [product.id, product.price])));
let waste = readStorage("waste", []);
let lots = readStorage("inventory-lots", initialInventoryLots);
const wasteForm = document.querySelector("#waste-form");
let mutationVersion = 0;

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function cloneValue(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function announce(selector, message, state = "success") {
  setStatus(selector, message, state);
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
      writeStorage("orders", orders);
      writeStorage("prices", prices);
      writeStorage("waste", waste);
      writeStorage("inventory-lots", lots);
      renderAll();
      synchronizeWasteForm();
    },
  });
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function productById(productId) {
  return products.find((product) => product.id === productId) ?? null;
}

function unitLabel(unit) {
  return ({ unit: "unidad", units: "unidades" })[unit] ?? unit;
}

function quantityLabel(value, unit) {
  return formatQuantity(value, unitLabel(unit));
}

function applyProductImage(container, product) {
  const image = container.querySelector("img");
  const fallback = container.querySelector("[data-fallback]");
  if (!image || !fallback || !product?.image) {
    if (image) image.hidden = true;
    if (fallback) {
      fallback.hidden = false;
      fallback.textContent = product?.emoji ?? "🥬";
    }
    return;
  }
  image.src = product.image;
  image.alt = product.imageAlt;
  image.style.objectPosition = product.imagePosition ?? "center";
  fallback.textContent = product.emoji;
  image.addEventListener("error", () => {
    image.hidden = true;
    fallback.hidden = false;
  }, { once: true });
}

function statusLabel(status) {
  return ({
    new: "Nuevo",
    preparing: "Preparando",
    pending_weighing: "Pendiente de pesar",
    pending_customer_confirmation: "Esperando confirmación",
    confirmed: "Confirmado",
    ready: "Listo",
    delivering: "En reparto",
    delivered: "Entregado",
  })[status] ?? status;
}

function orderEstimatedTotal(order) {
  return order.lines.reduce((sum, line) => sum + Math.round(line.requestedQuantity * (prices[line.productId] ?? line.price)), 0);
}

function wasteQuantities() {
  return waste.reduce((summary, item) => {
    const unit = ({ unit: "unidad", units: "unidad" })[item.unit] ?? item.unit ?? "kg";
    summary[unit] = (summary[unit] ?? 0) + Math.max(0, Number(item.quantity) || 0);
    return summary;
  }, {});
}

function renderMetrics() {
  const pendingWeight = orders.filter((order) => order.status === "pending_weighing").length;
  const pendingConfirmation = orders.filter((order) => order.status === "pending_customer_confirmation").length;
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  document.querySelector("#metric-active").textContent = activeOrders.length;
  document.querySelector("#metric-weighing").textContent = pendingWeight;
  document.querySelector("#metric-confirmation").textContent = pendingConfirmation;
  document.querySelector("#metric-sales").textContent = formatCLP(activeOrders.reduce((sum, order) => sum + orderEstimatedTotal(order), 0));
  document.querySelector("#metric-waste").textContent = waste.length
    ? formatWasteQuantities({ quantities: wasteQuantities() })
    : "Sin merma";
  document.querySelector("#operations-live-active").textContent = `${activeOrders.length} pedido(s) por preparar`;
  document.querySelector("#operations-live-confirmation").textContent = `${pendingConfirmation} pendiente(s) de confirmación`;
}

function renderOrders() {
  const container = document.querySelector("#orders-list");
  const activeOrders = orders.filter((order) => !["delivered", "cancelled"].includes(order.status));
  container.replaceChildren();
  if (!activeOrders.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay pedidos activos en este momento.";
    container.append(empty);
    return;
  }
  activeOrders.forEach((order) => {
    const article = document.createElement("article");
    article.className = "order-card";
    article.innerHTML = `
      <header><div><p class="eyebrow"></p><h3></h3><small></small></div><span class="status-pill"></span></header>
      <div class="order-lines"></div>
      <footer><span></span><button class="button secondary" type="button">Abrir pesaje</button></footer>`;
    article.querySelector(".eyebrow").textContent = order.id;
    article.querySelector("h3").textContent = order.customer;
    article.querySelector("header small").textContent = `${order.fulfillment} · ${order.createdAt}`;
    article.querySelector(".status-pill").textContent = statusLabel(order.status);
    article.querySelector("footer span").textContent = `Estimado ${formatCLP(orderEstimatedTotal(order))}`;
    const lines = article.querySelector(".order-lines");
    order.lines.forEach((line) => {
      const product = productById(line.productId);
      const row = document.createElement("div");
      row.className = "order-product-line";
      row.innerHTML = `<span class="product-thumb"><img loading="lazy" decoding="async"><span data-fallback hidden aria-hidden="true"></span></span><span class="order-product-copy"><strong></strong><small></small></span><b></b>`;
      applyProductImage(row, product);
      row.querySelector(".order-product-copy strong").textContent = line.name;
      row.querySelector(".order-product-copy small").textContent = line.preference;
      row.querySelector("b").textContent = quantityLabel(line.requestedQuantity, line.unit);
      lines.append(row);
    });
    const openButton = article.querySelector("button");
    openButton.setAttribute("aria-label", `Abrir pesaje de ${order.id} para ${order.customer}`);
    openButton.addEventListener("click", () => openWeighing(order.id));
    container.append(article);
  });
}

function openWeighing(orderId) {
  const order = orders.find((item) => item.id === orderId);
  if (!order) return;
  const dialog = document.querySelector("#weighing-dialog");
  dialog.dataset.orderId = orderId;
  dialog.querySelector("h2").textContent = `Preparar ${order.id}`;
  dialog.querySelector("[data-customer]").textContent = `${order.customer} · tolerancia ${order.tolerancePercent}% · adicional ${formatCLP(order.maxExtraAmount)}`;
  const container = dialog.querySelector("[data-lines]");
  container.replaceChildren();
  order.lines.forEach((line, index) => {
    const row = document.createElement("section");
    row.className = "weighing-line";
    row.innerHTML = `
      <div><strong></strong><small></small></div>
      <label>Peso/cantidad real<input type="number" min="0" step="0.01" inputmode="decimal"></label>
      <div class="calculation" aria-live="polite"></div>`;
    row.querySelector("strong").textContent = line.name;
    row.querySelector("small").textContent = `Solicitado: ${quantityLabel(line.requestedQuantity, line.unit)} · ${formatCLP(prices[line.productId] ?? line.price)}/${unitLabel(line.unit)}`;
    const input = row.querySelector("input");
    input.value = line.actualQuantity ?? line.requestedQuantity;
    const calculate = () => {
      const calculation = row.querySelector(".calculation");
      try {
        const result = calculateWeightAdjustment({
          requestedQuantity: line.requestedQuantity,
          actualQuantity: Number(input.value),
          pricePerBaseUnit: prices[line.productId] ?? line.price,
          tolerancePercent: order.tolerancePercent,
          maxExtraAmount: order.maxExtraAmount,
        });
        row.dataset.result = JSON.stringify(result);
        row.dataset.valid = "true";
        calculation.className = `calculation ${result.requiresConfirmation ? "warning" : "success"}`;
        calculation.textContent = `${formatCLP(result.estimatedTotal)} → ${formatCLP(result.finalTotal)} · diferencia ${result.differencePercent}% · ${result.decision === "auto_accepted" ? "aceptación automática" : "consultar cliente"}`;
      } catch (error) {
        row.dataset.valid = "false";
        calculation.className = "calculation warning";
        calculation.textContent = error.message || "Ingresa una cantidad válida.";
      }
      document.querySelector("#save-weighing").disabled = [...dialog.querySelectorAll(".weighing-line")].some((item) => item.dataset.valid === "false");
    };
    input.addEventListener("input", calculate);
    row.dataset.lineIndex = index;
    container.append(row);
    calculate();
  });
  dialog.showModal();
}

function saveWeighing() {
  const dialog = document.querySelector("#weighing-dialog");
  const order = orders.find((item) => item.id === dialog.dataset.orderId);
  const rows = [...dialog.querySelectorAll(".weighing-line")];
  if (!order || rows.some((row) => row.dataset.valid !== "true")) return;
  const previousOrders = cloneValue(orders);
  let requiresConfirmation = false;
  rows.forEach((row) => {
    const index = Number(row.dataset.lineIndex);
    const result = JSON.parse(row.dataset.result);
    order.lines[index].actualQuantity = result.actualQuantity;
    order.lines[index].adjustment = result;
    requiresConfirmation ||= result.requiresConfirmation;
  });
  order.status = requiresConfirmation ? "pending_customer_confirmation" : "confirmed";
  writeStorage("orders", orders);
  dialog.close();
  renderAll();
  offerUndo(`Pesaje de ${order.id} guardado.`, () => { orders = previousOrders; });
}

function renderPrices() {
  const tbody = document.querySelector("#price-table-body");
  tbody.replaceChildren();
  products.forEach((product) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><span class="table-product"><span class="product-thumb"><img loading="lazy" decoding="async"><span data-fallback hidden aria-hidden="true"></span></span><strong></strong></span></td><td></td><td><input type="number" min="1" step="10" inputmode="numeric"></td><td><button class="button small secondary" type="button">Guardar</button></td>`;
    applyProductImage(tr, product);
    tr.querySelector(".table-product strong").textContent = product.name;
    tr.children[1].textContent = `${product.stock} ${product.baseUnitLabel}`;
    const input = tr.querySelector("input");
    input.value = prices[product.id] ?? product.price;
    tr.querySelector("button").addEventListener("click", async () => {
      const value = Math.round(Number(input.value));
      const previousValue = prices[product.id] ?? product.price;
      if (!Number.isFinite(value) || value <= 0) {
        announce("#price-status", `Revisa el precio de ${product.name}.`, "error");
        input.focus();
        return;
      }
      if (value === previousValue) {
        announce("#price-status", `El precio de ${product.name} no cambió.`, "warning");
        return;
      }
      const accepted = await confirmAction({
        title: `Cambiar precio de ${product.name}`,
        message: "El nuevo valor se usará en la operación demo y en los cálculos siguientes.",
        detail: `${formatCLP(previousValue)} → ${formatCLP(value)} por ${product.baseUnitLabel}`,
        confirmLabel: "Cambiar precio",
      });
      if (!accepted) {
        input.value = previousValue;
        return;
      }
      const previousPrices = cloneValue(prices);
      prices[product.id] = value;
      writeStorage("prices", prices);
      announce("#price-status", `Precio de ${product.name} actualizado a ${formatCLP(value)}.`, "success");
      renderMetrics();
      offerUndo(`Precio de ${product.name} actualizado.`, () => { prices = previousPrices; });
    });
    tbody.append(tr);
  });
}

function productLots(productId) {
  return recommendFEFO(lots.filter((lot) => lot.productId === productId));
}

function synchronizeWasteForm() {
  const product = productById(wasteForm.product.value);
  const active = product ? productLots(product.id) : [];
  const remaining = active.reduce((sum, lot) => sum + lotRemaining(lot), 0);
  const label = product?.baseUnitLabel ?? "unidad";
  document.querySelector("#waste-quantity-label").textContent = `Cantidad en ${label}`;
  document.querySelector("#waste-stock-help").textContent = active.length
    ? `Disponible por lotes: ${quantityLabel(remaining, product.baseUnit)}.`
    : "Este producto no tiene un lote activo. Recíbelo primero desde Inventario.";
  wasteForm.quantity.max = active.length ? String(remaining) : "0";
  wasteForm.quantity.step = product?.baseUnit === "unit" ? "1" : "0.01";
  wasteForm.querySelector("button[type=submit]").disabled = !active.length;
}

function consumeWaste(product, quantity) {
  const ordered = productLots(product.id);
  const totalRemaining = ordered.reduce((sum, lot) => sum + lotRemaining(lot), 0);
  if (quantity > totalRemaining) throw new Error(`Solo hay ${quantityLabel(totalRemaining, product.baseUnit)} disponibles.`);
  let pending = quantity;
  let estimatedCost = 0;
  const lotIds = [];
  for (const candidate of ordered) {
    if (pending <= 0) break;
    const amount = Math.min(pending, lotRemaining(candidate));
    const index = lots.findIndex((lot) => lot.id === candidate.id);
    lots[index] = applyLotMovement(lots[index], { type: "waste", quantity: amount });
    estimatedCost += Math.round(amount * Number(candidate.unitCost ?? product.cost ?? 0));
    lotIds.push(candidate.id);
    pending = Math.round((pending - amount) * 1000) / 1000;
  }
  return { estimatedCost, lotIds };
}

async function registerWaste(event) {
  event.preventDefault();
  const product = productById(wasteForm.product.value);
  const quantity = Number(wasteForm.quantity.value);
  if (!product || !Number.isFinite(quantity) || quantity <= 0) {
    announce("#waste-status", "Selecciona un producto e ingresa una cantidad válida.", "error");
    return;
  }
  const accepted = await confirmAction({
    title: `Registrar merma de ${product.name}`,
    message: "La cantidad se descontará de los lotes que deben salir primero.",
    detail: `${quantityLabel(quantity, product.baseUnit)} · motivo: ${wasteForm.reason.value}`,
    confirmLabel: "Registrar merma",
    tone: "danger",
  });
  if (!accepted) return;

  const snapshot = { waste: cloneValue(waste), lots: cloneValue(lots) };
  try {
    const allocation = consumeWaste(product, quantity);
    waste.push({
      id: crypto.randomUUID(),
      productId: product.id,
      productName: product.name,
      quantity,
      unit: product.baseUnit,
      reason: wasteForm.reason.value,
      estimatedCost: allocation.estimatedCost,
      lotIds: allocation.lotIds,
      createdAt: new Date().toISOString(),
      occurredAt: localDateKey(),
      source: "inventory-lot",
    });
    writeStorage("waste", waste);
    writeStorage("inventory-lots", lots);
    wasteForm.quantity.value = "";
    announce("#waste-status", `Merma registrada: ${quantityLabel(quantity, product.baseUnit)} de ${product.name}.`, "success");
    renderAll();
    synchronizeWasteForm();
    offerUndo(`Merma de ${product.name} registrada.`, () => {
      waste = snapshot.waste;
      lots = snapshot.lots;
    });
  } catch (error) {
    announce("#waste-status", error.message, "error");
  }
}

function populateWasteProducts() {
  const select = document.querySelector("#waste-product");
  select.replaceChildren();
  products.forEach((product) => {
    const option = document.createElement("option");
    option.value = product.id;
    option.textContent = product.name;
    select.append(option);
  });
}

function renderAll() {
  renderMetrics();
  renderOrders();
  renderPrices();
}

applyTheme();
populateWasteProducts();
renderAll();
synchronizeWasteForm();
document.querySelector("#close-weighing").addEventListener("click", () => document.querySelector("#weighing-dialog").close());
document.querySelector("#cancel-weighing").addEventListener("click", () => document.querySelector("#weighing-dialog").close());
document.querySelector("#save-weighing").addEventListener("click", saveWeighing);
wasteForm.product.addEventListener("change", synchronizeWasteForm);
wasteForm.addEventListener("submit", registerWaste);
