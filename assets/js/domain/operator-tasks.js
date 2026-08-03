export const OPERATOR_TASKS = Object.freeze([
  { id: "sale", title: "Nueva venta", shortTitle: "Vender", description: "Ingresa productos, kilos y precios. El sistema calcula el total.", icon: "🧾", href: "cuentas.html?task=sale#transaction-form", group: "daily", tone: "primary" },
  { id: "credit-sale", title: "Venta fiada", shortTitle: "Fiado", description: "Prepara una venta y carga el total a la cuenta del cliente.", icon: "🤝", href: "cuentas.html?task=credit-sale#transaction-form", group: "credit", tone: "warning" },
  { id: "payment", title: "Recibir abono", shortTitle: "Abono", description: "Registra un pago y descuenta automáticamente el saldo pendiente.", icon: "💵", href: "cuentas.html?task=payment#ledger-form", group: "credit", tone: "success" },
  { id: "charge", title: "Anotar un fiado", shortTitle: "Anotar", description: "Guarda rápidamente una deuda sin tener que hacer una venta completa.", icon: "📒", href: "cuentas.html?task=charge#ledger-form", group: "credit", tone: "warning" },
  { id: "prepare", title: "Preparar pedidos", shortTitle: "Pedidos", description: "Revisa solicitudes, registra el peso real y confirma diferencias.", icon: "⚖️", href: "admin.html#orders-list", group: "operations", tone: "primary" },
  { id: "sales-control", title: "Cobrar y entregar", shortTitle: "Cobrar", description: "Confirma cambios de peso, registra pagos y entrega un comprobante interno.", icon: "🧺", href: "ventas.html", group: "daily", tone: "primary" },
  { id: "remote-orders", title: "Preparar pedidos conectados", shortTitle: "Remotos", description: "Crea pedidos, registra cantidades reales y los marca listos con control de versión en Django.", keywords: "api servidor catalogo pedido remoto django postgres preparar pesaje listo", icon: "☁️", href: "pedidos-remotos.html", group: "operations", tone: "success" },
  { id: "remote-inventory", title: "Recibir inventario conectado", shortTitle: "Recepción", description: "Crea lotes remotos trazables y evita duplicarlos cuando la conexión se interrumpe.", keywords: "api servidor inventario lote recepcion compra costo django postgres", icon: "📦", href: "inventario-remoto.html", group: "operations", tone: "success" },
  { id: "inventory", title: "Revisar inventario", shortTitle: "Inventario", description: "Ordena los lotes perecibles y prioriza lo que debe venderse primero.", icon: "🥬", href: "inventario.html", group: "operations", tone: "warning" },
  { id: "purchase", title: "Registrar compra", shortTitle: "Comprar", description: "Guarda el costo del proveedor, crea un lote y calcula un precio sugerido.", icon: "🚚", href: "compras.html", group: "operations", tone: "neutral" },
  { id: "prices", title: "Cambiar precios", shortTitle: "Precios", description: "Actualiza los precios rápidos del día desde una sola tabla.", icon: "🏷️", href: "admin.html#price-table-body", group: "operations", tone: "neutral" },
  { id: "close-day", title: "Cerrar el día", shortTitle: "Cerrar", description: "Compara la caja esperada con el efectivo contado y revisa cualquier diferencia.", icon: "✅", href: "cierre.html", group: "daily", tone: "success" },
  { id: "voice", title: "Hablar con el copiloto", shortTitle: "Hablar", description: "Dicta un fiado, un abono, una venta o pregunta cuánto te deben.", icon: "🎙️", href: "cuentas.html?task=voice#voice-copilot", group: "assistant", tone: "accent" },
  { id: "assistant-center", title: "Abrir centro asistido", shortTitle: "Asistente", description: "Consulta inventario, caja, compras y revisa propuestas con evidencia local.", icon: "✨", href: "asistente.html", group: "assistant", tone: "accent" },
  { id: "integrity", title: "Revisar integridad", shortTitle: "Integridad", description: "Comprueba IDs, referencias, montos, saldos y fechas antes de respaldar o migrar.", keywords: "datos coherencia errores duplicados duplicadas referencias diagnostico salud migracion", icon: "🛡️", href: "integridad.html", group: "tools", tone: "warning" },
  { id: "audit", title: "Revisar auditoría", shortTitle: "Auditoría", description: "Comprueba qué colecciones cambiaron, su secuencia y la cadena local de hashes.", keywords: "historial cambios trazabilidad bitacora cadena hash kernel migracion", icon: "🔗", href: "auditoria.html", group: "tools", tone: "neutral" },
  { id: "connect-backend", title: "Conectar el backend", shortTitle: "Conectar", description: "Comprueba Django, inicia una sesión individual y verifica el negocio activo.", keywords: "api django login sesion camila carmelo servidor postgres conexion", icon: "🌐", href: "conexion.html", group: "tools", tone: "success" },
  { id: "backup", title: "Crear respaldo", shortTitle: "Respaldar", description: "Descarga una copia validada de configuración, ventas, inventario y cuentas.", keywords: "copia exportar guardar recuperar continuidad", icon: "💾", href: "configurador.html#continuidad", group: "tools", tone: "warning" },
  { id: "scan", title: "Probar lector", shortTitle: "Escanear", description: "Abre el laboratorio para códigos de barra y entrada manual.", icon: "▥", href: "scanner-lab.html#manual-form", group: "tools", tone: "neutral" },
  { id: "validate-pilot", title: "Validar el piloto", shortTitle: "Validar", description: "Prueba el dispositivo y mide si una persona completa las tareas sin ayuda.", keywords: "probar piloto prueba usuario", icon: "🧪", href: "validacion.html", group: "tools", tone: "neutral" },
]);

export function operatorTaskById(id) { return OPERATOR_TASKS.find((task) => task.id === id) ?? null; }
export function operatorTasksByGroup(group) { return OPERATOR_TASKS.filter((task) => task.group === group); }
export function operatorTaskSearch(query) {
  const normalized = String(query ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es");
  if (!normalized) return [...OPERATOR_TASKS];
  const tokens = normalized.split(/\s+/).filter(Boolean);
  return OPERATOR_TASKS.filter((task) => {
    const haystack = `${task.title} ${task.shortTitle} ${task.description} ${task.keywords ?? ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es");
    return tokens.every((token) => haystack.includes(token));
  });
}
