export const clp = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
});

export function formatCLP(value) {
  return clp.format(Number.isFinite(Number(value)) ? Number(value) : 0);
}

export function formatQuantity(value, unit) {
  const number = Number(value);
  const decimals = Number.isInteger(number) ? 0 : 3;
  return `${number.toLocaleString("es-CL", { maximumFractionDigits: decimals })} ${unit}`;
}

export function localDateTime(date = new Date()) {
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}
