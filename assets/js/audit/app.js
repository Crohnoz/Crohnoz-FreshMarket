import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { readStorage, snapshotStorage } from "../core/storage.js";
import { confirmAction, showToast } from "../core/ui-feedback.js";
import { materializePilotEntries } from "../data/pilot-state.js";
import {
  LOCAL_ORGANIZATION_ID,
  createKernelImportPackage,
  summarizeAuditTrail,
} from "../domain/audit-trail.js";

const business = readStorage("business", DEFAULT_BUSINESS);
const searchInput = document.querySelector("#audit-search");
const collectionFilter = document.querySelector("#audit-collection-filter");
const actionFilter = document.querySelector("#audit-action-filter");
const liveStatus = document.querySelector("#audit-live-status");
let events = [];
let summary = summarizeAuditTrail([]);

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Fecha no disponible";
  return new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "medium" }).format(date);
}

function actionLabel(action) {
  return ({
    "storage.write": "Actualización de datos",
    "storage.remove": "Eliminación local",
    "snapshot.restore": "Restauración de respaldo",
  })[action] ?? String(action || "Acción desconocida");
}

function collectionLabel(collection) {
  return ({
    business: "Configuración",
    orders: "Pedidos",
    prices: "Precios",
    "inventory-lots": "Inventario por lotes",
    suppliers: "Proveedores",
    "purchase-orders": "Compras",
    "order-payments": "Pagos de pedidos",
    "credit-customers": "Clientes con cuenta",
    "credit-ledger": "Movimientos de fiado",
    "daily-transactions": "Operaciones diarias",
    waste: "Mermas",
    "daily-closes": "Cierres diarios",
    "assistant-proposals": "Propuestas asistidas",
    "pilot-validations": "Validaciones del piloto",
    storage: "Almacenamiento completo",
  })[collection] ?? String(collection || "Colección desconocida");
}

function statusCopy(status) {
  if (status === "blocked") return {
    icon: "×",
    title: "Cadena dañada o alterada",
    description: "Uno o más eventos no conservan su secuencia, enlace o hash. No exportes un paquete Kernel hasta revisar el historial.",
  };
  if (status === "healthy") return {
    icon: "✓",
    title: "Cadena local coherente",
    description: "Los eventos mantienen secuencia continua, enlace al hash anterior y contenido verificable.",
  };
  return {
    icon: "!",
    title: "Todavía no hay eventos",
    description: "La primera modificación comercial registrada en este navegador iniciará la cadena de auditoría.",
  };
}

function renderStatus() {
  const copy = statusCopy(summary.status);
  const card = document.querySelector("#audit-status-card");
  card.dataset.state = summary.status;
  document.querySelector("#audit-status-icon").textContent = copy.icon;
  document.querySelector("#audit-status-title").textContent = copy.title;
  document.querySelector("#audit-status-description").textContent = copy.description;
  document.querySelector("#audit-status-detail").textContent = summary.issues.length
    ? `${summary.issues.length} problema(s) detectado(s). Primer hallazgo: ${summary.issues[0].message}`
    : summary.lastOccurredAt
      ? `Último evento: ${formatDateTime(summary.lastOccurredAt)} · ${summary.lastEventHash}`
      : "Actor: local no verificado · organización: org-local-pilot.";
}

function renderMetrics() {
  document.querySelector("#audit-event-count").textContent = summary.eventsChecked;
  document.querySelector("#audit-collection-count").textContent = summary.collectionsTouched;
  document.querySelector("#audit-last-sequence").textContent = summary.lastSequence;
  document.querySelector("#audit-unverified-count").textContent = summary.unverifiedActors;
}

function replaceOptions(select, values, labeler) {
  const current = select.value;
  const all = select.querySelector("option[value='all']");
  select.replaceChildren(all);
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = labeler(value);
    select.append(option);
  });
  select.value = values.includes(current) ? current : "all";
}

function refreshFilters() {
  const collections = [...new Set(events.map((event) => event?.resource?.collection).filter(Boolean))].sort();
  const actions = [...new Set(events.map((event) => event?.action).filter(Boolean))].sort();
  replaceOptions(collectionFilter, collections, collectionLabel);
  replaceOptions(actionFilter, actions, actionLabel);
}

function filteredEvents() {
  const query = normalize(searchInput.value);
  return events.filter((event) => {
    if (collectionFilter.value !== "all" && event?.resource?.collection !== collectionFilter.value) return false;
    if (actionFilter.value !== "all" && event?.action !== actionFilter.value) return false;
    if (!query) return true;
    const haystack = normalize([
      event.id,
      event.sequence,
      event.action,
      actionLabel(event.action),
      event.resource?.collection,
      collectionLabel(event.resource?.collection),
      event.actor?.role,
      event.source,
      event.reason,
    ].join(" "));
    return query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
  });
}

