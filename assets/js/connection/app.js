import { APP_CONFIG } from "../core/config.js";
import {
  changeApiPassword,
  clearApiSession,
  connectionState,
  fetchConnectionSummary,
  loginToApi,
  logoutFromApi,
  readApiSession,
  readConnectionSettings,
  saveConnectionSettings,
  selectOrganization,
  testApiConnection,
} from "../core/connection.js";
import { formatCLP } from "../core/format.js";
import { confirmAction, setButtonPending, setStatus, showToast } from "../core/ui-feedback.js";

const configForm = document.querySelector("#connection-config-form");
const loginForm = document.querySelector("#login-form");
const organizationForm = document.querySelector("#organization-form");
const passwordForm = document.querySelector("#change-password-form");
const endpointInput = document.querySelector("#api-base-url");
let summaryRequest = 0;

function roleLabel(role) {
  return ({ owner: "Propietario", manager: "Encargada", operator: "Operador", viewer: "Solo lectura" })[role] ?? role;
}

function initials(user) {
  const source = `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim() || user?.username || "?";
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toLocaleUpperCase("es");
}

function populateOrganizations(session) {
  const select = document.querySelector("#organization-select");
  select.replaceChildren();
  session.memberships.forEach((membership) => {
    const option = document.createElement("option");
    option.value = membership.organization;
    option.textContent = `${membership.organization_name} · ${roleLabel(membership.role)}`;
    select.append(option);
  });
}

function clearSummary() {
  ["summary-products", "summary-lots", "summary-orders", "summary-events"].forEach((id) => {
    document.querySelector(`#${id}`).textContent = "—";
  });
  document.querySelector("#summary-product-preview").replaceChildren();
}

function renderConnectionState() {
  const state = connectionState();
  const heroState = document.querySelector("#connection-hero-state");
  const heroDetail = document.querySelector("#connection-hero-detail");
  const badge = document.querySelector("#session-badge");
  const empty = document.querySelector("#session-empty");
  const content = document.querySelector("#session-content");
  const loginCard = document.querySelector("#login-card");
  const organizationCard = document.querySelector("#organization-card");

  endpointInput.value = state.settings.apiBaseUrl;
  organizationCard.hidden = state.state !== "organization-required";
  loginCard.hidden = ["connected", "organization-required"].includes(state.state);

  if (state.state === "connected") {
    const user = state.session.user;
    heroState.textContent = "Backend conectado";
    heroDetail.textContent = `${state.membership.organization_name} · ${roleLabel(state.membership.role)}`;
    badge.textContent = "Conectado";
    badge.className = "status success";
    empty.hidden = true;
    content.hidden = false;
    document.querySelector("#session-avatar").textContent = initials(user);
    document.querySelector("#session-name").textContent = `${user.first_name || user.username} · ${state.membership.organization_name}`;
    document.querySelector("#session-role").textContent = `${roleLabel(state.membership.role)} · ${user.username}`;
    return;
  }

  clearSummary();
  content.hidden = true;
  empty.hidden = false;
  badge.className = "status warning";
  if (state.state === "organization-required") {
    heroState.textContent = "Elige un negocio";
    heroDetail.textContent = "La cuenta tiene más de una membresía activa.";
    badge.textContent = "Falta negocio";
    empty.textContent = "La sesión es válida, pero debes elegir la organización antes de consultar datos.";
    populateOrganizations(state.session);
    return;
  }
  if (state.state === "configured") {
    heroState.textContent = "API disponible";
    heroDetail.textContent = "Falta iniciar sesión con una cuenta individual.";
    badge.textContent = "Sin sesión";
    empty.textContent = "La API está configurada. Ingresa con la cuenta de Camila o Carmelo para verificar el negocio.";
    return;
  }
  heroState.textContent = "Modo local";
  heroDetail.textContent = "Sin una sesión de backend";
  badge.textContent = "Local";
  badge.className = "status";
  empty.textContent = "Todavía no existe una sesión de backend. El piloto continúa funcionando con datos locales.";
}

function renderSummary(summary) {
  document.querySelector("#summary-products").textContent = summary.counts.products;
  document.querySelector("#summary-lots").textContent = summary.counts.inventory_lots;
  document.querySelector("#summary-orders").textContent = summary.counts.orders;
  document.querySelector("#summary-events").textContent = summary.counts.audit_events;
  const preview = document.querySelector("#summary-product-preview");
  preview.replaceChildren();
  if (!summary.product_preview.length) {
    const empty = document.createElement("div");
    empty.className = "connection-empty";
    empty.textContent = "El backend está conectado, pero el catálogo todavía está vacío.";
    preview.append(empty);
    return;
  }
  summary.product_preview.forEach((product) => {
    const row = document.createElement("article");
    row.className = "connection-product";
    row.innerHTML = `<div><strong></strong><span></span></div><b></b>`;
    row.querySelector("strong").textContent = product.name;
    row.querySelector("span").textContent = `${product.sku} · ${product.sale_unit === "kg" ? "por kilo" : "por unidad"}`;
    row.querySelector("b").textContent = formatCLP(product.price);
    preview.append(row);
  });
}

