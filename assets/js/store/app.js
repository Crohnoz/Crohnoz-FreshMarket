import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { formatCLP } from "../core/format.js";
import { calculateEstimatedTotal } from "../domain/pricing.js";
import { SUBSTITUTION_POLICIES } from "../domain/substitutions.js";
import { categories, products } from "../data/demo-data.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let cart = readStorage("cart", []);
let activeCategory = "all";

const productGrid = document.querySelector("#product-grid");
const categoryList = document.querySelector("#category-list");
const searchInput = document.querySelector("#product-search");
const cartDrawer = document.querySelector("#cart-drawer");
const cartItems = document.querySelector("#cart-items");
const cartCount = document.querySelector("#cart-count");
const cartTotal = document.querySelector("#cart-total");
const toast = document.querySelector("#toast");

function applyBusiness() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelectorAll("[data-business-tagline]").forEach((node) => { node.textContent = business.tagline; });
  document.querySelector("#business-status").textContent = business.isOpen ? "Abierto ahora" : "Cerrado temporalmente";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2200);
}

function createOption(option) {
  const element = document.createElement("option");
  element.value = option.id;
  element.textContent = option.label;
  return element;
}

function renderProducts() {
  const query = searchInput.value.trim().toLowerCase();
  productGrid.replaceChildren();
  const visible = products.filter((product) => {
    const categoryMatch = activeCategory === "all" || product.category === activeCategory;
    const searchMatch = !query || `${product.name} ${product.description}`.toLowerCase().includes(query);
    return categoryMatch && searchMatch;
  });

  for (const product of visible) {
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-visual" aria-hidden="true"><span>${product.emoji}</span></div>
      <div class="product-body">
        <div class="product-heading"><div><p class="eyebrow">${product.baseUnitLabel}</p><h3></h3></div><strong></strong></div>
        <p class="product-description"></p>
        <div class="product-controls">
          <label>Presentación<select data-role="option"></select></label>
          <label>Preferencia<select data-role="preference"></select></label>
          <label>Sustitución<select data-role="substitution"></select></label>
        </div>
        <button class="button primary full" type="button" data-role="add">Agregar al pedido</button>
      </div>`;
    card.querySelector("h3").textContent = product.name;
    card.querySelector("strong").textContent = `${formatCLP(product.price)} / ${product.baseUnitLabel}`;
    card.querySelector(".product-description").textContent = product.description;
    const optionSelect = card.querySelector("[data-role='option']");
    product.options.forEach((option) => optionSelect.append(createOption(option)));
    const preferenceSelect = card.querySelector("[data-role='preference']");
    product.preferences.forEach((preference) => {
      const option = document.createElement("option");
      option.value = preference;
      option.textContent = preference;
      preferenceSelect.append(option);
    });
    const substitutionSelect = card.querySelector("[data-role='substitution']");
    SUBSTITUTION_POLICIES.forEach((policy) => {
      const option = document.createElement("option");
      option.value = policy.value;
      option.textContent = policy.label;
      substitutionSelect.append(option);
    });
    card.querySelector("[data-role='add']").addEventListener("click", () => {
      addToCart(product, optionSelect.value, preferenceSelect.value, substitutionSelect.value);
    });
    productGrid.append(card);
  }

  document.querySelector("#empty-products").hidden = visible.length > 0;
}

function renderCategories() {
  categoryList.replaceChildren();
  categories.forEach((category) => {
    const button = document.createElement("button");
    button.className = `chip ${activeCategory === category.id ? "active" : ""}`;
    button.type = "button";
    button.textContent = category.name;
    button.addEventListener("click", () => {
      activeCategory = category.id;
      renderCategories();
      renderProducts();
    });
    categoryList.append(button);
  });
}

function addToCart(product, optionId, preference, substitution) {
  const option = product.options.find((item) => item.id === optionId);
  const lineId = `${product.id}:${option.id}:${preference}:${substitution}`;
  const existing = cart.find((item) => item.id === lineId);
  if (existing) existing.multiplier += 1;
  else {
    cart.push({
      id: lineId,
      productId: product.id,
      name: product.name,
      emoji: product.emoji,
      optionLabel: option.label,
      quantityBase: option.quantityBase,
      unit: product.baseUnit,
      price: product.price,
      fixedPrice: option.fixedPrice ?? null,
      preference,
      substitution,
      multiplier: 1,
    });
  }
  writeStorage("cart", cart);
  renderCart();
  showToast(`${product.name} agregado al pedido`);
}

function lineTotal(line) {
  return calculateEstimatedTotal({
    quantityBase: line.quantityBase * line.multiplier,
    pricePerBaseUnit: line.price,
    fixedPrice: line.fixedPrice === null ? null : line.fixedPrice * line.multiplier,
  });
}

function renderCart() {
  cartItems.replaceChildren();
  let total = 0;
  let count = 0;
  if (!cart.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "Tu pedido todavía está vacío.";
    cartItems.append(empty);
  }
  cart.forEach((line) => {
    total += lineTotal(line);
    count += line.multiplier;
    const item = document.createElement("article");
    item.className = "cart-line";
    item.innerHTML = `
      <span class="cart-emoji" aria-hidden="true"></span>
      <div><strong></strong><small></small><div class="stepper"><button type="button" data-step="-1">−</button><span></span><button type="button" data-step="1">+</button></div></div>
      <b></b>`;
    item.querySelector(".cart-emoji").textContent = line.emoji;
    item.querySelector("strong").textContent = line.name;
    item.querySelector("small").textContent = `${line.optionLabel} · ${line.preference}`;
    item.querySelector(".stepper span").textContent = line.multiplier;
    item.querySelector("b").textContent = formatCLP(lineTotal(line));
    item.querySelectorAll("[data-step]").forEach((button) => {
      button.addEventListener("click", () => updateMultiplier(line.id, Number(button.dataset.step)));
    });
    cartItems.append(item);
  });
  cartCount.textContent = count;
  document.querySelector("#mobile-cart-count").textContent = count;
  cartTotal.textContent = formatCLP(total);
}

function updateMultiplier(id, change) {
  const line = cart.find((item) => item.id === id);
  if (!line) return;
  line.multiplier += change;
  cart = cart.filter((item) => item.multiplier > 0);
  writeStorage("cart", cart);
  renderCart();
}

function openCart() {
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  document.querySelector("#overlay").classList.add("show");
}

function closeCart() {
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
  document.querySelector("#overlay").classList.remove("show");
}

function buildOrderMessage() {
  const customer = document.querySelector("#customer-name").value.trim() || "Cliente demo";
  const mode = document.querySelector("input[name='fulfillment']:checked").value;
  const notes = document.querySelector("#order-notes").value.trim();
  const lines = cart.map((line) => `• ${line.multiplier} × ${line.name} (${line.optionLabel}) — ${line.preference}; sustitución: ${line.substitution}`);
  const subtotal = cart.reduce((sum, line) => sum + lineTotal(line), 0);
  const delivery = mode === "Delivery" ? business.deliveryFee : 0;
  return [
    `Hola, soy ${customer}. Quiero realizar este pedido en ${business.name}:`,
    "",
    ...lines,
    "",
    `Modalidad: ${mode}`,
    `Total estimado: ${formatCLP(subtotal + delivery)}`,
    `Tolerancia de pesaje: ${business.tolerancePercent}%`,
    `Adicional autorizado: ${formatCLP(business.maxExtraAmount)}`,
    notes ? `Notas: ${notes}` : "",
    "",
    "Entiendo que el monto final puede variar según el peso real preparado.",
  ].filter(Boolean).join("\n");
}

async function submitOrder() {
  if (!cart.length) return showToast("Agrega productos antes de confirmar");
  const message = buildOrderMessage();
  try {
    await navigator.clipboard.writeText(message);
  } catch {
    // La vista previa permite copiar manualmente si el navegador bloquea el portapapeles.
  }
  document.querySelector("#message-preview").value = message;
  document.querySelector("#message-dialog").showModal();
}

applyBusiness();
renderCategories();
renderProducts();
renderCart();
searchInput.addEventListener("input", renderProducts);
document.querySelector("#open-cart").addEventListener("click", openCart);
document.querySelector("#mobile-cart").addEventListener("click", openCart);
document.querySelector("#close-cart").addEventListener("click", closeCart);
document.querySelector("#overlay").addEventListener("click", closeCart);
document.querySelector("#submit-order").addEventListener("click", submitOrder);
document.querySelector("#close-message").addEventListener("click", () => document.querySelector("#message-dialog").close());
document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
