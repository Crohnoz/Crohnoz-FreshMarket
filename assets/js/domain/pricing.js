function amount(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} inválido.`);
  return number;
}

export function calculateEstimatedTotal({ quantityBase, pricePerBaseUnit, fixedPrice = null }) {
  if (fixedPrice !== null && fixedPrice !== undefined) return Math.round(amount(fixedPrice, "Precio fijo"));
  return Math.round(amount(quantityBase, "Cantidad") * amount(pricePerBaseUnit, "Precio"));
}

export function calculateMargin({ salePrice, cost }) {
  const sale = amount(salePrice, "Precio de venta");
  const purchase = amount(cost, "Costo");
  if (sale === 0) return { amount: -purchase, percent: 0 };
  const marginAmount = sale - purchase;
  return {
    amount: Math.round(marginAmount),
    percent: Number(((marginAmount / sale) * 100).toFixed(2)),
  };
}
