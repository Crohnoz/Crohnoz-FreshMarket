const KNOWN_OPERATOR_PAGES = new Set([
  "admin.html",
  "asistente.html",
  "auditoria.html",
  "cierre.html",
  "compras.html",
  "conexion.html",
  "configurador.html",
  "cuentas.html",
  "integridad.html",
  "inventario.html",
  "inventario-remoto.html",
  "operar.html",
  "pedidos-remotos.html",
  "scanner-lab.html",
  "validacion.html",
  "ventas.html",
]);

function businessCustomized(business = {}, defaults = {}) {
  const comparable = ["name", "tagline", "whatsapp", "primaryColor", "accentColor", "deliveryFee", "tolerancePercent", "maxExtraAmount"];
  return comparable.some((key) => String(business[key] ?? "") !== String(defaults[key] ?? ""));
}

export function buildOperatorReadiness({
  business = {},
  defaultBusiness = {},
  visitedPages = [],
  continuityMeta = {},
  integrityMeta = {},
  connection = {},
} = {}) {
  const visited = new Set(Array.isArray(visitedPages) ? visitedPages : []);
  const integrityScanned = Number.isFinite(Date.parse(integrityMeta.lastScanAt));
  const connectionState = String(connection.state ?? "local");
  const items = [
    {
      id: "identity",
      label: "Personalizar el negocio",
      description: "Nombre, colores, contacto y reglas de pesaje.",
      href: "configurador.html",
      complete: Boolean(continuityMeta.businessConfiguredAt) || businessCustomized(business, defaultBusiness),
    },
    {
      id: "inventory",
      label: "Revisar el inventario",
      description: "Confirma lotes, vencimientos y qué conviene vender primero.",
      href: connectionState === "connected" ? "inventario-remoto.html" : "inventario.html",
      complete: ["inventario.html", "inventario-remoto.html"].some((page) => visited.has(page)),
    },
    {
      id: "operation",
      label: "Probar una operación",
      description: "Simula una venta, un abono o la preparación de un pedido.",
      href: connectionState === "connected" ? "pedidos-remotos.html" : "ventas.html",
      complete: ["ventas.html", "cuentas.html", "admin.html", "pedidos-remotos.html"].some((page) => visited.has(page)),
    },
    {
      id: "integrity",
      label: "Comprobar integridad",
      description: integrityMeta.status === "blocked"
        ? "El último análisis detectó errores críticos pendientes."
        : "Revisa referencias, saldos, montos y fechas antes del respaldo.",
      href: "integridad.html",
      complete: integrityScanned && integrityMeta.status !== "blocked",
    },
    {
      id: "connection",
      label: "Conectar una cuenta piloto",
      description: connectionState === "connected"
        ? "La cuenta, el rol y el negocio están verificados por Django."
        : connectionState === "organization-required"
          ? "La sesión está iniciada, pero falta elegir el negocio."
          : connectionState === "configured"
            ? "La API está configurada; falta ingresar con una cuenta individual."
            : "Comprueba la API e ingresa con la cuenta de Camila o Carmelo.",
      href: "conexion.html",
      complete: connectionState === "connected",
    },
    {
      id: "backup",
      label: "Crear el primer respaldo",
      description: "Descarga una copia local antes de trabajar con mayor volumen.",
      href: "configurador.html#continuidad",
      complete: Number.isFinite(Date.parse(continuityMeta.lastBackupAt)),
    },
  ];
  const completed = items.filter((item) => item.complete).length;
  return {
    items,
    completed,
    total: items.length,
    percent: Math.round((completed / items.length) * 100),
    ready: completed === items.length,
  };
}

export function normalizeResumeTarget(target) {
  if (!target || typeof target !== "object") return null;
  const href = String(target.href ?? "").trim();
  const label = String(target.label ?? "").trim();
  if (!href || !label || href.startsWith("//") || href.includes("://")) return null;
  const pathname = href.split(/[?#]/, 1)[0];
  if (!KNOWN_OPERATOR_PAGES.has(pathname) || pathname === "operar.html") return null;
  return {
    href,
    label: label.slice(0, 80),
    visitedAt: Number.isFinite(Date.parse(target.visitedAt)) ? target.visitedAt : null,
  };
}
