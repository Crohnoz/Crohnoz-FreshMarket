import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { formatCLP, formatQuantity } from "../core/format.js";
import { calculateWeightAdjustment } from "../domain/weight-adjustment.js";
import { initialOrders, products } from "../data/demo-data.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let orders = readStorage("orders", initialOrders);
let prices = readStorage("prices", Object.fromEntries(products.map((product) => [product.id, product.price])));
let waste = readStorage("waste", []);

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

function renderMetrics() {
  const pendingWeight = orders.filter((order) => order.status === "pending_weighing").length;
  const pendingConfirmation = orders.filter((order) => order.status === "pending_customer_confirmation").length;
  const active = orders.filter((order) => !["delivered", "cancelled"].includes(order.status)).length;
  document.querySelector("#metric-active").textContent = active;
  document.querySelector("#metric-weighing").textContent = pendingWeight;
  document.querySelector("#metric-confirmation").textContent = pendingConfirmation;
  document.querySelector("#metric-sales").textContent = formatCLP(orders.reduce((sum, order) => sum + orderEstimatedTotal(order), 0));
  document.querySelector("#metric-waste").textContent = `${waste.reduce((sum, item) => sum + item.quantity, 0).toFixed(2)} kg`;
}

function renderOrders() {
  const container = document.querySelector("#orders-list");
  container.replaceChildren();
  orders.forEach((order) => {
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
      row.querySelector("b").textContent = formatQuantity(line.requestedQuantity, line.unit);
      lines.append(row);
    });
    article.querySelector("button").addEventListener("click", () => openWeighing(order.id));
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
    row.querySelector("small").textContent = `Solicitado: ${formatQuantity(line.requestedQuantity, line.unit)} · ${formatCLP(prices[line.productId] ?? line.price)}/${line.unit}`;
    const input = row.querySelector("input");
    input.value = line.actualQuantity ?? line.requestedQuantity;
    const calculate = () => {
      const result = calculateWeightAdjustment({
        requestedQuantity: line.requestedQuantity,
        actualQuantity: Number(input.value),
        pricePerBaseUnit: prices[line.productId] ?? line.price,
        tolerancePercent: order.tolerancePercent,
        maxExtraAmount: order.maxExtraAmount,
      });
      row.dataset.result = JSON.stringify(result);
      const calculation = row.querySelector(".calculation");
      calculation.className = `calculation ${result.requiresConfirmation ? "warning" : "success"}`;
      calculation.textContent = `${formatCLP(result.estimatedTotal)} → ${formatCLP(result.finalTotal)} · diferencia ${result.differencePercent}% · ${result.decision === "auto_accepted" ? "aceptación automática" : "consultar cliente"}`;
    };
    input.addEventListener("input", calculate);
    calculate();
    row.dataset.lineIndex = index;
    container.append(row);
  });
  dialog.showModal();
}

function saveWeighing() {
  const dialog = document.querySelector("#weighing-dialog");
  const order = orders.find((item) => item.id === dialog.dataset.orderId);
  if (!order) return;
  let requiresConfirmation = false;
  dialog.querySelectorAll(".weighing-line").forEach((row) => {
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
}

function renderPrices() {
  const tbody = document.querySelector("#price-table-body");
  tbody.replaceChildren();
  products.forEach((product) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td><span class="table-product"><span class="product-thumb"><img loading="lazy" decoding="async"><span data-fallback hidden aria-hidden="true"></span></span><strong></strong></span></td><td></td><td><input type="number" min="0" step="10"></td><td><button class="button small secondary" type="button">Guardar</button></td>`;
    applyProductImage(tr, product);
    tr.querySelector(".table-product strong").textContent = product.name;
    tr.children[1].textContent = `${product.stock} ${product.baseUnitLabel}`;
    const input = tr.querySelector("input");
    input.value = prices[product.id] ?? product.price;
    tr.querySelector("button").addEventListener("click", () => {
      prices[product.id] = Math.max(0, Math.round(Number(input.value)));
      writeStorage("prices", prices);
      renderAll();
    });
    tbody.append(tr);
  });
}

function registerWaste(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const product = products.find((item) => item.id === form.product.value);
  const quantity = Number(form.quantity.value);
  if (!product || !Number.isFinite(quantity) || quantity <= 0) return;
  waste.push({
    id: crypto.randomUUID(),
    productId: product.id,
    productName: product.name,
    quantity,
    reason: form.reason.value,
    createdAt: new Date().toISOString(),
  });
  writeStorage("waste", waste);
  form.reset();
  renderAll();
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
document.querySelector("#close-weighing").addEventListener("click", () => document.querySelector("#weighing-dialog").close());
document.querySelector("#cancel-weighing").addEventListener("click", () => document.querySelector("#weighing-dialog").close());
document.querySelector("#save-weighing").addEventListener("click", saveWeighing);
document.querySelector("#waste-form").addEventListener("submit", registerWaste);
