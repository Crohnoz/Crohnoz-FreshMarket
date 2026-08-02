const DAY_MS = 86_400_000;

function dateOnly(value) {
  if (!value) return null;
  const text = typeof value === "string" ? value.slice(0, 10) : null;
  const date = text ? new Date(`${text}T12:00:00Z`) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function lotRemaining(lot) {
  const received = Number(lot.receivedQuantity ?? 0);
  const sold = Number(lot.soldQuantity ?? 0);
  const waste = Number(lot.wasteQuantity ?? 0);
  const adjustment = Number(lot.adjustmentQuantity ?? 0);
  return Math.max(0, Math.round((received - sold - waste + adjustment) * 1000) / 1000);
}

export function daysUntil(dateValue, reference = new Date()) {
  const target = dateOnly(dateValue);
  const today = dateOnly(reference instanceof Date
    ? `${reference.getFullYear()}-${String(reference.getMonth() + 1).padStart(2, "0")}-${String(reference.getDate()).padStart(2, "0")}`
    : reference);
  if (!target || !today) return null;
  return Math.ceil((target.getTime() - today.getTime()) / DAY_MS);
}

export function lotRisk(lot, reference = new Date()) {
  const remaining = lotRemaining(lot);
  if (remaining <= 0) return { level: "exhausted", score: 0, reason: "Lote agotado", days: null };
  const days = daysUntil(lot.bestBeforeDate, reference);
  const condition = String(lot.condition ?? "good");
  const ripeness = Number(lot.ripeness ?? 2);
  if (["damaged", "overripe"].includes(condition) || ripeness >= 5 || (days !== null && days <= 1)) {
    return { level: "critical", score: 3, reason: days !== null && days <= 1 ? "Vender o procesar hoy" : "Calidad en riesgo", days };
  }
  if (["ripe", "soft"].includes(condition) || ripeness >= 4 || (days !== null && days <= 3)) {
    return { level: "attention", score: 2, reason: "Priorizar durante los próximos días", days };
  }
  return { level: "healthy", score: 1, reason: "Rotación normal", days };
}

export function recommendFEFO(lots, productId = null, reference = new Date()) {
  return lots
    .filter((lot) => (!productId || lot.productId === productId) && lotRemaining(lot) > 0)
    .map((lot) => ({ ...lot, risk: lotRisk(lot, reference), remaining: lotRemaining(lot) }))
    .sort((a, b) => {
      if (b.risk.score !== a.risk.score) return b.risk.score - a.risk.score;
      const aDays = a.risk.days ?? Number.POSITIVE_INFINITY;
      const bDays = b.risk.days ?? Number.POSITIVE_INFINITY;
      if (aDays !== bDays) return aDays - bDays;
      return String(a.receivedAt).localeCompare(String(b.receivedAt));
    });
}

export function inventorySummary(lots, reference = new Date()) {
  const active = lots.filter((lot) => lotRemaining(lot) > 0);
  const enriched = active.map((lot) => ({ ...lot, remaining: lotRemaining(lot), risk: lotRisk(lot, reference) }));
  const stockValue = enriched.reduce((sum, lot) => sum + lot.remaining * Number(lot.unitCost ?? 0), 0);
  const atRiskValue = enriched
    .filter((lot) => ["critical", "attention"].includes(lot.risk.level))
    .reduce((sum, lot) => sum + lot.remaining * Number(lot.unitCost ?? 0), 0);
  return {
    totalLots: lots.length,
    activeLots: active.length,
    criticalLots: enriched.filter((lot) => lot.risk.level === "critical").length,
    attentionLots: enriched.filter((lot) => lot.risk.level === "attention").length,
    stockValue: Math.round(stockValue),
    atRiskValue: Math.round(atRiskValue),
    recommendations: recommendFEFO(lots, null, reference).slice(0, 5),
  };
}

export function createInventoryLot(input) {
  const quantity = Number(input.receivedQuantity);
  const unitCost = Number(input.unitCost);
  if (!input.productId || !Number.isFinite(quantity) || quantity <= 0) throw new Error("Cantidad de recepción inválida.");
  if (!Number.isFinite(unitCost) || unitCost < 0) throw new Error("Costo unitario inválido.");
  return {
    id: input.id ?? globalThis.crypto?.randomUUID?.() ?? `lot-${Date.now()}`,
    productId: input.productId,
    productName: input.productName ?? input.productId,
    unit: input.unit ?? "kg",
    receivedQuantity: Math.round(quantity * 1000) / 1000,
    soldQuantity: 0,
    wasteQuantity: 0,
    adjustmentQuantity: 0,
    unitCost: Math.round(unitCost),
    receivedAt: String(input.receivedAt).slice(0, 10),
    bestBeforeDate: input.bestBeforeDate ? String(input.bestBeforeDate).slice(0, 10) : null,
    condition: input.condition ?? "good",
    ripeness: Number(input.ripeness ?? 2),
    supplierId: input.supplierId ?? null,
    source: input.source ?? "manual",
    notes: String(input.notes ?? "").trim(),
  };
}

export function applyLotMovement(lot, { type, quantity }) {
  const amount = Number(quantity);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Cantidad inválida.");
  if (type !== "adjustment" && amount > lotRemaining(lot)) throw new Error("La cantidad supera el saldo del lote.");
  const updated = { ...lot };
  if (type === "sale") updated.soldQuantity = Number(updated.soldQuantity ?? 0) + amount;
  else if (type === "waste") updated.wasteQuantity = Number(updated.wasteQuantity ?? 0) + amount;
  else if (type === "adjustment") updated.adjustmentQuantity = Number(updated.adjustmentQuantity ?? 0) + amount;
  else throw new Error("Tipo de movimiento desconocido.");
  return updated;
}
