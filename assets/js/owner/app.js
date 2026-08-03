import { DEFAULT_BUSINESS } from "../core/config.js";
import { apiRequest, connectionState } from "../core/connection.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { ACCESS_LEVELS, VIEWER_ACCESS, accessForRole, capabilityLabel } from "../domain/access-levels.js";

const form = document.querySelector("#owner-business-form");
const accessGrid = document.querySelector("#access-level-grid");
const capabilityList = document.querySelector("#current-capabilities");
const teamList = document.querySelector("#team-list");
const teamState = document.querySelector("#team-state");
const refreshTeamButton = document.querySelector("#refresh-team");
const preview = document.querySelector("#customer-preview");
const connection = connectionState();
let business = {
  ...DEFAULT_BUSINESS,
  ...readStorage("business", DEFAULT_BUSINESS),
};
if (!business.operationMode) business.operationMode = "solo";
let remoteTeam = null;

function activeRole() {
  return connection.state === "connected" ? connection.membership?.role ?? "viewer" : "owner";
}

function canManageBusiness() {
  return connection.state !== "connected" || activeRole() === "owner";
}

function setTeamState(message, state = "info") {
  teamState.textContent = message;
  teamState.dataset.state = state;
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
}

function fillForm() {
  Object.entries(business).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (!field) return;
    if (field.type === "checkbox") field.checked = Boolean(value);
    else field.value = value;
  });
  const allowed = canManageBusiness();
  form.setAttribute("aria-disabled", String(!allowed));
  [...form.elements].forEach((field) => { field.disabled = !allowed; });
  if (!allowed) {
    document.querySelector("#owner-save-status").textContent = "Este nivel puede revisar la identidad, pero solo una cuenta dueña puede modificarla.";
  }
}

function readForm() {
  const data = new FormData(form);
  return {
    ...business,
    name: String(data.get("name") || DEFAULT_BUSINESS.name).trim(),
    tagline: String(data.get("tagline") || DEFAULT_BUSINESS.tagline).trim(),
    operationMode: data.get("operationMode") === "team" ? "team" : "solo",
    primaryColor: String(data.get("primaryColor") || DEFAULT_BUSINESS.primaryColor),
    accentColor: String(data.get("accentColor") || DEFAULT_BUSINESS.accentColor),
    deliveryFee: Math.max(0, Math.round(Number(data.get("deliveryFee")) || 0)),
    tolerancePercent: Math.max(0, Number(data.get("tolerancePercent")) || 0),
    maxExtraAmount: Math.max(0, Math.round(Number(data.get("maxExtraAmount")) || 0)),
    isOpen: form.elements.isOpen.checked,
    darkMode: form.elements.darkMode.checked,
  };
}

function renderCurrentAccess() {
  const access = accessForRole(activeRole());
  document.querySelector("#current-access-level").textContent = access.level ? `Nivel ${access.level}` : "Solo lectura";
  document.querySelector("#current-access-name").textContent = access.name;
  document.querySelector("#current-access-summary").textContent = connection.state === "connected"
    ? access.summary
    : "Modo demostrativo: una sola persona recibe Nivel 3 para configurar y operar sin pasos de equipo.";
  const mode = document.querySelector("#connection-mode");
  mode.textContent = connection.state === "connected" ? "Conectado a Django" : "Modo local";
  mode.className = `status ${connection.state === "connected" ? "success" : "warning"}`;
  capabilityList.replaceChildren();
  access.capabilities.slice(0, 10).forEach((capability) => {
    const chip = document.createElement("span");
    chip.className = "capability-chip";
    chip.textContent = capabilityLabel(capability);
    capabilityList.append(chip);
  });
}

function renderAccessLevels() {
  accessGrid.replaceChildren();
  const role = activeRole();
  ACCESS_LEVELS.forEach((level) => {
    const card = document.createElement("article");
    card.className = "access-level-card";
    card.dataset.active = String(level.role === role);
    const header = document.createElement("header");
    const title = document.createElement("h3");
    title.textContent = `${level.name}`;
    const badge = document.createElement("span");
    badge.className = "access-level-badge";
    badge.textContent = `Nivel ${level.level}`;
    header.append(title, badge);
    const summary = document.createElement("p");
    summary.textContent = level.summary;
    const list = document.createElement("ul");
    level.capabilities.slice(-5).forEach((capability) => {
      const item = document.createElement("li");
      item.textContent = capabilityLabel(capability);
      list.append(item);
    });
    card.append(header, summary, list);
    accessGrid.append(card);
  });
}

function localMembers() {
  if (business.operationMode !== "team") {
    return [{ id: "local-owner", user: { first_name: "Dueño/a", username: "cuenta principal" }, role: "owner", is_active: true, access: accessForRole("owner"), local: true }];
  }
  return [
    { id: "local-owner", user: { first_name: "Camila", username: "dueña demo" }, role: "owner", is_active: true, access: accessForRole("owner"), local: true },
    { id: "local-manager", user: { first_name: "Paula", username: "encargada demo" }, role: "manager", is_active: true, access: accessForRole("manager"), local: true },
    { id: "local-operator", user: { first_name: "Diego", username: "operador demo" }, role: "operator", is_active: true, access: accessForRole("operator"), local: true },
  ];
}