async function refreshSummary({ announce = true } = {}) {
  if (connectionState().state !== "connected") return;
  const requestId = ++summaryRequest;
  const button = document.querySelector("#refresh-summary");
  setButtonPending(button, true, "Actualizando…");
  try {
    const summary = await fetchConnectionSummary();
    if (requestId !== summaryRequest) return;
    renderSummary(summary);
    if (announce) setStatus("#summary-status", `Datos actualizados desde ${summary.organization.name}.`, "success");
  } catch (error) {
    setStatus("#summary-status", error.message, "error");
    renderConnectionState();
  } finally {
    setButtonPending(button, false);
  }
}

configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#test-api");
  setButtonPending(button, true, "Comprobando…");
  setStatus("#api-health-status", "", "info");
  try {
    const previous = readConnectionSettings();
    const next = saveConnectionSettings({ mode: "api", apiBaseUrl: endpointInput.value });
    if (previous.apiBaseUrl && previous.apiBaseUrl !== next.apiBaseUrl) clearApiSession();
    const health = await testApiConnection();
    document.querySelector("#api-health-badge").textContent = "Disponible";
    document.querySelector("#api-health-badge").className = "status success";
    setStatus("#api-health-status", `API disponible · versión ${health.version}.`, "success");
    showToast({ message: "Conexión con Django verificada.", state: "success" });
    renderConnectionState();
  } catch (error) {
    document.querySelector("#api-health-badge").textContent = "Sin conexión";
    document.querySelector("#api-health-badge").className = "status danger";
    setStatus("#api-health-status", error.message, "error");
  } finally {
    setButtonPending(button, false);
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  const username = event.currentTarget.username.value;
  const password = event.currentTarget.password.value;
  setButtonPending(button, true, "Ingresando…");
  try {
    if (readConnectionSettings().mode !== "api") throw new Error("Primero comprueba la dirección API.");
    const session = await loginToApi(username, password);
    event.currentTarget.password.value = "";
    setStatus("#login-status", `Sesión iniciada como ${session.user.first_name || session.user.username}.`, "success");
    showToast({ message: "Sesión del piloto iniciada.", state: "success" });
    renderConnectionState();
    if (connectionState().state === "connected") await refreshSummary({ announce: false });
  } catch (error) {
    event.currentTarget.password.value = "";
    setStatus("#login-status", error.message, "error");
  } finally {
    setButtonPending(button, false);
  }
});

organizationForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    selectOrganization(document.querySelector("#organization-select").value);
    renderConnectionState();
    await refreshSummary();
  } catch (error) {
    showToast({ message: error.message, state: "error" });
  }
});

document.querySelector("#refresh-summary").addEventListener("click", () => refreshSummary());
document.querySelector("#show-password-form").addEventListener("click", () => {
  passwordForm.hidden = false;
  passwordForm.querySelector("input[name=currentPassword]").focus();
});
document.querySelector("#cancel-password-change").addEventListener("click", () => {
  passwordForm.reset();
  passwordForm.hidden = true;
  setStatus("#password-status", "", "info");
});
passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button[type=submit]");
  const currentPassword = form.currentPassword.value;
  const newPassword = form.newPassword.value;
  const confirmation = form.newPasswordConfirmation.value;
  setButtonPending(button, true, "Actualizando…");
  setStatus("#password-status", "", "info");
  try {
    await changeApiPassword(currentPassword, newPassword, confirmation);
    form.reset();
    form.hidden = true;
    renderConnectionState();
    setStatus("#login-status", "Contraseña actualizada. Ingresa nuevamente con tu nueva clave.", "success");
    showToast({ message: "Contraseña actualizada y sesiones anteriores cerradas.", state: "success" });
  } catch (error) {
    setStatus("#password-status", error.message, "error");
  } finally {
    setButtonPending(button, false);
  }
});
document.querySelector("#logout-api").addEventListener("click", async () => {
  const accepted = await confirmAction({
    title: "¿Cerrar esta sesión?",
    message: "La cuenta se desconectará de esta pestaña. Los datos del backend no se eliminan.",
    confirmLabel: "Cerrar sesión",
  });
  if (!accepted) return;
  try { await logoutFromApi(); } catch { clearApiSession(); }
  renderConnectionState();
  setStatus("#login-status", "Sesión cerrada de forma segura.", "success");
});

document.querySelector("#use-local-mode").addEventListener("click", async () => {
  const session = readApiSession();
  if (session) {
    const accepted = await confirmAction({
      title: "¿Volver al modo local?",
      message: "Se cerrará la sesión del backend, pero los datos locales del piloto seguirán disponibles.",
      confirmLabel: "Usar modo local",
    });
    if (!accepted) return;
    try { await logoutFromApi(); } catch { clearApiSession(); }
  }
  saveConnectionSettings({ mode: "local", apiBaseUrl: endpointInput.value });
  renderConnectionState();
  showToast({ message: "Modo local activado.", state: "success" });
});

window.addEventListener("crohnoz:connection-changed", renderConnectionState);
document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
renderConnectionState();
if (connectionState().state === "connected") refreshSummary({ announce: false });
