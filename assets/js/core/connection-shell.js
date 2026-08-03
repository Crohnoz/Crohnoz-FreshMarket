import { connectionState } from "./connection.js";

const OPERATOR_PAGES = new Set([
  "operar.html", "admin.html", "cuentas.html", "cierre.html", "inventario.html", "compras.html",
  "ventas.html", "asistente.html", "integridad.html", "auditoria.html", "validacion.html",
  "configurador.html", "scanner-lab.html", "conexion.html",
]);

function currentPage() {
  const segment = window.location.pathname.split("/").filter(Boolean).at(-1) ?? "";
  const aliases = { operar: "operar.html", dashboard: "admin.html", configurar: "configurador.html", conexion: "conexion.html" };
  if (Object.hasOwn(aliases, segment)) return aliases[segment];
  if (!segment) return "index.html";
  return segment.includes(".") ? segment : `${segment}.html`;
}

function roleLabel(role) {
  return ({ owner: "Propietario", manager: "Encargada", operator: "Operador", viewer: "Solo lectura" })[role] ?? role;
}

function render(strip) {
  const status = connectionState();
  strip.dataset.state = status.state;
  const icon = strip.querySelector("[data-connection-icon]");
  const title = strip.querySelector("strong");
  const detail = strip.querySelector("span:last-child");
  const link = strip.querySelector("a");

  if (status.state === "connected") {
    const userName = status.session.user.first_name || status.session.user.username;
    icon.textContent = "●";
    title.textContent = `${userName} · ${status.membership.organization_name}`;
    detail.textContent = `${roleLabel(status.membership.role)} · sesión protegida en esta pestaña`;
    link.textContent = "Revisar conexión";
    return;
  }
  if (status.state === "organization-required") {
    icon.textContent = "!";
    title.textContent = "Falta elegir el negocio";
    detail.textContent = "La cuenta pertenece a más de una organización.";
    link.textContent = "Elegir ahora";
    return;
  }
  if (status.state === "configured") {
    icon.textContent = "○";
    title.textContent = "API configurada, sin sesión";
    detail.textContent = "Ingresa con la cuenta individual de Camila o Carmelo.";
    link.textContent = "Iniciar sesión";
    return;
  }
  icon.textContent = "○";
  title.textContent = "Modo local";
  detail.textContent = "Los datos siguen guardados solo en este navegador.";
  link.textContent = "Conectar backend";
}

function mount() {
  if (!OPERATOR_PAGES.has(currentPage())) return;
  const banner = document.querySelector(".demo-banner");
  if (!banner || document.querySelector("#connection-strip")) return;
  const strip = document.createElement("aside");
  strip.id = "connection-strip";
  strip.className = "connection-strip";
  strip.setAttribute("aria-live", "polite");
  strip.innerHTML = `
    <div class="shell connection-strip-inner">
      <span class="connection-strip-icon" data-connection-icon aria-hidden="true"></span>
      <div><strong></strong><span></span></div>
      <a href="conexion.html"></a>
    </div>`;
  banner.insertAdjacentElement("afterend", strip);
  render(strip);
  window.addEventListener("crohnoz:connection-changed", () => render(strip));
}

mount();
