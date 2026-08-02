function money(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error("Monto inválido.");
  return number;
}

export function calculateUnitCost(totalCost, quantity) {
  const total = money(totalCost);
  const qty = Number(quantity);
  if (total < 0 || !Number.isFinite(qty) || qty <= 0) throw new Error("Compra inválida.");
  return Math.round(total / qty);
}

export function grossMarginPercent(price, cost) {
  const sale = money(price);
  const base = money(cost);
  if (sale <= 0) return 0;
  return Math.round(((sale - base) / sale) * 10_000) / 100;
}

export function suggestedSellingPrice({ unitCost, targetMarginPercent = 30, expectedWastePercent = 0, roundTo = 10 }) {
  const cost = money(unitCost);
  const margin = Number(targetMarginPercent) / 100;
  const waste = Number(expectedWastePercent) / 100;
  if (cost < 0 || margin < 0 || margin >= 0.95 || waste < 0 || waste >= 0.95) throw new Error("Parámetros de precio inválidos.");
  const protectedCost = cost / (1 - waste);
  const raw = protectedCost / (1 - margin);
  const step = Math.max(1, Number(roundTo) || 1);
  return Math.ceil(raw / step) * step;
}

export function purchaseTotal(lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("La compra necesita líneas.");
  return Math.round(lines.reduce((sum, line) => sum + Number(line.quantity) * Number(line.unitCost), 0));
}

export function latestSupplierPrice(purchases, supplierId, productId) {
  return [...purchases]
    .filter((purchase) => purchase.supplierId === supplierId)
    .flatMap((purchase) => purchase.lines.map((line) => ({ ...line, createdAt: purchase.createdAt })))
    .filter((line) => line.productId === productId)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] ?? null;
}

export function buildPriceDecision({ currentPrice, unitCost, targetMarginPercent, expectedWastePercent }) {
  const suggestedPrice = suggestedSellingPrice({ unitCost, targetMarginPercent, expectedWastePercent });
  const currentMargin = grossMarginPercent(currentPrice, unitCost);
  const suggestedMargin = grossMarginPercent(suggestedPrice, unitCost);
  return {
    currentPrice: Math.round(Number(currentPrice) || 0),
    suggestedPrice,
    currentMargin,
    suggestedMargin,
    action: suggestedPrice > currentPrice ? "raise" : suggestedPrice < currentPrice ? "review_down" : "keep",
  };
}
