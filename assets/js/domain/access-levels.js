export const ACCESS_LEVELS = Object.freeze([
  Object.freeze({
    level: 1,
    role: "operator",
    name: "Operador",
    summary: "Vende, prepara pedidos y registra movimientos cotidianos.",
    capabilities: Object.freeze([
      "create_orders",
      "prepare_orders",
      "receive_inventory",
      "record_inventory_movements",
      "register_payments",
    ]),
  }),
  Object.freeze({
    level: 2,
    role: "manager",
    name: "Encargado",
    summary: "Controla catálogo, precios, ajustes, cierres y seguimiento del equipo.",
    capabilities: Object.freeze([
      "create_orders",
      "prepare_orders",
      "receive_inventory",
      "record_inventory_movements",
      "register_payments",
      "manage_catalog",
      "manage_prices",
      "adjust_inventory",
      "close_day",
      "view_team",
    ]),
  }),
  Object.freeze({
    level: 3,
    role: "owner",
    name: "Dueño",
    summary: "Administra el negocio, el equipo, los permisos, la auditoría y la continuidad.",
    capabilities: Object.freeze([
      "create_orders",
      "prepare_orders",
      "receive_inventory",
      "record_inventory_movements",
      "register_payments",
      "manage_catalog",
      "manage_prices",
      "adjust_inventory",
      "close_day",
      "view_team",
      "manage_business",
      "manage_team",
      "manage_access",
      "export_data",
      "view_audit",
    ]),
  }),
]);

export const VIEWER_ACCESS = Object.freeze({
  level: 0,
  role: "viewer",
  name: "Solo lectura",
  summary: "Consulta información sin modificar la operación.",
  capabilities: Object.freeze(["view_dashboard", "view_catalog", "view_reports"]),
});

const CAPABILITY_LABELS = Object.freeze({
  create_orders: "Crear ventas y pedidos",
  prepare_orders: "Preparar y pesar pedidos",
  receive_inventory: "Recibir mercadería",
  record_inventory_movements: "Registrar consumo, merma o devolución",
  register_payments: "Registrar pagos y abonos",
  manage_catalog: "Administrar catálogo",
  manage_prices: "Cambiar precios",
  adjust_inventory: "Realizar ajustes de inventario",
  close_day: "Cerrar y conciliar el día",
  view_team: "Ver integrantes del equipo",
  manage_business: "Personalizar el negocio",
  manage_team: "Administrar integrantes",
  manage_access: "Cambiar niveles y permisos",
  export_data: "Exportar respaldos y datos",
  view_audit: "Revisar auditoría",
  view_dashboard: "Ver operación",
  view_catalog: "Ver catálogo",
  view_reports: "Ver reportes",
});

export function accessForRole(role) {
  if (role === "viewer") return VIEWER_ACCESS;
  return ACCESS_LEVELS.find((level) => level.role === role) ?? VIEWER_ACCESS;
}

export function capabilityLabel(capability) {
  return CAPABILITY_LABELS[capability] ?? capability.replaceAll("_", " ");
}

export function canAccess(role, capability) {
  return accessForRole(role).capabilities.includes(capability);
}

export function businessModeForMembers(members = []) {
  const active = members.filter((member) => member?.is_active !== false);
  return active.length <= 1 ? "solo" : "team";
}
