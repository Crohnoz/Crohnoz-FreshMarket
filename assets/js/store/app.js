import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { formatCLP } from "../core/format.js";
import { calculateEstimatedTotal } from "../domain/pricing.js";
import { SUBSTITUTION_POLICIES } from "../domain/substitutions.js";
import { categories, products } from "../data/demo-data.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let cart = readStorage("cart", []);
let activeCategory = "all";
let lastFocusedElement = null;
let toastTimer = null;

const productGrid = document.querySelector("#product-grid");
const categoryList = document.querySelector("#category-list");
const searchInput = document.querySelector("#product-search");
const cartDrawer = document.querySelector("#cart-drawer");
const cartItems = document.querySelector("#cart-items");
const cartCount = document.querySelector("#cart-count");
const cartTotal = document.querySelector("#cart-total");
const toast = document.querySelector("#toast");
const customerName = document.querySelector("#customer-name");
const openCartButtons = [document.querySelector("#open-cart"), document.querySelector("#mobile-cart")].filter(Boolean);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function applyBusiness() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelectorAll("[data-business-tagline]").forEach((node) => { node.textContent = business.tagline; });
  const status = document.querySelector("#business-status");
  status.textContent = business.isOpen ? "Abierto ahora" : "Cerrado temporalmente";
  status.className = `status ${business.isOpen ? "success" : "warning"}`;
}

