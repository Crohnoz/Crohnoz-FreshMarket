import { confirmAction } from "../core/ui-feedback.js";
import {
  lotRowMatches,
  movementRowMatches,
  summarizeMovementDraft,
  summarizeReceptionDraft,
} from "../domain/inventory-experience.js";

const workspace = document.querySelector("#remote-inventory-workspace");
const viewButtons = [...document.querySelectorAll("[data-inventory-view]")];
const panels = [...document.querySelectorAll("[data-inventory-panel]")];
const receptionForm = document.querySelector("#remote-reception-form");
const movementForm = document.querySelector("#remote-movement-form");
const lotTable = document.querySelector(".remote-lot-table");
const movementTable = document.querySelector(".remote-movement-table");
const lotBody = document.querySelector("#remote-lots-body");
const movementBody = document.querySelector("#remote-movements-body");
const lotSearch = document.querySelector("#remote-lot-search");
const lotFilter = document.querySelector("#remote-lot-filter");
const movementSearch = document.querySelector("#remote-movement-search");
const movementFilter = document.querySelector("#remote-movement-filter");

const VIEW_HASHES = Object.freeze({
  reception: "recibir",
  movement: "movimiento",
  lots: "lotes",
  history: "historial",
});

function selectedText(select) {
  return select?.selectedOptions?.[0]?.textContent?.trim() ?? "";
}

function viewFromHash() {
  const current = location.hash.replace(/^#/, "");
  return Object.entries(VIEW_HASHES).find(([, hash]) => hash === current)?.[0] ?? "lots";
}

function setActiveView(view, { focus = false, updateHash = true } = {}) {
  if (!panels.some((panel) => panel.dataset.inventoryPanel === view)) view = "lots";

  for (const button of viewButtons) {
    const selected = button.dataset.inventoryView === view;
    button.setAttribute("aria-selected", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }

  for (const panel of panels) {
    const selected = panel.dataset.inventoryPanel === view;
    panel.hidden = !selected;
    panel.setAttribute("aria-hidden", String(!selected));
  }

  if (updateHash) history.replaceState(null, "", `#${VIEW_HASHES[view]}`);

  if (focus) {
    const activePanel = panels.find((panel) => panel.dataset.inventoryPanel === view);
    activePanel?.querySelector("h2")?.focus?.({ preventScroll: true });
    activePanel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function draftElements(prefix) {
  return {
    count: document.querySelector(`#${prefix}-draft-count`),
    bar: document.querySelector(`#${prefix}-draft-bar`),
    message: document.querySelector(`#${prefix}-draft-message`),
    list: document.querySelector(`#${prefix}-draft-list`),
  };
}

function renderDraft(summary, elements, readyMessage) {
  if (!elements.count || !elements.bar || !elements.message || !elements.list) return;
  elements.count.textContent = `${summary.completed}/${summary.total}`;
  elements.bar.style.width = `${Math.round((summary.completed / summary.total) * 100)}%`;
  elements.bar.parentElement?.setAttribute("aria-valuenow", String(summary.completed));
  elements.message.textContent = summary.ready
    ? readyMessage
    : `Completa ${summary.total - summary.completed} dato${summary.total - summary.completed === 1 ? "" : "s"} esencial${summary.total - summary.completed === 1 ? "" : "es"}.`;
  elements.list.replaceChildren();
  for (const line of summary.lines) {
    const item = document.createElement("li");
    item.textContent = line;
    elements.list.append(item);
  }
  if (summary.lines.length === 0) {
    const item = document.createElement("li");
    item.textContent = "El resumen aparecerá mientras completas el formulario.";
    elements.list.append(item);
  }
}

function receptionDraft() {
  const data = new FormData(receptionForm);
  return summarizeReceptionDraft({
    productLabel: selectedText(document.querySelector("#remote-reception-product")),
    receivedAt: data.get("receivedAt"),
    bestBefore: data.get("bestBefore"),
    quantity: data.get("quantity"),
    unitCost: data.get("unitCost"),
    qualityLabel: selectedText(receptionForm.elements.quality),
  });
}

function movementDraft() {
  const data = new FormData(movementForm);
  return summarizeMovementDraft({
    lotLabel: selectedText(document.querySelector("#remote-movement-lot")),
    movementLabel: selectedText(document.querySelector("#remote-movement-type")),
    quantity: data.get("quantity"),
    reason: data.get("reason"),
    reference: data.get("reference"),
    adjustment: data.get("movementType") === "adjustment",
  });
}

function updateReceptionDraft() {
  renderDraft(receptionDraft(), draftElements("remote-reception"), "Los datos esenciales están listos para revisión.");
}

function updateMovementDraft() {
  renderDraft(movementDraft(), draftElements("remote-movement"), "El movimiento está listo para revisión.");
}

function decorateTable(table) {
  if (!table) return;
  const labels = [...table.querySelectorAll("thead th")].map((header) => header.textContent.trim());
  for (const row of table.querySelectorAll("tbody tr")) {
    [...row.children].forEach((cell, index) => {
      cell.dataset.label = labels[index] ?? "";
    });
  }
}

function updateTaskBadges() {
  const lotCount = document.querySelector("#remote-lot-count")?.textContent ?? "0";
  const movementCount = document.querySelector("#remote-movement-count")?.textContent ?? "0";
  document.querySelector("[data-task-badge='lots']")?.replaceChildren(document.createTextNode(lotCount));
  document.querySelector("[data-task-badge='history']")?.replaceChildren(document.createTextNode(movementCount));
}

function applyLotFilters() {
  decorateTable(lotTable);
  let visible = 0;
  for (const row of lotBody?.querySelectorAll("tr") ?? []) {
    const riskLevel = row.querySelector(".remote-risk-chip")?.dataset.level ?? "";
    const show = lotRowMatches({
      text: row.textContent,
      riskLevel,
      filter: lotFilter?.value ?? "all",
      query: lotSearch?.value ?? "",
    });
    row.hidden = !show;
    if (show) visible += 1;
  }
  const visibleCount = document.querySelector("#remote-lot-visible-count");
  if (visibleCount) visibleCount.textContent = String(visible);
  updateTaskBadges();
}

function applyMovementFilters() {
  decorateTable(movementTable);
  let visible = 0;
  for (const row of movementBody?.querySelectorAll("tr") ?? []) {
    const typeText = row.children[2]?.textContent ?? "";
    const show = movementRowMatches({
      text: row.textContent,
      typeText,
      filter: movementFilter?.value ?? "all",
      query: movementSearch?.value ?? "",
    });
    row.hidden = !show;
    if (show) visible += 1;
  }
  const visibleCount = document.querySelector("#remote-movement-visible-count");
  if (visibleCount) visibleCount.textContent = String(visible);
  updateTaskBadges();
}

async function confirmFormSubmission(form) {
  if (form === receptionForm) {
    const summary = receptionDraft();
    if (!summary.ready) return false;
    return confirmAction({
      title: "Confirmar recepción remota",
      message: "Se creará un lote nuevo y aumentará el inventario del servidor.",
      detail: summary.detail,
      confirmLabel: "Registrar recepción",
      cancelLabel: "Seguir revisando",
    });
  }

  const summary = movementDraft();
  if (!summary.ready) return false;
  const adjustment = movementForm.elements.movementType.value === "adjustment";
  return confirmAction({
    title: adjustment ? "Confirmar ajuste de inventario" : "Confirmar movimiento remoto",
    message: adjustment
      ? "El saldo del lote será reemplazado por el conteo indicado y quedará auditado."
      : "El saldo del lote disminuirá y el movimiento quedará en el historial inmutable.",
    detail: summary.detail,
    confirmLabel: adjustment ? "Aplicar ajuste" : "Registrar movimiento",
    cancelLabel: "Seguir revisando",
    tone: adjustment ? "danger" : "primary",
  });
}

function firstInvalidControl(form) {
  return [...form.elements].find((control) => typeof control.checkValidity === "function" && !control.checkValidity());
}

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (![receptionForm, movementForm].includes(form)) return;
  if (form.dataset.confirmedSubmit === "true") {
    delete form.dataset.confirmedSubmit;
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (!form.checkValidity()) {
    form.reportValidity();
    firstInvalidControl(form)?.focus();
    return;
  }

  const approved = await confirmFormSubmission(form);
  if (!approved) return;
  form.dataset.confirmedSubmit = "true";
  form.requestSubmit();
}, true);

for (const button of viewButtons) {
  button.addEventListener("click", () => setActiveView(button.dataset.inventoryView, { focus: true }));
  button.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = viewButtons.indexOf(button);
    const targetIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? viewButtons.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + viewButtons.length) % viewButtons.length;
    viewButtons[targetIndex].focus();
    setActiveView(viewButtons[targetIndex].dataset.inventoryView);
  });
}

