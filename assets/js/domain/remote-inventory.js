function cleanText(value, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function decimalNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} no contiene un número válido.`);
  return number;
}

function requireWholeQuantity(value, saleUnit, field) {
  if (saleUnit !== "kg" && !Number.isInteger(value)) {
    throw new Error(`${field} debe ser un número entero para productos por unidad o paquete.`);
  }
}

export function normalizeRemoteLot(raw) {
  const id = cleanText(raw?.id, 80);
  const productId = cleanText(raw?.product, 80);
  const productName = cleanText(raw?.product_name, 160);
  if (!id || !productId || !productName) throw new Error("La API devolvió un lote incompleto.");
  const version = Number(raw.version ?? 1);
  if (!Number.isInteger(version) || version < 1) throw new Error("La API devolvió una versión de lote inválida.");
  return {
    id,
    productId,
    productName,
    productSaleUnit: cleanText(raw.product_sale_unit, 24),
    receivedAt: cleanText(raw.received_at, 20),
    bestBefore: cleanText(raw.best_before, 20),
    quantityReceived: decimalNumber(raw.quantity_received, "La cantidad recibida"),
    quantityAvailable: decimalNumber(raw.quantity_available, "La cantidad disponible"),
    unitCost: decimalNumber(raw.unit_cost, "El costo unitario"),
    quality: cleanText(raw.quality, 24),
    status: cleanText(raw.status, 24),
    notes: cleanText(raw.notes, 240),
    version,
    createdAt: cleanText(raw.created_at, 80),
  };
}

export function normalizeRemoteMovement(raw) {
  const id = cleanText(raw?.id, 80);
  const lotId = cleanText(raw?.lot, 80);
  const productName = cleanText(raw?.product_name, 160);
  const movementType = cleanText(raw?.movement_type, 32);
  if (!id || !lotId || !productName || !movementType) throw new Error("La API devolvió un movimiento incompleto.");
  return {
    id,
    lotId,
    productId: cleanText(raw.product, 80),
    productName,
    productSaleUnit: cleanText(raw.product_sale_unit, 24),
    movementType,
    quantityDelta: decimalNumber(raw.quantity_delta, "La variación"),
    quantityBefore: decimalNumber(raw.quantity_before, "El saldo anterior"),
    quantityAfter: decimalNumber(raw.quantity_after, "El saldo resultante"),
    reason: cleanText(raw.reason, 240),
    reference: cleanText(raw.reference, 120),
    actor: cleanText(raw.created_by?.first_name || raw.created_by?.username, 120),
    createdAt: cleanText(raw.created_at, 80),
    lotVersion: Number(raw.lot_version ?? 1),
  };
}

export function createRemoteReceptionPayload({
  productId,
  productSaleUnit = "kg",
  receivedAt,
  bestBefore = "",
  quantity,
  unitCost,
  quality = "good",
  notes = "",
}) {
  const product = cleanText(productId, 80);
  if (!product) throw new Error("Selecciona un producto del catálogo remoto.");
  const received = cleanText(receivedAt, 20);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(received)) throw new Error("Ingresa una fecha de recepción válida.");
  const preferred = cleanText(bestBefore, 20);
  if (preferred && !/^\d{4}-\d{2}-\d{2}$/.test(preferred)) throw new Error("La fecha preferente no es válida.");
  if (preferred && preferred < received) throw new Error("La fecha preferente no puede ser anterior a la recepción.");
  const normalizedQuantity = decimalNumber(quantity, "La cantidad recibida");
  if (normalizedQuantity <= 0) throw new Error("La cantidad recibida debe ser mayor que cero.");
  requireWholeQuantity(normalizedQuantity, productSaleUnit, "La cantidad recibida");
  const normalizedCost = decimalNumber(unitCost, "El costo unitario");
  if (normalizedCost < 0) throw new Error("El costo unitario no puede ser negativo.");
  const normalizedQuality = cleanText(quality, 24);
  if (!["good", "review", "damaged"].includes(normalizedQuality)) throw new Error("Selecciona un estado de calidad válido.");
  return {
    product,
    received_at: received,
    best_before: preferred || null,
    quantity_received: normalizedQuantity,
    unit_cost: normalizedCost,
    quality: normalizedQuality,
    notes: cleanText(notes, 240),
  };
}

export function createRemoteMovementPayload({ lot, movementType, quantity, reason, reference = "" }) {
  if (!lot?.id || !Number.isInteger(Number(lot.version))) throw new Error("Selecciona un lote remoto actualizado.");
  const normalizedType = cleanText(movementType, 32);
  if (!["consumption", "waste", "adjustment", "supplier_return"].includes(normalizedType)) {
    throw new Error("Selecciona un tipo de movimiento válido.");
  }
  const normalizedQuantity = decimalNumber(quantity, normalizedType === "adjustment" ? "El nuevo saldo" : "La cantidad");
  const unit = lot.productSaleUnit || "kg";
  requireWholeQuantity(normalizedQuantity, unit, normalizedType === "adjustment" ? "El nuevo saldo" : "La cantidad");
  if (normalizedType === "adjustment") {
    if (normalizedQuantity < 0) throw new Error("El nuevo saldo no puede ser negativo.");
    if (normalizedQuantity > lot.quantityReceived) throw new Error("El nuevo saldo no puede superar lo originalmente recibido.");
    if (normalizedQuantity === lot.quantityAvailable) throw new Error("El nuevo saldo debe ser diferente del saldo actual.");
  } else {
    if (normalizedQuantity <= 0) throw new Error("La cantidad debe ser mayor que cero.");
    if (normalizedQuantity > lot.quantityAvailable) throw new Error("La cantidad no puede superar el saldo disponible.");
  }
  const normalizedReason = cleanText(reason, 240);
  if (normalizedReason.length < 3) throw new Error("Describe brevemente el motivo del movimiento.");
  return {
    lot: lot.id,
    movement_type: normalizedType,
    ...(normalizedType === "adjustment"
      ? { quantity_available: normalizedQuantity }
      : { quantity: normalizedQuantity }),
    reason: normalizedReason,
    reference: cleanText(reference, 120),
  };
}

export function remoteLotRisk(lot, today = new Date()) {
  if (lot.status !== "active") return { level: "neutral", label: lot.status === "depleted" ? "Agotado" : "Cerrado" };
  if (lot.quality === "damaged") return { level: "danger", label: "Dañado" };
  if (lot.quality === "review") return { level: "warning", label: "Revisar calidad" };
  if (!lot.bestBefore) return { level: "neutral", label: "Sin fecha preferente" };
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [year, month, day] = lot.bestBefore.split("-").map(Number);
  const preferred = new Date(year, month - 1, day);
  const days = Math.round((preferred - localToday) / 86400000);
  if (days < 0) return { level: "danger", label: `Vencido hace ${Math.abs(days)} día${Math.abs(days) === 1 ? "" : "s"}` };
  if (days <= 2) return { level: "danger", label: days === 0 ? "Vence hoy" : `Vence en ${days} días` };
  if (days <= 5) return { level: "warning", label: `Vence en ${days} días` };
  return { level: "success", label: `Vence en ${days} días` };
}

export function remoteQualityLabel(value) {
  return ({ good: "Buena", review: "Revisar", damaged: "Dañada" })[value] ?? value;
}

export function remoteMovementLabel(value) {
  return ({
    consumption: "Consumo",
    waste: "Merma",
    adjustment: "Ajuste de inventario",
    supplier_return: "Devolución a proveedor",
  })[value] ?? value;
}