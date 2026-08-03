function cleanText(value, maxLength = 240) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function decimalNumber(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} no contiene un número válido.`);
  return number;
}

export function normalizeRemoteLot(raw) {
  const id = cleanText(raw?.id, 80);
  const productId = cleanText(raw?.product, 80);
  const productName = cleanText(raw?.product_name, 160);
  if (!id || !productId || !productName) throw new Error("La API devolvió un lote incompleto.");
  return {
    id,
    productId,
    productName,
    receivedAt: cleanText(raw.received_at, 20),
    bestBefore: cleanText(raw.best_before, 20),
    quantityReceived: decimalNumber(raw.quantity_received, "La cantidad recibida"),
    quantityAvailable: decimalNumber(raw.quantity_available, "La cantidad disponible"),
    unitCost: decimalNumber(raw.unit_cost, "El costo unitario"),
    quality: cleanText(raw.quality, 24),
    status: cleanText(raw.status, 24),
    notes: cleanText(raw.notes, 240),
    version: Number(raw.version ?? 1),
    createdAt: cleanText(raw.created_at, 80),
  };
}

export function createRemoteReceptionPayload({
  productId,
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
