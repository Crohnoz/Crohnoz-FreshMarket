import { APP_CONFIG } from "./config.js";

function storageKey(name) {
  return `${APP_CONFIG.storageNamespace}:${name}`;
}

function readBoolean(name) {
  try {
    return JSON.parse(window.localStorage.getItem(storageKey(name)) ?? "false") === true;
  } catch {
    return false;
  }
}

function normalizedPage() {
  const segment = window.location.pathname.split("/").filter(Boolean).at(-1) ?? "index.html";
  return ({
    operar: "operar.html",
    dashboard: "admin.html",
    cuentas: "cuentas.html",
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

function synchronizeNavigation() {
  const page = normalizedPage();
  document.querySelectorAll(".operator-bottom-nav a").forEach((link) => {
    link.removeAttribute("aria-current");
    const destination = new URL(link.href, window.location.href).pathname.split("/").pop();
    if (destination === page) link.setAttribute("aria-current", "page");
  });
}

function removeDuplicateMobileCart() {
  const legacyButton = document.querySelector("#mobile-cart");
  if (legacyButton && document.querySelector(".store-bottom-nav")) legacyButton.hidden = true;
}

function openFirstRunGuideFromAlias() {
  if (normalizedPage() !== "operar.html" || readBoolean("guided-onboarding-v1")) return;
  window.setTimeout(() => document.querySelector("[data-guide-open]")?.click(), 550);
}

synchronizeEasyMode();
synchronizeNavigation();
removeDuplicateMobileCart();
openFirstRunGuideFromAlias();