function showToast(message) {
  if (toastTimer) window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function createOption(option) {
  const element = document.createElement("option");
  element.value = option.id;
  element.textContent = option.label;
  return element;
}

function attachImageFallback(image, fallback) {
  image.addEventListener("error", () => {
    image.hidden = true;
    fallback.hidden = false;
  }, { once: true });
}

function renderProducts() {
  const query = normalizeText(searchInput.value);
  productGrid.replaceChildren();
  const visible = products.filter((product) => {
    const categoryMatch = activeCategory === "all" || product.category === activeCategory;
    const searchMatch = !query || normalizeText(`${product.name} ${product.description} ${product.badge}`).includes(query);
    return categoryMatch && searchMatch;
  });

  for (const product of visible) {
    const card = document.createElement("article");
    card.className = "product-card";
    card.innerHTML = `
      <div class="product-visual">
        <img loading="lazy" decoding="async">
        <span class="product-emoji-fallback" hidden aria-hidden="true"></span>
        <span class="product-photo-badge"></span>
      </div>
      <div class="product-body">
        <div class="product-heading"><div><p class="eyebrow"></p><h3></h3></div><strong></strong></div>
        <p class="product-description"></p>
        <div class="product-controls">
          <label>Presentación<select data-role="option"></select></label>
          <label>Preferencia<select data-role="preference"></select></label>
          <label>Sustitución<select data-role="substitution"></select></label>
        </div>
        <button class="button primary full" type="button" data-role="add">Agregar al pedido</button>
      </div>`;

    const image = card.querySelector(".product-visual img");
    const fallback = card.querySelector(".product-emoji-fallback");
    image.src = product.image;
    image.alt = product.imageAlt;
    image.style.objectPosition = product.imagePosition ?? "center";
    fallback.textContent = product.emoji;
    attachImageFallback(image, fallback);
    card.querySelector(".product-photo-badge").textContent = product.badge ?? "Producto fresco";
    card.querySelector(".eyebrow").textContent = product.baseUnitLabel;
    card.querySelector("h3").textContent = product.name;
    card.querySelector(".product-heading strong").textContent = `${formatCLP(product.price)} / ${product.baseUnitLabel}`;
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
    const addButton = card.querySelector("[data-role='add']");
    addButton.setAttribute("aria-label", `Agregar ${product.name} al pedido`);
    addButton.addEventListener("click", () => {
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
    const active = activeCategory === category.id;
    button.className = `chip ${active ? "active" : ""}`;
    button.type = "button";
    button.textContent = category.name;
    button.setAttribute("aria-pressed", String(active));
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
  if (!option) return;
  const lineId = `${product.id}:${option.id}:${preference}:${substitution}`;
  const existing = cart.find((item) => item.id === lineId);
  if (existing) existing.multiplier += 1;
  else {
    cart.push({
      id: lineId,
      productId: product.id,
      name: product.name,
      emoji: product.emoji,
      image: product.image,
      imageAlt: product.imageAlt,
      imagePosition: product.imagePosition,
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
    empty.textContent = "Tu pedido todavía está vacío. Agrega un producto desde el catálogo.";
    cartItems.append(empty);
  }
  cart.forEach((line) => {
    total += lineTotal(line);
    count += line.multiplier;
    const item = document.createElement("article");
    item.className = "cart-line";
    item.innerHTML = `
      <span class="cart-media"><img loading="lazy" decoding="async"><span class="cart-emoji" hidden aria-hidden="true"></span></span>
      <div><strong></strong><small></small><div class="stepper"><button type="button" data-step="-1">−</button><span></span><button type="button" data-step="1">+</button></div></div>
      <b></b>`;
    const image = item.querySelector(".cart-media img");
    const fallback = item.querySelector(".cart-emoji");
    image.src = line.image ?? "";
    image.alt = line.imageAlt ?? line.name;
    image.style.objectPosition = line.imagePosition ?? "center";
    fallback.textContent = line.emoji;
    if (!line.image) {
      image.hidden = true;
      fallback.hidden = false;
    } else {
      attachImageFallback(image, fallback);
    }
    item.querySelector("strong").textContent = line.name;
    item.querySelector("small").textContent = `${line.optionLabel} · ${line.preference}`;
    item.querySelector(".stepper span").textContent = line.multiplier;
    item.querySelector("b").textContent = formatCLP(lineTotal(line));
    const [decrease, increase] = item.querySelectorAll("[data-step]");
    decrease.setAttribute("aria-label", `Quitar una unidad de ${line.name}`);
    increase.setAttribute("aria-label", `Agregar una unidad de ${line.name}`);
    item.querySelectorAll("[data-step]").forEach((button) => {
      button.addEventListener("click", () => updateMultiplier(line.id, Number(button.dataset.step)));
    });
    cartItems.append(item);
  });
  cartCount.textContent = count;
  document.querySelector("#mobile-cart-count").textContent = count;
  cartTotal.textContent = formatCLP(total);
  document.querySelector("#submit-order").disabled = cart.length === 0;
}

function updateMultiplier(id, change) {
  const line = cart.find((item) => item.id === id);
  if (!line) return;
  line.multiplier += change;
  cart = cart.filter((item) => item.multiplier > 0);
  writeStorage("cart", cart);
  renderCart();
}

function setCartExpanded(expanded) {
  openCartButtons.forEach((button) => button.setAttribute("aria-expanded", String(expanded)));
}

function openCart() {
  if (cartDrawer.classList.contains("open")) return;
  lastFocusedElement = document.activeElement;
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  document.querySelector("#overlay").classList.add("show");
  document.body.dataset.cartOpen = "true";
  setCartExpanded(true);
  document.querySelector("#close-cart").focus();
}

function closeCart({ restoreFocus = true } = {}) {
  if (!cartDrawer.classList.contains("open")) return;
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
  document.querySelector("#overlay").classList.remove("show");
  delete document.body.dataset.cartOpen;
  setCartExpanded(false);
  if (restoreFocus && lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
}

function buildOrderMessage() {
  const customer = customerName.value.trim();
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
  if (!cart.length) {
    showToast("Agrega productos antes de confirmar");
    return;
  }
  if (!customerName.value.trim()) {
    openCart();
    showToast("Escribe el nombre para preparar el pedido");
    customerName.focus();
    return;
  }
  const message = buildOrderMessage();
  try {
    await navigator.clipboard.writeText(message);
    showToast("Mensaje copiado. Revisa la vista previa.");
  } catch {
    showToast("Revisa y copia el mensaje desde la vista previa.");
  }
  document.querySelector("#message-preview").value = message;
  closeCart({ restoreFocus: false });
  document.querySelector("#message-dialog").showModal();
}

function trapCartFocus(event) {
  if (event.key !== "Tab" || !cartDrawer.classList.contains("open")) return;
  const focusable = [...cartDrawer.querySelectorAll("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]")];
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

applyBusiness();
renderCategories();
renderProducts();
renderCart();
searchInput.addEventListener("input", renderProducts);
openCartButtons.forEach((button) => button.addEventListener("click", openCart));
document.querySelector("#close-cart").addEventListener("click", () => closeCart());
document.querySelector("#overlay").addEventListener("click", () => closeCart());
document.querySelector("#submit-order").addEventListener("click", submitOrder);
document.querySelector("#close-message").addEventListener("click", () => document.querySelector("#message-dialog").close());
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && cartDrawer.classList.contains("open")) closeCart();
  trapCartFocus(event);
});
document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