function updateBusinessMode(members) {
  const activeCount = members.filter((member) => member.is_active !== false).length;
  const teamMode = activeCount > 1 || business.operationMode === "team";
  document.querySelector("#business-mode-title").textContent = teamMode ? "Operación con equipo" : "Trabajo individual";
  document.querySelector("#business-mode-description").textContent = teamMode
    ? "Cada persona tiene un nivel explícito y el servidor valida qué puede leer o modificar."
    : "Una sola cuenta administra y opera. Los controles de equipo permanecen fuera del camino.";
  document.querySelector("#team-count").textContent = `${activeCount} persona${activeCount === 1 ? "" : "s"} activa${activeCount === 1 ? "" : "s"}`;
}

function createRoleSelect(member, editable) {
  const select = document.createElement("select");
  select.setAttribute("aria-label", `Nivel de acceso de ${member.user.first_name || member.user.username}`);
  [VIEWER_ACCESS, ...ACCESS_LEVELS].forEach((access) => {
    const option = document.createElement("option");
    option.value = access.role;
    option.textContent = access.level ? `Nivel ${access.level} · ${access.name}` : access.name;
    option.selected = access.role === member.role;
    select.append(option);
  });
  select.disabled = !editable;
  return select;
}

function renderTeam(members, { editable = false, local = false } = {}) {
  teamList.replaceChildren();
  updateBusinessMode(members);
  members.forEach((member) => {
    const row = document.createElement("article");
    row.className = "team-member";

    const user = document.createElement("div");
    user.className = "team-member-user";
    const name = document.createElement("strong");
    name.textContent = [member.user.first_name, member.user.last_name].filter(Boolean).join(" ") || member.user.username;
    const username = document.createElement("span");
    username.textContent = member.user.username;
    user.append(name, username);

    const roleSelect = createRoleSelect(member, editable && !local);
    const state = document.createElement("label");
    state.className = "team-member-status";
    const active = document.createElement("input");
    active.type = "checkbox";
    active.checked = member.is_active !== false;
    active.disabled = !editable || local;
    const stateText = document.createElement("span");
    stateText.textContent = active.checked ? "Acceso activo" : "Acceso suspendido";
    active.addEventListener("change", () => { stateText.textContent = active.checked ? "Acceso activo" : "Acceso suspendido"; });
    state.append(active, stateText);

    const save = document.createElement("button");
    save.className = "button secondary";
    save.type = "button";
    save.textContent = local ? "Ejemplo" : editable ? "Guardar acceso" : `Nivel ${member.access?.level ?? accessForRole(member.role).level}`;
    save.disabled = !editable || local;
    save.addEventListener("click", async () => {
      save.disabled = true;
      save.textContent = "Guardando…";
      try {
        await apiRequest(`team/${member.id}/`, {
          method: "PATCH",
          body: { role: roleSelect.value, is_active: active.checked },
        });
        setTeamState("Nivel actualizado y registrado en auditoría.", "success");
        await loadTeam();
      } catch (error) {
        setTeamState(error.message || "No se pudo actualizar el acceso.", "error");
        save.disabled = false;
        save.textContent = "Guardar acceso";
      }
    });

    row.append(user, roleSelect, state, save);
    teamList.append(row);
  });
}

async function loadTeam() {
  refreshTeamButton.disabled = true;
  if (connection.state !== "connected") {
    const members = localMembers();
    renderTeam(members, { local: true });
    setTeamState(
      business.operationMode === "team"
        ? "Equipo de ejemplo local. Conecta Django para administrar cuentas reales."
        : "Modo individual activo. Cambia a “Tengo un equipo” para previsualizar la estructura por niveles.",
      "warning",
    );
    refreshTeamButton.disabled = false;
    return;
  }

  if (!["owner", "manager"].includes(activeRole())) {
    renderTeam([], { editable: false });
    updateBusinessMode([{ is_active: true }]);
    setTeamState("Tu nivel no permite ver la nómina del negocio. La autorización se aplicó en el servidor.", "warning");
    refreshTeamButton.disabled = false;
    return;
  }

  setTeamState("Cargando integrantes desde Django…", "info");
  try {
    remoteTeam = await apiRequest("team/");
    renderTeam(remoteTeam.members, { editable: activeRole() === "owner" });
    setTeamState(
      activeRole() === "owner"
        ? "Equipo conectado. Puedes cambiar niveles y suspender accesos sin eliminar la trazabilidad."
        : "Equipo conectado en modo lectura. Solo una cuenta dueña puede cambiar accesos.",
      "success",
    );
  } catch (error) {
    setTeamState(error.message || "No se pudo cargar el equipo.", "error");
  } finally {
    refreshTeamButton.disabled = false;
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!canManageBusiness()) return;
  business = readForm();
  writeStorage("business", business);
  applyTheme();
  document.querySelector("#owner-save-status").textContent = "Identidad guardada. La vista cliente fue actualizada.";
  preview.contentWindow?.location.reload();
  loadTeam();
});

form.elements.operationMode?.addEventListener("change", () => {
  if (connection.state === "connected") return;
  business = { ...business, operationMode: form.elements.operationMode.value === "team" ? "team" : "solo" };
  renderTeam(localMembers(), { local: true });
});

refreshTeamButton.addEventListener("click", loadTeam);
window.addEventListener("crohnoz:connection-changed", () => window.location.reload());

applyTheme();
fillForm();
renderCurrentAccess();
renderAccessLevels();
loadTeam();
