export const OPERATOR_TASKS = Object.freeze([
  {
    id: "sale",
    title: "Nueva venta",
    shortTitle: "Vender",
    description: "Ingresa productos, kilos y precios. El sistema calcula el total.",
    icon: "🧾",
    href: "cuentas.html?task=sale#transaction-form",
    group: "daily",
    tone: "primary",
  },
  {
    id: "credit-sale",
    title: "Venta fiada",
    shortTitle: "Fiado",
    description: "Prepara una venta y carga el total a la cuenta del cliente.",
    icon: "🤝",
    href: "cuentas.html?task=credit-sale#transaction-form",
    group: "credit",
    tone: "warning",
  },
  {
    id: "payment",
    title: "Recibir abono",
    shortTitle: "Abono",
    description: "Registra un pago y descuenta automáticamente el saldo pendiente.",
    icon: "💵",
    href: "cuentas.html?task=payment#ledger-form",
    group: "credit",
    tone: "success",
  },
  {
    id: "charge",
    title: "Anotar un fiado",
    shortTitle: "Anotar",
    description: "Guarda rápidamente una deuda sin tener que hacer una venta completa.",
    icon: "📒",
    href: "cuentas.html?task=charge#ledger-form",
    group: "credit",
    tone: "warning",
  },
  {
    id: "prepare",
    title: "Preparar pedidos",
    shortTitle: "Pedidos",
    description: "Revisa solicitudes, registra el peso real y confirma diferencias.",
    icon: "⚖️",
    href: "admin.html#orders-list",
    group: "operations",
    tone: "primary",
  },
  {
    id: "prices",
    title: "Cambiar precios",
    shortTitle: "Precios",
    description: "Actualiza los precios rápidos del día desde una sola tabla.",
    icon: "🏷️",
    href: "admin.html#price-table-body",
    group: "operations",
    tone: "neutral",
  },
  {
    id: "close-day",
    title: "Cerrar el día",
    shortTitle: "Cerrar",
    description: "Compara la caja esperada con el efectivo contado y revisa cualquier diferencia.",
    icon: "✅",
    href: "cierre.html",
    group: "daily",
    tone: "success",
  },
  {
    id: "voice",
    title: "Hablar con el copiloto",
    shortTitle: "Hablar",
    description: "Dicta un fiado, un abono, una venta o pregunta cuánto te deben.",
    icon: "🎙️",
    href: "cuentas.html?task=voice#voice-copilot",
    group: "assistant",
    tone: "accent",
  },
  {
    id: "scan",
    title: "Probar lector",
    shortTitle: "Escanear",
    description: "Abre el laboratorio para códigos de barra y entrada manual.",
    icon: "▥",
    href: "scanner-lab.html#manual-form",
    group: "tools",
    tone: "neutral",
  },
]);

export function operatorTaskById(id) {
  return OPERATOR_TASKS.find((task) => task.id === id) ?? null;
}

export function operatorTasksByGroup(group) {
  return OPERATOR_TASKS.filter((task) => task.group === group);
}

export function operatorTaskSearch(query) {
  const normalized = String(query ?? "").trim().toLocaleLowerCase("es");
  if (!normalized) return [...OPERATOR_TASKS];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return OPERATOR_TASKS.filter((task) => {
    const haystack = `${task.title} ${task.shortTitle} ${task.description}`.toLocaleLowerCase("es");
    return tokens.every((token) => haystack.includes(token));
  });
}
