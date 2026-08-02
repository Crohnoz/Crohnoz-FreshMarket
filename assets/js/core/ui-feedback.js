let toastRegion = null;
let confirmationDialog = null;
let confirmationResolver = null;
let confirmationReturnFocus = null;

const ICONS = Object.freeze({
  success: "✓",
  warning: "!",
  error: "×",
  info: "i",
});

function ensureToastRegion() {
  if (toastRegion?.isConnected) return toastRegion;
  toastRegion = document.createElement("section");
  toastRegion.className = "app-toast-region";
  toastRegion.setAttribute("aria-label", "Notificaciones");
  toastRegion.setAttribute("aria-live", "polite");
  document.body.append(toastRegion);
  return toastRegion;
}

function removeToast(toast) {
  if (!toast?.isConnected) return;
  toast.classList.add("leaving");
  window.setTimeout(() => toast.remove(), 180);
}

export function setStatus(target, message = "", state = "info") {
  const element = typeof target === "string" ? document.querySelector(target) : target;
  if (!element) return;
  element.textContent = String(message ?? "");
  if (message) element.dataset.state = state;
  else delete element.dataset.state;
}

export function showToast({
  message,
  state = "success",
  actionLabel = "",
  onAction = null,
  duration = 6500,
} = {}) {
  const region = ensureToastRegion();
  const toast = document.createElement("article");
  toast.className = `app-toast app-toast-${state}`;
  toast.setAttribute("role", state === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "app-toast-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = ICONS[state] ?? ICONS.info;

  const copy = document.createElement("p");
  copy.textContent = String(message ?? "Acción completada.");

  const actions = document.createElement("div");
  actions.className = "app-toast-actions";

  if (actionLabel && typeof onAction === "function") {
    const action = document.createElement("button");
    action.type = "button";
    action.className = "app-toast-action";
    action.textContent = actionLabel;
    action.addEventListener("click", async () => {
      action.disabled = true;
      try {
        await onAction();
        removeToast(toast);
      } catch (error) {
        action.disabled = false;
        showToast({ message: error?.message ?? "No se pudo deshacer la acción.", state: "error" });
      }
    });
    actions.append(action);
  }

  const close = document.createElement("button");
  close.type = "button";
  close.className = "app-toast-close";
  close.setAttribute("aria-label", "Cerrar notificación");
  close.textContent = "×";
  close.addEventListener("click", () => removeToast(toast));
  actions.append(close);

  toast.append(icon, copy, actions);
  region.prepend(toast);
  while (region.children.length > 3) region.lastElementChild?.remove();

  if (duration > 0) {
    const timer = window.setTimeout(() => removeToast(toast), duration);
    toast.addEventListener("mouseenter", () => window.clearTimeout(timer), { once: true });
    toast.addEventListener("focusin", () => window.clearTimeout(timer), { once: true });
  }
  return toast;
}

function closeConfirmation(result) {
  if (!confirmationDialog) return;
  if (confirmationDialog.open) confirmationDialog.close();
  const resolver = confirmationResolver;
  confirmationResolver = null;
  resolver?.(Boolean(result));
  confirmationReturnFocus?.focus?.({ preventScroll: true });
  confirmationReturnFocus = null;
}

function ensureConfirmationDialog() {
  if (confirmationDialog?.isConnected) return confirmationDialog;
  confirmationDialog = document.createElement("dialog");
  confirmationDialog.className = "app-confirm-dialog";
  confirmationDialog.innerHTML = `
    <form method="dialog" class="app-confirm-card">
      <div class="app-confirm-icon" aria-hidden="true"></div>
      <div class="app-confirm-copy">
        <p class="eyebrow">Revisión antes de guardar</p>
        <h2 data-confirm-title></h2>
        <p data-confirm-message></p>
        <div class="app-confirm-detail" data-confirm-detail hidden></div>
      </div>
      <div class="app-confirm-actions">
        <button class="button secondary" type="button" data-confirm-cancel>Volver</button>
        <button class="button primary" type="button" data-confirm-accept>Confirmar</button>
      </div>
    </form>`;
  confirmationDialog.querySelector("[data-confirm-cancel]").addEventListener("click", () => closeConfirmation(false));
  confirmationDialog.querySelector("[data-confirm-accept]").addEventListener("click", () => closeConfirmation(true));
  confirmationDialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeConfirmation(false);
  });
  confirmationDialog.addEventListener("click", (event) => {
    if (event.target === confirmationDialog) closeConfirmation(false);
  });
  document.body.append(confirmationDialog);
  return confirmationDialog;
}

export function confirmAction({
  title = "¿Confirmar esta acción?",
  message = "Revisa los datos antes de continuar.",
  detail = "",
  confirmLabel = "Confirmar",
  cancelLabel = "Volver",
  tone = "primary",
} = {}) {
  if (confirmationResolver) return Promise.resolve(false);
  if (typeof HTMLDialogElement === "undefined") {
    return Promise.resolve(window.confirm(`${title}\n\n${message}${detail ? `\n\n${detail}` : ""}`));
  }

  const dialog = ensureConfirmationDialog();
  confirmationReturnFocus = document.activeElement;
  dialog.dataset.tone = tone;
  dialog.querySelector("[data-confirm-title]").textContent = title;
  dialog.querySelector("[data-confirm-message]").textContent = message;
  const detailElement = dialog.querySelector("[data-confirm-detail]");
  detailElement.textContent = detail;
  detailElement.hidden = !detail;
  dialog.querySelector("[data-confirm-cancel]").textContent = cancelLabel;
  const accept = dialog.querySelector("[data-confirm-accept]");
  accept.textContent = confirmLabel;
  accept.className = `button ${tone === "danger" ? "danger" : "primary"}`;

  return new Promise((resolve) => {
    confirmationResolver = resolve;
    dialog.showModal();
    window.setTimeout(() => accept.focus(), 0);
  });
}

export function setButtonPending(button, pending, label = "Guardando…") {
  if (!button) return;
  if (pending) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = label;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
    delete button.dataset.originalLabel;
  }
}
