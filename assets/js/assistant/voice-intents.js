const SMALL_NUMBERS = new Map([
  ["cero", 0], ["un", 1], ["uno", 1], ["una", 1], ["dos", 2], ["tres", 3],
  ["cuatro", 4], ["cinco", 5], ["seis", 6], ["siete", 7], ["ocho", 8],
  ["nueve", 9], ["diez", 10], ["once", 11], ["doce", 12], ["trece", 13],
  ["catorce", 14], ["quince", 15], ["dieciseis", 16], ["diecisiete", 17],
  ["dieciocho", 18], ["diecinueve", 19], ["veinte", 20], ["veintiuno", 21],
  ["veintidos", 22], ["veintitres", 23], ["veinticuatro", 24], ["veinticinco", 25],
  ["veintiseis", 26], ["veintisiete", 27], ["veintiocho", 28], ["veintinueve", 29],
  ["treinta", 30], ["cuarenta", 40], ["cincuenta", 50], ["sesenta", 60],
  ["setenta", 70], ["ochenta", 80], ["noventa", 90], ["cien", 100], ["ciento", 100],
  ["doscientos", 200], ["trescientos", 300], ["cuatrocientos", 400],
  ["quinientos", 500], ["seiscientos", 600], ["setecientos", 700],
  ["ochocientos", 800], ["novecientos", 900],
]);

const NUMBER_TOKENS = new Set([...SMALL_NUMBERS.keys(), "y", "mil"]);

function normalizeRecognitionVocabulary(value) {
  return String(value)
    .replace(/\b(fiao|fiao|fiáo|viado)\b/gi, "fiado")
    .replace(/\b(lukitas?|luquitas?)\b/gi, "lucas")
    .replace(/\b(abonó|abonó)\b/gi, "abono")
    .replace(/\b(transfirió|transfirió)\b/gi, "transfirio")
    .replace(/\b(anótale|anotalé)\b/gi, "anotale")
    .replace(/\b(kilo gramos?|kilogramos?)\b/gi, "kilos");
}

