import { recommendFEFO } from "./inventory.js";
import { buildReceivablesSummary } from "./receivables.js";

function normalize(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
}

export function buildOperationalContext({ lots = [], customers = [], ledgerEntries = [], closes = [], purchases = [] } = {}) {
  const receivables = buildReceivablesSummary(customers, ledgerEntries);
  const inventoryPriority = recommendFEFO(lots).slice(0, 5);
  const lastClose = [...closes].sort((a, b) => String(b.dateKey).localeCompare(String(a.dateKey)))[0] ?? null;
  const lastPurchase = [...purchases].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
  return { receivables, inventoryPriority, lastClose, lastPurchase };
}

export function interpretOperationalQuestion(text, context) {
  const query = normalize(text);
  if (!query) return { intent: "unknown", confidence: 0, answer: "Necesito una pregunta o instrucción." };
  if (/(vender primero|se echa a perder|riesgo|maduro|inventario)/.test(query)) {
    const first = context.inventoryPriority[0];
    return first
      ? { intent: "inventory_priority", confidence: 0.94, answer: `Prioriza ${first.productName}. Quedan ${first.remaining} ${first.unit} y el lote indica: ${first.risk.reason}.`, evidence: [first.id] }
      : { intent: "inventory_priority", confidence: 0.8, answer: "No hay lotes activos con riesgo registrado.", evidence: [] };
  }
  if (/(deben|deuda|fiado|cobrar)/.test(query)) {
    const top = context.receivables.topDebtor;
    return { intent: "receivables", confidence: 0.95, answer: context.receivables.totalOutstanding
      ? `Hay $${context.receivables.totalOutstanding.toLocaleString("es-CL")} por cobrar entre ${context.receivables.debtorCount} personas. ${top ? `${top.name} tiene el saldo más alto.` : ""}`
      : "No hay deuda pendiente registrada.", evidence: top ? [top.id] : [] };
  }
  if (/(cierre|caja|cuadro|descuadre)/.test(query)) {
    const close = context.lastClose;
    return close
      ? { intent: "daily_close", confidence: 0.91, answer: `El último cierre fue ${close.dateKey}. La diferencia registrada fue $${Number(close.reconciliation?.difference ?? 0).toLocaleString("es-CL")}.`, evidence: [close.id] }
      : { intent: "daily_close", confidence: 0.75, answer: "Todavía no existe un cierre guardado.", evidence: [] };
  }
  if (/(compra|proveedor|costo|precio)/.test(query)) {
    const purchase = context.lastPurchase;
    return purchase
      ? { intent: "purchase_context", confidence: 0.82, answer: `La última compra registrada fue a ${purchase.supplierName} por $${Number(purchase.total).toLocaleString("es-CL")}. Revisa cada producto antes de cambiar precios.`, evidence: [purchase.id] }
      : { intent: "purchase_context", confidence: 0.7, answer: "No hay compras registradas para usar como referencia.", evidence: [] };
  }
  return { intent: "unknown", confidence: 0.35, answer: "No entendí con suficiente seguridad. Puedes preguntar por inventario, fiados, caja o compras." };
}

export function createReviewedProposal({ sourceText, intent, data, confidence = 0.5, evidence = [] }) {
  const normalizedConfidence = Math.max(0, Math.min(1, Number(confidence) || 0));
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `proposal-${Date.now()}`,
    sourceText: String(sourceText ?? "").trim(),
    intent: String(intent ?? "unknown"),
    data: structuredClone(data ?? {}),
    confidence: normalizedConfidence,
    evidence: [...evidence],
    status: "pending_review",
    createdAt: new Date().toISOString(),
    reviewedAt: null,
    reviewerDecision: null,
  };
}

export function reviewProposal(proposal, decision, corrections = null) {
  if (!["approved", "rejected"].includes(decision)) throw new Error("Decisión inválida.");
  return {
    ...proposal,
    data: decision === "approved" && corrections ? { ...proposal.data, ...corrections } : proposal.data,
    status: decision,
    reviewedAt: new Date().toISOString(),
    reviewerDecision: decision,
  };
}
