function decimalNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} no contiene un número válido.`);
  return number;
}

function cleanText(value, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function unwrapPaginated(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  throw new Error("La API devolvió una colección inesperada.");
}

export function normalizeRemoteProduct(raw) {
  const id = cleanText(raw?.id, 80);
  const name = cleanText(raw?.name, 160);
  if (!id || !name) throw new Error("El catálogo contiene un producto incompleto.");
  const price = decimalNumber(raw.price, `El precio de ${name}`);
  if (price < 0) throw new Error(`El precio de ${name} no puede ser negativo.`);
  return {
    id,
    sku: cleanText(raw.sku, 80),
    name,
    category: cleanText(raw.category, 120) || "Sin categoría",
    saleUnit: cleanText(raw.sale_unit, 20) || "unit",
    price,
    isActive: raw.is_active !== false,
    version: Number(raw.version ?? 1),
  };
}

export function normalizeRemoteOrder(raw) {
  const id = cleanText(raw?.id, 80);
  const publicId = cleanText(raw?.public_id, 80);
  if (!id || !publicId) throw new Error("La API devolvió un pedido incompleto.");
  return {
    id,
    publicId,
    customerName: cleanText(raw.customer_name, 160),
    status: cleanText(raw.status, 40),
    paymentMethod: cleanText(raw.payment_method, 40),
    total: decimalNumber(raw.total ?? 0, `El total de ${publicId}`),
    notes: cleanText(raw.notes, 500),
    createdAt: cleanText(raw.created_at, 80),
    version: Number(raw.version ?? 1),
    items: (Array.isArray(raw.items) ? raw.items : []).map((item) => ({
      id: cleanText(item.id, 80),
      productId: cleanText(item.product, 80),
      productName: cleanText(item.product_name, 160),
      productSaleUnit: cleanText(item.product_sale_unit, 20) || "unit",
      requestedQuantity: decimalNumber(item.requested_quantity, "La cantidad solicitada"),
      actualQuantity: item.actual_quantity === null || item.actual_quantity === ""
        ? null
        : decimalNumber(item.actual_quantity, "La cantidad real"),
      unitPrice: decimalNumber(item.unit_price, "El precio unitario"),
      lineTotal: decimalNumber(item.line_total ?? 0, "El total de línea"),
    })),
  };
}

export function createRemoteOrderPayload({
  customerName,
  notes = "",
  publicId,
  idempotencyKey,
  lines,
}) {
  const customer = cleanText(customerName, 160);
  if (customer.length < 2) throw new Error("Escribe un nombre de cliente válido.");
  const normalizedPublicId = cleanText(publicId, 40);
  if (!normalizedPublicId) throw new Error("No fue posible generar el número del pedido.");
  const normalizedKey = cleanText(idempotencyKey, 96);
  if (normalizedKey.length < 8) throw new Error("La clave segura de reintento no es válida.");

  const items = (Array.isArray(lines) ? lines : [])
    .map((line) => ({
      product: cleanText(line.productId, 80),
      requested_quantity: decimalNumber(line.quantity, "La cantidad"),
      unit_price: decimalNumber(line.unitPrice, "El precio unitario"),
    }))
    .filter((line) => line.product && line.requested_quantity > 0);

  if (!items.length) throw new Error("Agrega al menos un producto con cantidad mayor que cero.");
  if (items.some((line) => line.unit_price < 0)) throw new Error("Los precios no pueden ser negativos.");
  if (new Set(items.map((line) => line.product)).size !== items.length) {
    throw new Error("Cada producto debe aparecer una sola vez en el pedido.");
  }

  return {
    public_id: normalizedPublicId,
    customer_name: customer,
    status: "confirmed",
    payment_method: "pending",
    source: "operator",
    notes: cleanText(notes, 500),
    idempotency_key: normalizedKey,
    items,
  };
}

export function createRemoteWeighingPayload(order, values) {
  if (!order?.id || order.status !== "preparing") throw new Error("Solo un pedido en preparación puede registrar peso real.");
  const submitted = new Map((Array.isArray(values) ? values : []).map((value) => [cleanText(value.id, 80), value]));
  if (submitted.size !== order.items.length || order.items.some((item) => !submitted.has(item.id))) {
    throw new Error("Debes registrar exactamente todas las líneas actuales del pedido.");
  }
  return order.items.map((item) => {
    const actualQuantity = decimalNumber(submitted.get(item.id).actualQuantity, `La cantidad real de ${item.productName}`);
    if (actualQuantity <= 0) throw new Error(`La cantidad real de ${item.productName} debe ser mayor que cero.`);
    if (item.productSaleUnit !== "kg" && !Number.isInteger(actualQuantity)) {
      throw new Error(`La cantidad real de ${item.productName} debe ser un número entero.`);
    }
    return { id: item.id, actual_quantity: actualQuantity };
  });
}

export function remoteOrderCanBeReady(order) {
  return order?.status === "preparing"
    && Array.isArray(order.items)
    && order.items.length > 0
    && order.items.every((item) => Number.isFinite(item.actualQuantity) && item.actualQuantity > 0);
}

export function remoteOrderStatusLabel(status) {
  return ({
    draft: "Borrador",
    confirmed: "Confirmado",
    preparing: "Preparando",
    ready: "Listo",
    delivered: "Entregado",
    cancelled: "Cancelado",
  })[status] ?? status ?? "Sin estado";
}

export function saleUnitLabel(unit) {
  return ({ kg: "kg", unit: "unidad", bundle: "paquete", pack: "paquete", box: "caja" })[unit] ?? unit;
}

export function generateRemotePublicId(date = new Date(), suffix = "0000") {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("");
  const time = [
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
  const cleanSuffix = String(suffix).replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase().padStart(4, "0");
  return `FM-API-${stamp}-${time}-${cleanSuffix}`;
}