function normalize(text) {
  return normalizeRecognitionVocabulary(String(text ?? ""))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[¿?¡!,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseWords(tokens) {
  let total = 0;
  let current = 0;
  let consumed = 0;
  for (const token of tokens) {
    if (token === "y") {
      consumed += 1;
      continue;
    }
    if (token === "mil") {
      current = (current || 1) * 1000;
      total += current;
      current = 0;
      consumed += 1;
      continue;
    }
    if (SMALL_NUMBERS.has(token)) {
      current += SMALL_NUMBERS.get(token);
      consumed += 1;
      continue;
    }
    break;
  }
  return consumed ? { value: total + current, consumed } : null;
}

export function parseSpokenNumber(value) {
  const normalized = normalize(value);
  if (!normalized) return null;

  const compact = normalized.replace(/\s/g, "");
  if (/^\d+(?:[.,]\d+)?$/.test(compact)) {
    return Number(compact.replace(",", "."));
  }

  const tokens = normalized.split(" ");
  const parsed = parseWords(tokens);
  return parsed?.consumed === tokens.length ? parsed.value : null;
}

function moneyFromMatch(raw, multiplier = 1) {
  const parsed = parseSpokenNumber(raw);
  return parsed === null ? null : Math.round(parsed * multiplier);
}

function findMoney(text) {
  const normalized = normalize(text);
  const lucas = normalized.match(/((?:\d+(?:[.,]\d+)?|[a-z]+)(?:\s+y\s+[a-z]+)?)\s+(?:luca|lucas)\b/);
  if (lucas) return { amount: moneyFromMatch(lucas[1], 1000), raw: lucas[0] };

  const digits = normalized.match(/\$?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{3,})\b/);
  if (digits) return { amount: Number(digits[1].replace(/[.\s]/g, "")), raw: digits[0] };

  const tokens = normalized.split(" ");
  for (let start = 0; start < tokens.length; start += 1) {
    if (!NUMBER_TOKENS.has(tokens[start])) continue;
    let end = start;
    while (end < tokens.length && NUMBER_TOKENS.has(tokens[end])) end += 1;
    const candidateTokens = tokens.slice(start, end);
    if (candidateTokens.includes("mil")) {
      const candidate = candidateTokens.join(" ");
      const amount = moneyFromMatch(candidate);
      if (amount) return { amount, raw: candidate };
    }
    start = end - 1;
  }
  return null;
}

function cleanName(value) {
  return value
    .replace(/\b(a|le|anotale|anota|registrale|registra|cargale|carga|de|fiado|un|nuevo|pago|abono|recibio|recibi|me)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("es"));
}

function chargeIntent(text) {
  const normalized = normalize(text);
  if (!/(fiado|debe|anotale|anota|cargale|carga|fio)/.test(normalized)) return null;
  const money = findMoney(normalized);
  if (!money?.amount) return { intent: "charge", confidence: "low", data: {}, missing: ["amount"], originalText: text };
  const before = normalized.slice(0, normalized.indexOf(money.raw)).trim();
  const name = cleanName(before);
  return {
    intent: "charge",
    confidence: name ? "high" : "medium",
    data: { customerName: name, amount: money.amount, description: "Fiado registrado por voz" },
    missing: name ? [] : ["customerName"],
    originalText: text,
  };
}

function paymentIntent(text) {
  const normalized = normalize(text);
  if (!/(abono|pago|cancelo|deposito|transfirio|pago su cuenta)/.test(normalized)) return null;
  const money = findMoney(normalized);
  if (!money?.amount) return { intent: "payment", confidence: "low", data: {}, missing: ["amount"], originalText: text };
  const keyword = normalized.search(/abono|pago|cancel|deposito|transfirio/);
  const name = cleanName(normalized.slice(0, keyword));
  return {
    intent: "payment",
    confidence: name ? "high" : "medium",
    data: { customerName: name, amount: money.amount, description: "Abono registrado por voz" },
    missing: name ? [] : ["customerName"],
    originalText: text,
  };
}

function queryIntent(text) {
  const normalized = normalize(text);
  if (/(cuanto|total).*(deben|deuda|fiado)|deben.*total/.test(normalized)) {
    return { intent: "query_total_debt", confidence: "high", data: {}, missing: [], originalText: text };
  }
  if (/(quien|cual).*(debe mas|mayor deuda)|mayor.*deuda/.test(normalized)) {
    return { intent: "query_top_debtor", confidence: "high", data: {}, missing: [], originalText: text };
  }
  if (/(lee|leeme|dime|revisa).*(cuentas|deudas|fiados|pendientes)/.test(normalized)) {
    return { intent: "read_pending_accounts", confidence: "high", data: {}, missing: [], originalText: text };
  }
  return null;
}

function transactionIntent(text) {
  const normalized = normalize(text);
  const type = /\b(compre|compramos|compra)\b/.test(normalized) ? "purchase"
    : /\b(vendi|vendimos|venta)\b/.test(normalized) ? "sale" : null;
  if (!type) return null;

  const quantityMatch = normalized.match(/\b(\d+(?:[.,]\d+)?|[a-z]+(?:\s+y\s+[a-z]+)?)\s*(kilos?|kg|unidades?|mallas?|cajas?|bandejas?|sacos?|paquetes?|manojos?)\b/);
  const priceMatch = normalized.match(/\b(?:a|en)\s+((?:\d{1,3}(?:[.\s]\d{3})+|\d{2,})|(?:[a-z]+\s+){0,8}mil(?:\s+(?:[a-z]+\s*){0,8})?)\b/);
  const productMatch = normalized.match(/\b(?:kilos?|kg|unidades?|mallas?|cajas?|bandejas?|sacos?|paquetes?|manojos?)\s+de\s+(.+?)(?:\s+(?:a|en)\s+|$)/);
  const quantity = quantityMatch ? parseSpokenNumber(quantityMatch[1]) : null;
  const unitPrice = priceMatch ? parseSpokenNumber(priceMatch[1].trim()) : null;
  const product = productMatch?.[1]?.trim() ?? "";
  const missing = [];
  if (!quantity) missing.push("quantity");
  if (!product) missing.push("product");
  if (!unitPrice) missing.push("unitPrice");
  return {
    intent: "transaction_line",
    confidence: missing.length ? "medium" : "high",
    data: {
      type,
      quantity,
      unit: quantityMatch?.[2] ?? "",
      product,
      unitPrice: unitPrice ? Math.round(unitPrice) : null,
    },
    missing,
    originalText: text,
  };
}

export function interpretVoiceCommand(text) {
  const originalText = String(text ?? "").trim();
  if (!originalText) {
    return { intent: "unknown", confidence: "low", data: {}, missing: ["command"], originalText };
  }
  return queryIntent(originalText)
    ?? paymentIntent(originalText)
    ?? chargeIntent(originalText)
    ?? transactionIntent(originalText)
    ?? { intent: "unknown", confidence: "low", data: {}, missing: ["command"], originalText };
}

function interpretationScore(parsed, recognitionConfidence = null) {
  const confidenceScore = ({ high: 35, medium: 18, low: 0 })[parsed.confidence] ?? 0;
  const intentScore = parsed.intent === "unknown" ? 0 : 100;
  const missingPenalty = (parsed.missing?.length ?? 0) * 28;
  const recognitionScore = Number.isFinite(recognitionConfidence) ? recognitionConfidence * 12 : 0;
  return intentScore + confidenceScore + recognitionScore - missingPenalty;
}

export function chooseVoiceCandidate(candidates) {
  const normalizedCandidates = (Array.isArray(candidates) ? candidates : [candidates])
    .map((candidate) => typeof candidate === "string"
      ? { transcript: candidate, confidence: null }
      : { transcript: String(candidate?.transcript ?? "").trim(), confidence: candidate?.confidence ?? null })
    .filter((candidate) => candidate.transcript);

  if (!normalizedCandidates.length) {
    const parsed = interpretVoiceCommand("");
    return { text: "", parsed, alternatives: [] };
  }

  const ranked = normalizedCandidates.map((candidate) => {
    const parsed = interpretVoiceCommand(candidate.transcript);
    return {
      ...candidate,
      parsed,
      score: interpretationScore(parsed, candidate.confidence),
    };
  }).sort((left, right) => right.score - left.score);

  return {
    text: ranked[0].transcript,
    parsed: ranked[0].parsed,
    alternatives: ranked,
  };
}

export function intentLabel(intent) {
  return ({
    charge: "Nuevo fiado",
    payment: "Abono recibido",
    transaction_line: "Línea de operación",
    query_total_debt: "Consultar deuda total",
    query_top_debtor: "Consultar mayor deuda",
    read_pending_accounts: "Leer cuentas pendientes",
    unknown: "No comprendido",
  })[intent] ?? intent;
}
