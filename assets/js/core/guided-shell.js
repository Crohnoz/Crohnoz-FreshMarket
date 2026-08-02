import { readStorage, writeStorage } from "./storage.js";

const ONBOARDING_KEY = "guided-onboarding-v1";
const EASY_MODE_KEY = "easy-mode";

const onboardingSteps = [
  {
    icon: "👋",
    eyebrow: "Bienvenida",
    title: "Elige lo que quieres hacer",
    text: "En Inicio del negocio encontrarás botones grandes para vender, anotar fiados, recibir abonos y preparar pedidos.",
  },
  {
    icon: "🎙️",
    eyebrow: "Ayuda por voz",
    title: "También puedes decirlo",
    text: "El copiloto escucha una frase corta, muestra lo que entendió y prepara una propuesta. Nada se guarda sin tu confirmación.",
  },
  {
    icon: "🧮",
    eyebrow: "Cálculo asistido",
    title: "Revisa el total antes de guardar",
    text: "El sistema multiplica cantidades y precios, pero siempre debes revisar la persona, los productos y el monto final.",
  },
  {
    icon: "✅",
    eyebrow: "Control humano",
    title: "Confirma con calma",
    text: "Fiados, abonos y cambios de peso requieren una acción explícita. Puedes corregir o cancelar antes de registrar.",
  },
];

function currentPage() {
  const filename = window.location.pathname.split("/").pop() || "index.html";
  return filename || "index.html";
}

function isStorefront() {
  return currentPage() === "index.html";
}

function isOperatorSurface() {
  return !isStorefront();
}

function setEasyMode(enabled) {
  document.documentElement.dataset.easyMode = enabled ? "true" : "false";
  writeStorage(EASY_MODE_KEY, Boolean(enabled));
  document.querySelectorAll("[data-easy-mode-toggle]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Boolean(enabled)));
    button.textContent = enabled ? "Vista normal" : "Modo fácil";
  });
}

function createOperatorBottomNav() {
  const page = currentPage();
  const items = [
    { label: "Inicio", icon: "⌂", href: "operar.html", active: page === "operar.html" },
    { label: "Vender", icon: "🧾", href: "cuentas.html?task=sale#transaction-form", active: false },
    { label: "Pedidos", icon: "⚖️", href: "admin.html#orders-list", active: page === "admin.html" },
    { label: "Fiados", icon: "📒", href: "cuentas.html", active: page === "cuentas.html" },
    { label: "Hablar", icon: "🎙️", href: "cuentas.html?task=voice#voice-copilot", active: false },
  ];

  const nav = document.createElement("nav");
  nav.className = "mobile-bottom-nav operator-bottom-nav";
  nav.setAttribute("aria-label", "Acciones principales del negocio");
  items.forEach((item) => {
    const link = document.createElement("a");
    link.href = item.href;
    link.innerHTML = `<span aria-hidden="true">${item.icon}</span><b>${item.label}</b>`;
    if (item.active) link.setAttribute("aria-current", "page");
    nav.append(link);
  });
  document.body.append(nav);
}

function createStoreBottomNav() {
  const nav = document.createElement("nav");
  nav.className = "mobile-bottom-nav store-bottom-nav";
  nav.setAttribute("aria-label", "Navegación de la tienda");
  nav.innerHTML = `
    <a href="#inicio" aria-current="page"><span aria-hidden="true">⌂</span><b>Inicio</b></a>
    <a href="#catalogo"><span aria-hidden="true">🥬</span><b>Productos</b></a>
    <button type="button" data-open-mobile-cart><span aria-hidden="true">🧺</span><b>Pedido</b></button>
    <a href="operar.html"><span aria-hidden="true">▦</span><b>Negocio</b></a>`;
  nav.querySelector("[data-open-mobile-cart]").addEventListener("click", () => {
    document.querySelector("#open-cart")?.click();
  });
  document.body.append(nav);
}

function createOnboardingDialog() {
  const dialog = document.createElement("dialog");
  dialog.id = "guided-onboarding";
  dialog.className = "guided-onboarding";
  dialog.innerHTML = `
    <div class="guided-dialog-top">
      <div><p class="eyebrow" data-guide-eyebrow></p><span class="guided-progress" data-guide-progress></span></div>
      <button class="icon-button" type="button" data-guide-close aria-label="Cerrar guía">×</button>
    </div>
    <div class="guided-step">
      <div class="guided-step-icon" data-guide-icon aria-hidden="true"></div>
      <h2 data-guide-title></h2>
      <p data-guide-text></p>
    </div>
    <label class="guided-easy-toggle"><input type="checkbox" data-guide-easy> Usar controles y textos más grandes</label>
    <div class="guided-dialog-actions">
      <button class="button secondary" type="button" data-guide-previous>Anterior</button>
      <button class="button secondary" type="button" data-guide-skip>Omitir</button>
      <button class="button primary" type="button" data-guide-next>Siguiente</button>
    </div>`;
  document.body.append(dialog);
  return dialog;
}