document.addEventListener("click", (event) => {
  const switcher = event.target.closest("[data-switch-view]");
  if (switcher) setActiveView(switcher.dataset.switchView, { focus: true });
});

lotBody?.addEventListener("click", (event) => {
  if (event.target.closest("button")) setActiveView("movement", { updateHash: true });
}, true);

for (const form of [receptionForm, movementForm]) {
  form?.addEventListener("input", form === receptionForm ? updateReceptionDraft : updateMovementDraft);
  form?.addEventListener("change", form === receptionForm ? updateReceptionDraft : updateMovementDraft);
  form?.addEventListener("reset", () => window.setTimeout(form === receptionForm ? updateReceptionDraft : updateMovementDraft, 0));
}

lotFilter?.addEventListener("change", applyLotFilters);
lotSearch?.addEventListener("input", () => window.setTimeout(applyLotFilters, 0));
movementFilter?.addEventListener("change", applyMovementFilters);
movementSearch?.addEventListener("input", applyMovementFilters);

const lotObserver = new MutationObserver(applyLotFilters);
const movementObserver = new MutationObserver(applyMovementFilters);
if (lotBody) lotObserver.observe(lotBody, { childList: true });
if (movementBody) movementObserver.observe(movementBody, { childList: true });

workspace?.classList.add("inventory-experience-ready");
setActiveView(viewFromHash(), { updateHash: false });
updateReceptionDraft();
updateMovementDraft();
applyLotFilters();
applyMovementFilters();
