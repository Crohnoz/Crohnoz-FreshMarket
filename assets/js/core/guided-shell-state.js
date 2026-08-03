import { APP_CONFIG } from "./config.js";

function storageKey(name) { return `${APP_CONFIG.storageNamespace}:${name}`; }
function readBoolean(name) {
  try { return JSON.parse(window.localStorage.getItem(storageKey(name)) ?? "false") === true; }
  catch { return false; }
}
function currentSegment() { return window.location.pathname.split("/").filter(Boolean).at(-1) ?? "index.html"; }
function normalizedPage() {
  const segment = currentSegment();
  return ({
    operar: "operar.html",
    dashboard: "admin.html",
    cuentas: "cuentas.html",
    cierre: "cierre.html",
    inventario: "inventario.html",
    compras: "compras.html",
    ventas: "ventas.html",
    "pedidos-remotos": "pedidos-remotos.html",
    asistente: "asistente.html",
    validacion: "validacion.html",
    integridad: "integridad.html",
    auditoria: "auditoria.html",
    conexion: "conexion.html",
    configurar: "configurador.html",
    scanner: "scanner-lab.html",
  })[segment] ?? segment;
}

function synchronizeEasyMode() {
  const enabled = readBoolean("easy-mode");
  document.documentElement.dataset.easyMode = enabled ? "true" : "false";
  document.querySelectorAll("[data-easy-mode-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(enabled));
    button.textContent = enabled ? "Vista normal" : "Modo fácil";
  });
}

function configureOperatorNavigation() {
  const nav = document.querySelector(".operator-bottom-nav");
  if (!nav) return;
  const items = [
    { href: "operar.html", icon: "⌂", label: "Inicio" },
    { href: "ventas.html", icon: "🧾", label: "Ventas" },
    { href: "inventario.html", icon: "🥬", label: "Inventario" },
    { href: "cuentas.html", icon: "📒", label: "Fiados" },
    { href: "cierre.html", icon: "✓", label: "Cierre" },
  ];
  nav.replaceChildren();
  items.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.innerHTML = `<span aria-hidden="true">${item.icon}</span><b>${item.label}</b>`;
    nav.append(link);
  });
}

function synchronizeNavigation() {
  const page = normalizedPage();
  document.querySelectorAll(".operator-bottom-nav a").forEach((link) => {
    link.removeAttribute("aria-current");
    const destination = new URL(link.href, window.location.href).pathname.split("/").pop();
    if (destination === page) link.setAttribute("aria-current", "page");
  });
}

function addOperatorHomeShortcut() {
  const tools = document.querySelector(".guided-tools");
  if (!tools || normalizedPage() === "operar.html") return;
  const link = document.createElement("a");
  link.className = "button secondary small";
  link.href = "operar.html";
  link.textContent = "Inicio del negocio";
  link.hidden = window.matchMedia("(max-width: 760px)").matches;
  tools.append(link);
}

function removeDuplicateMobileCart() {
  const legacyButton = document.querySelector("#mobile-cart");
  if (legacyButton && document.querySelector(".store-bottom-nav")) legacyButton.hidden = true;
}

function openFirstRunGuideFromAlias() {
  if (currentSegment() !== "operar" || readBoolean("guided-onboarding-v3")) return;
  window.setTimeout(() => document.querySelector("[data-guide-open]")?.click(), 550);
}

synchronizeEasyMode();
configureOperatorNavigation();
synchronizeNavigation();
addOperatorHomeShortcut();
removeDuplicateMobileCart();
openFirstRunGuideFromAlias();
