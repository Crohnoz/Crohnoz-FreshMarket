export function normalizeBarcode(value) {
  return String(value ?? "").trim().replace(/\s+/g, "");
}

function calculateCheckDigit(body, weights) {
  const sum = body
    .split("")
    .reduce((total, digit, index) => total + Number(digit) * weights[index % weights.length], 0);
  return (10 - (sum % 10)) % 10;
}

export function validateEAN13(code) {
  const normalized = normalizeBarcode(code);
  if (!/^\d{13}$/.test(normalized)) return false;
  return calculateCheckDigit(normalized.slice(0, 12), [1, 3]) === Number(normalized.at(-1));
}

export function validateEAN8(code) {
  const normalized = normalizeBarcode(code);
  if (!/^\d{8}$/.test(normalized)) return false;
  return calculateCheckDigit(normalized.slice(0, 7), [3, 1]) === Number(normalized.at(-1));
}

export function validateUPCA(code) {
  const normalized = normalizeBarcode(code);
  if (!/^\d{12}$/.test(normalized)) return false;
  return calculateCheckDigit(normalized.slice(0, 11), [3, 1]) === Number(normalized.at(-1));
}

export function inspectBarcode(code) {
  const normalized = normalizeBarcode(code);
  if (!normalized) return { normalized, format: "empty", valid: false, reason: "Código vacío" };
  if (/^\d{13}$/.test(normalized)) return { normalized, format: "EAN-13", valid: validateEAN13(normalized), reason: "Checksum EAN-13" };
  if (/^\d{8}$/.test(normalized)) return { normalized, format: "EAN-8", valid: validateEAN8(normalized), reason: "Checksum EAN-8" };
  if (/^\d{12}$/.test(normalized)) return { normalized, format: "UPC-A", valid: validateUPCA(normalized), reason: "Checksum UPC-A" };
  if (/^[A-Za-z0-9._\-/]+$/.test(normalized)) return { normalized, format: "Alfanumérico / Code 128 probable", valid: true, reason: "Estructura aceptada; hardware no confirmado" };
  return { normalized, format: "Desconocido", valid: false, reason: "Contiene caracteres no admitidos" };
}
