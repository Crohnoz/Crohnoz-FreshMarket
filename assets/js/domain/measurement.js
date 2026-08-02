const DIMENSIONS = Object.freeze({
  kg: { dimension: "mass", factor: 1 },
  g: { dimension: "mass", factor: 0.001 },
  unit: { dimension: "count", factor: 1 },
  tray: { dimension: "package", factor: 1 },
  bag: { dimension: "package", factor: 1 },
  pack: { dimension: "package", factor: 1 },
  box: { dimension: "package", factor: 1 },
});

function assertNonNegative(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${label} debe ser un número mayor o igual a cero.`);
  }
  return number;
}

export function convertQuantity(value, fromUnit, toUnit) {
  const quantity = assertNonNegative(value, "La cantidad");
  const from = DIMENSIONS[fromUnit];
  const to = DIMENSIONS[toUnit];
  if (!from || !to) throw new RangeError("Unidad de medida no soportada.");
  if (from.dimension !== to.dimension) {
    throw new RangeError(`No se puede convertir ${fromUnit} a ${toUnit}.`);
  }
  return Number(((quantity * from.factor) / to.factor).toFixed(6));
}

export function toBaseQuantity(value, unit, baseUnit) {
  return convertQuantity(value, unit, baseUnit);
}

export function validateMeasurementOption(option) {
  if (!option || typeof option !== "object") throw new TypeError("Opción de medida inválida.");
  if (!option.label?.trim()) throw new TypeError("La opción requiere una etiqueta.");
  if (!Number.isFinite(Number(option.quantityBase)) || Number(option.quantityBase) <= 0) {
    throw new TypeError("La cantidad base debe ser mayor que cero.");
  }
  return true;
}

export function roundQuantity(value, decimals = 3) {
  const quantity = assertNonNegative(value, "La cantidad");
  const factor = 10 ** decimals;
  return Math.round((quantity + Number.EPSILON) * factor) / factor;
}
