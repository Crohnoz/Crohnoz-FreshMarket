function normalized(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function hasChoice(value) {
  const text = normalized(value);
  return Boolean(text) && !text.startsWith("selecciona");
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0;
}

function nonNegativeNumber(value) {
  if (String(value ?? "").trim() === "") return false;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0;
}

function compactLines(lines) {
  return lines.filter(Boolean);
}

export function summarizeReceptionDraft({
  productLabel = "",
  receivedAt = "",
  bestBefore = "",
  quantity = "",
  unitCost = "",
  qualityLabel = "",
} = {}) {
  const checks = [
    hasChoice(productLabel),
    Boolean(receivedAt),
    positiveNumber(quantity),
    nonNegativeNumber(unitCost),
  ];
  const lines = compactLines([
    checks[0] ? `Producto: ${productLabel}` : "",
    checks[1] ? `Recepción: ${receivedAt}` : "",
    checks[2] ? `Cantidad: ${quantity}` : "",
    checks[3] ? `Costo unitario: $${unitCost}` : "",
    bestBefore ? `Fecha preferente: ${bestBefore}` : "",
    qualityLabel ? `Calidad: ${qualityLabel}` : "",
  ]);
  const completed = checks.filter(Boolean).length;
  return {
    completed,
    total: checks.length,
    ready: completed === checks.length,
    lines,
    detail: lines.join("\n"),
  };
}

export function summarizeMovementDraft({
  lotLabel = "",
  movementLabel = "",
  quantity = "",
  reason = "",
  reference = "",
  adjustment = false,
} = {}) {
  const checks = [
    hasChoice(lotLabel),
    hasChoice(movementLabel),
    adjustment ? nonNegativeNumber(quantity) : positiveNumber(quantity),
    Boolean(String(reason).trim()),
  ];
  const lines = compactLines([
    checks[0] ? `Lote: ${lotLabel}` : "",
    checks[1] ? `Movimiento: ${movementLabel}` : "",
    checks[2] ? `${adjustment ? "Nuevo saldo" : "Cantidad"}: ${quantity}` : "",
    checks[3] ? `Motivo: ${String(reason).trim()}` : "",
    reference ? `Referencia: ${String(reference).trim()}` : "",
  ]);
  const completed = checks.filter(Boolean).length;
  return {
    completed,
    total: checks.length,
    ready: completed === checks.length,
    lines,
    detail: lines.join("\n"),
  };
}

export function lotRowMatches({
  text = "",
  riskLevel = "",
  filter = "all",
  query = "",
} = {}) {
  const haystack = normalized(text);
  const search = normalized(query);
  if (search && !haystack.includes(search)) return false;

  switch (filter) {
    case "fefo":
      return haystack.includes("fefo primero");
    case "danger":
      return riskLevel === "danger";
    case "warning":
      return riskLevel === "warning";
    case "damaged":
      return haystack.includes("danada") || haystack.includes("damaged");
    case "depleted":
      return haystack.includes("agotado") || haystack.includes("depleted");
    default:
      return true;
  }
}

export function movementRowMatches({
  text = "",
  typeText = "",
  filter = "all",
  query = "",
} = {}) {
  const haystack = normalized(text);
  const search = normalized(query);
  if (search && !haystack.includes(search)) return false;
  if (filter === "all") return true;

  const normalizedType = normalized(typeText);
  const expected = {
    consumption: "consumo",
    waste: "merma",
    supplier_return: "devolucion",
    adjustment: "ajuste",
  }[filter];
  return expected ? normalizedType.includes(expected) : true;
}
