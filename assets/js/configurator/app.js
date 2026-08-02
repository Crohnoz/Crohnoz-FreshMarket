import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, resetDemoStorage, writeStorage } from "../core/storage.js";
import { products, initialOrders } from "../data/demo-data.js";

const form = document.querySelector("#business-form");
const preview = document.querySelector("#business-preview");
let business = readStorage("business", DEFAULT_BUSINESS);

function fillForm() {
  Object.entries(business).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value;
  });
}

function readForm() {
  const data = new FormData(form);
  return {
    name: String(data.get("name") || DEFAULT_BUSINESS.name).trim(),
    tagline: String(data.get("tagline") || DEFAULT_BUSINESS.tagline).trim(),
    whatsapp: String(data.get("whatsapp") || "").replace(/\D/g, ""),
    primaryColor: String(data.get("primaryColor") || DEFAULT_BUSINESS.primaryColor),
    accentColor: String(data.get("accentColor") || DEFAULT_BUSINESS.accentColor),
    darkMode: form.elements.darkMode.checked,
    isOpen: form.elements.isOpen.checked,
    deliveryFee: Math.max(0, Math.round(Number(data.get("deliveryFee")) || 0)),
    tolerancePercent: Math.max(0, Number(data.get("tolerancePercent")) || 0),
    maxExtraAmount: Math.max(0, Math.round(Number(data.get("maxExtraAmount")) || 0)),
  };
}

function renderPreview() {
  const current = readForm();
  preview.style.setProperty("--preview-primary", current.primaryColor);
  preview.style.setProperty("--preview-accent", current.accentColor);
  preview.dataset.theme = current.darkMode ? "dark" : "light";
  preview.querySelector("h2").textContent = current.name;
  preview.querySelector("p").textContent = current.tagline;
  preview.querySelector("[data-status]").textContent = current.isOpen ? "Abierto ahora" : "Cerrado temporalmente";
  preview.querySelector("[data-tolerance]").textContent = `${current.tolerancePercent}% de tolerancia`;
}

function save(event) {
  event.preventDefault();
  business = readForm();
  writeStorage("business", business);
  document.querySelector("#save-status").textContent = "Configuración guardada en este navegador.";
  renderPreview();
}

function reset() {
  resetDemoStorage();
  business = structuredClone(DEFAULT_BUSINESS);
  writeStorage("business", business);
  writeStorage("orders", initialOrders);
  writeStorage("prices", Object.fromEntries(products.map((product) => [product.id, product.price])));
  fillForm();
  renderPreview();
  document.querySelector("#save-status").textContent = "Datos demo restablecidos.";
}

fillForm();
renderPreview();
form.addEventListener("input", renderPreview);
form.addEventListener("submit", save);
document.querySelector("#reset-demo").addEventListener("click", reset);
document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