function mountOnboarding() {
  const dialog = createOnboardingDialog();
  let stepIndex = 0;
  const eyebrow = dialog.querySelector("[data-guide-eyebrow]");
  const progress = dialog.querySelector("[data-guide-progress]");
  const icon = dialog.querySelector("[data-guide-icon]");
  const title = dialog.querySelector("[data-guide-title]");
  const text = dialog.querySelector("[data-guide-text]");
  const previous = dialog.querySelector("[data-guide-previous]");
  const next = dialog.querySelector("[data-guide-next]");
  const easy = dialog.querySelector("[data-guide-easy]");

  function render() {
    const step = onboardingSteps[stepIndex];
    eyebrow.textContent = step.eyebrow;
    progress.textContent = `${stepIndex + 1} de ${onboardingSteps.length}`;
    icon.textContent = step.icon;
    title.textContent = step.title;
    text.textContent = step.text;
    previous.disabled = stepIndex === 0;
    next.textContent = stepIndex === onboardingSteps.length - 1 ? "Comenzar" : "Siguiente";
    easy.checked = document.documentElement.dataset.easyMode === "true";
  }

  function close(complete = false) {
    if (complete) writeStorage(ONBOARDING_KEY, true);
    if (dialog.open) dialog.close();
    else dialog.removeAttribute("open");
  }

  function open(force = false) {
    if (!force && readStorage(ONBOARDING_KEY, false)) return;
    stepIndex = 0;
    render();
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  previous.addEventListener("click", () => {
    stepIndex = Math.max(0, stepIndex - 1);
    render();
  });
  next.addEventListener("click", () => {
    if (stepIndex < onboardingSteps.length - 1) {
      stepIndex += 1;
      render();
      return;
    }
    close(true);
  });
  easy.addEventListener("change", () => setEasyMode(easy.checked));
  dialog.querySelector("[data-guide-close]").addEventListener("click", () => close(false));
  dialog.querySelector("[data-guide-skip]").addEventListener("click", () => close(true));

  return { open };
}

function createGuidedTools(onboarding) {
  if (!isOperatorSurface()) return;
  const tools = document.createElement("div");
  tools.className = "guided-tools";
  tools.innerHTML = `
    <button type="button" data-guide-open>Ver guía</button>
    <button type="button" data-easy-mode-toggle aria-pressed="false">Modo fácil</button>`;
  tools.querySelector("[data-guide-open]").addEventListener("click", () => onboarding.open(true));
  tools.querySelector("[data-easy-mode-toggle]").addEventListener("click", () => {
    setEasyMode(document.documentElement.dataset.easyMode !== "true");
  });
  document.body.append(tools);
}

function showTaskNotice(message) {
  const notice = document.createElement("div");
  notice.className = "guided-task-notice";
  notice.setAttribute("role", "status");
  notice.innerHTML = `<span></span><button type="button" aria-label="Cerrar aviso">×</button>`;
  notice.querySelector("span").textContent = message;
  notice.querySelector("button").addEventListener("click", () => notice.remove());
  document.body.append(notice);
  window.setTimeout(() => notice.classList.add("show"), 30);
  window.setTimeout(() => notice.remove(), 7000);
}

function focusWhenAvailable(selector, callback, attempts = 30) {
  const element = document.querySelector(selector);
  if (element) {
    callback(element);
    return;
  }
  if (attempts > 0) window.setTimeout(() => focusWhenAvailable(selector, callback, attempts - 1), 100);
}

function applyTaskDeepLink() {
  if (currentPage() !== "cuentas.html") return;
  const task = new URLSearchParams(window.location.search).get("task");
  if (!task) return;

  if (task === "sale" || task === "credit-sale") {
    focusWhenAvailable("#transaction-form", (form) => {
      if (task === "credit-sale") {
        const settlement = form.querySelector("#settlement");
        settlement.value = "credit";
        settlement.dispatchEvent(new Event("change", { bubbles: true }));
        showTaskNotice("Venta fiada: completa la persona, los productos y revisa el total antes de guardar.");
      } else {
        showTaskNotice("Nueva venta: ingresa la contraparte, cantidades y precios.");
      }
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      form.querySelector("[name=counterparty]")?.focus({ preventScroll: true });
    });
  }

  if (task === "payment" || task === "charge") {
    focusWhenAvailable("#ledger-form", (form) => {
      form.querySelector("[name=type]").value = task;
      form.scrollIntoView({ behavior: "smooth", block: "center" });
      form.querySelector("[name=amount]")?.focus({ preventScroll: true });
      showTaskNotice(task === "payment"
        ? "Abono: elige la persona, ingresa el monto recibido y revisa antes de guardar."
        : "Nuevo fiado: elige la persona, ingresa el monto y agrega un detalle breve.");
    });
  }

  if (task === "voice") {
    focusWhenAvailable("#voice-copilot", (copilot) => {
      copilot.scrollIntoView({ behavior: "smooth", block: "start" });
      copilot.querySelector("#voice-start")?.focus({ preventScroll: true });
      showTaskNotice("Copiloto listo: presiona Hablar y di una instrucción corta.");
    });
  }
}

function initialize() {
  setEasyMode(readStorage(EASY_MODE_KEY, false));
  const onboarding = mountOnboarding();
  createGuidedTools(onboarding);
  if (isStorefront()) createStoreBottomNav();
  else createOperatorBottomNav();
  applyTaskDeepLink();

  if (currentPage() === "operar.html" && !readStorage(ONBOARDING_KEY, false)) {
    window.setTimeout(() => onboarding.open(false), 500);
  }
}

initialize();
