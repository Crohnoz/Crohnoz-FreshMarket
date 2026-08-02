import { calculateEstimatedTotal } from "./pricing.js";
import { roundQuantity } from "./measurement.js";

function nonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} inválido.`);
  return number;
}

export function calculateWeightAdjustment({
  requestedQuantity,
  actualQuantity,
  pricePerBaseUnit,
  tolerancePercent = 5,
  maxExtraAmount = 0,
}) {
  const requested = nonNegative(requestedQuantity, "Cantidad solicitada");
  const actual = nonNegative(actualQuantity, "Cantidad real");
  const price = nonNegative(pricePerBaseUnit, "Precio");
  const tolerance = nonNegative(tolerancePercent, "Tolerancia");
  const allowedExtra = nonNegative(maxExtraAmount, "Monto adicional");

  const estimatedTotal = calculateEstimatedTotal({ quantityBase: requested, pricePerBaseUnit: price });
  const finalTotal = calculateEstimatedTotal({ quantityBase: actual, pricePerBaseUnit: price });
  const differenceQuantity = roundQuantity(actual - requested);
  const differencePercent = requested === 0 ? (actual === 0 ? 0 : 100) : Number((Math.abs(differenceQuantity) / requested * 100).toFixed(2));
  const differenceAmount = finalTotal - estimatedTotal;
  const exceedsTolerance = differencePercent > tolerance;
  const exceedsAuthorizedAmount = differenceAmount > allowedExtra;
  const requiresConfirmation = exceedsTolerance || exceedsAuthorizedAmount;

  return {
    requestedQuantity: requested,
    actualQuantity: actual,
    estimatedTotal,
    finalTotal,
    differenceQuantity,
    differencePercent,
    differenceAmount,
    exceedsTolerance,
    exceedsAuthorizedAmount,
    requiresConfirmation,
    decision: requiresConfirmation ? "pending_customer_confirmation" : "auto_accepted",
  };
}