function eventCard(event) {
  const article = document.createElement("article");
  article.className = "audit-event";

  const sequence = document.createElement("span");
  sequence.className = "audit-event-sequence";
  sequence.textContent = `#${event.sequence}`;

  const body = document.createElement("div");
  const heading = document.createElement("div");
  heading.className = "audit-event-heading";
  const title = document.createElement("h3");
  title.textContent = `${actionLabel(event.action)} · ${collectionLabel(event.resource?.collection)}`;
  const time = document.createElement("time");
  time.dateTime = event.occurredAt;
  time.textContent = formatDateTime(event.occurredAt);
  heading.append(title, time);

  const meta = document.createElement("div");
  meta.className = "audit-event-meta";
  [
    `${event.resource?.beforeCount ?? 0} → ${event.resource?.afterCount ?? 0} registros`,
    event.actor?.verified ? "Actor verificado" : "Actor local no verificado",
    event.actor?.role ? `Rol declarado: ${event.actor.role}` : null,
    event.source,
  ].filter(Boolean).forEach((value) => {
    const item = document.createElement("span");
    item.textContent = value;
    meta.append(item);
  });

  const digests = document.createElement("div");
  digests.className = "audit-event-digests";
  const currentHash = document.createElement("span");
  currentHash.textContent = `hash: ${event.eventHash}`;
  const previousHash = document.createElement("span");
  previousHash.textContent = `anterior: ${event.previousEventHash ?? "inicio de cadena"}`;
  digests.append(currentHash, previousHash);

  body.append(heading, meta, digests);
  if (event.reason) {
    const reason = document.createElement("p");
    reason.textContent = event.reason;
    body.append(reason);
  }
  article.append(sequence, body);
  return article;
}

function renderEvents() {
  const visible = filteredEvents().slice().reverse();
  document.querySelector("#audit-list").replaceChildren(...visible.map(eventCard));
  document.querySelector("#audit-empty").hidden = visible.length > 0;
  document.querySelector("#audit-result-count").textContent = `${visible.length} de ${events.length} evento(s) visibles. Los más recientes aparecen primero.`;
}

function announce(message, state = "success") {
  liveStatus.textContent = message;
  liveStatus.dataset.state = state;
}

function loadAudit({ announceResult = false } = {}) {
  events = readStorage("audit-log", []);
  if (!Array.isArray(events)) events = [];
  summary = summarizeAuditTrail(events);
  renderStatus();
  renderMetrics();
  refreshFilters();
  renderEvents();
  if (announceResult) {
    announce(summary.status === "blocked"
      ? "La verificación encontró una ruptura en la cadena."
      : summary.status === "healthy"
        ? "Cadena verificada correctamente."
        : "No existen eventos comerciales todavía.",
    summary.status === "blocked" ? "error" : summary.status === "empty" ? "warning" : "success");
  }
}

function slug(value) {
  return String(value || "negocio-local")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "negocio-local";
}

function downloadJson(value, filename) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function exportKernelPackage() {
  loadAudit();
  if (summary.status === "blocked") {
    announce("No se puede exportar: la cadena de auditoría está dañada.", "error");
    return;
  }
  const accepted = await confirmAction({
    title: "¿Descargar paquete para Crohnoz Kernel?",
    message: "El archivo incluirá los datos comerciales completos del piloto y su historial de auditoría.",
    detail: "No está cifrado. Guárdalo en un lugar controlado y no lo compartas por canales públicos.",
    confirmLabel: "Descargar paquete",
    cancelLabel: "Cancelar",
    tone: "warning",
  });
  if (!accepted) return;

  try {
    const entries = materializePilotEntries(snapshotStorage().entries);
    const packageValue = createKernelImportPackage(entries, {
      organization: {
        id: LOCAL_ORGANIZATION_ID,
        name: business.name,
        slug: slug(business.name),
      },
      appVersion: APP_CONFIG.version,
    });
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(packageValue, `${slug(business.name)}-kernel-import-${date}.json`);
    announce("Paquete Kernel verificado y descargado.", "success");
    showToast({ message: "Paquete de migración descargado.", state: "success" });
  } catch (error) {
    announce(error.message, "error");
    showToast({ message: error.message, state: "error" });
  }
}

applyTheme();
loadAudit();
document.querySelector("#refresh-audit").addEventListener("click", () => loadAudit({ announceResult: true }));
document.querySelector("#export-kernel-package").addEventListener("click", exportKernelPackage);
searchInput.addEventListener("input", renderEvents);
collectionFilter.addEventListener("change", renderEvents);
actionFilter.addEventListener("change", renderEvents);
