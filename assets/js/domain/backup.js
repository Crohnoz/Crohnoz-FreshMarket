export const BACKUP_FORMAT = "crohnoz-fresh-market-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 2_000_000;

const SAFE_KEY = /^[a-z0-9][a-z0-9_-]{0,119}$/i;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function byteLength(value) {
  const text = String(value ?? "");
  if (typeof TextEncoder === "function") return new TextEncoder().encode(text).byteLength;
  return text.length * 2;
}

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertEntries(entries) {
  if (!isPlainObject(entries)) throw new Error("El respaldo no contiene una colección de datos válida.");
  const keys = Object.keys(entries);
  if (keys.length > 100) throw new Error("El respaldo contiene demasiadas colecciones.");
  for (const name of keys) {
    if (!SAFE_KEY.test(name) || FORBIDDEN_KEYS.has(name)) {
      throw new Error(`El respaldo contiene una colección no permitida: ${name}.`);
    }
  }
}

export function createBackupEnvelope(entries, {
  namespace,
  exportedAt = new Date().toISOString(),
  appVersion = "pilot",
} = {}) {
  assertEntries(entries);
  if (!namespace || typeof namespace !== "string") throw new Error("Falta el espacio de datos del respaldo.");
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    namespace,
    appVersion,
    exportedAt,
    entries: JSON.parse(JSON.stringify(entries)),
  };
}

export function serializeBackup(envelope) {
  const text = JSON.stringify(envelope, null, 2);
  if (byteLength(text) > MAX_BACKUP_BYTES) throw new Error("El respaldo supera el máximo de 2 MB permitido por este piloto.");
  return text;
}

export function parseBackupText(text, { expectedNamespace } = {}) {
  if (typeof text !== "string" || !text.trim()) throw new Error("Selecciona un archivo JSON con contenido.");
  if (byteLength(text) > MAX_BACKUP_BYTES) throw new Error("El archivo supera el máximo de 2 MB permitido por este piloto.");
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    throw new Error("El archivo no contiene JSON válido.");
  }
  if (!isPlainObject(envelope)) throw new Error("La estructura del respaldo no es válida.");
  if (envelope.format !== BACKUP_FORMAT) throw new Error("El archivo no corresponde a Crohnoz Fresh Market.");
  if (envelope.version !== BACKUP_VERSION) throw new Error(`La versión ${envelope.version ?? "desconocida"} del respaldo no es compatible.`);
  if (expectedNamespace && envelope.namespace !== expectedNamespace) throw new Error("El respaldo pertenece a otro espacio de datos.");
  if (!Number.isFinite(Date.parse(envelope.exportedAt))) throw new Error("El respaldo no contiene una fecha de exportación válida.");
  assertEntries(envelope.entries);
  return envelope;
}

export function summarizeBackupEntries(entries) {
  assertEntries(entries);
  const collections = Object.keys(entries).length;
  const estimatedRecords = Object.values(entries).reduce((total, value) => {
    if (Array.isArray(value)) return total + value.length;
    if (isPlainObject(value)) return total + Object.keys(value).length;
    return total + 1;
  }, 0);
  const bytes = byteLength(JSON.stringify(entries));
  return { collections, estimatedRecords, bytes };
}

export function formatBackupSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildBackupFilename(businessName, exportedAt = new Date()) {
  const date = exportedAt instanceof Date ? exportedAt : new Date(exportedAt);
  const datePart = Number.isNaN(date.getTime())
    ? "respaldo"
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const slug = String(businessName || "fresh-market")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "fresh-market";
  return `${slug}-respaldo-${datePart}.json`;
}

export function backupAgeDays(lastBackupAt, now = new Date()) {
  const last = new Date(lastBackupAt);
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(last.getTime()) || Number.isNaN(current.getTime())) return Infinity;
  return Math.max(0, Math.floor((current.getTime() - last.getTime()) / 86_400_000));
}

export function shouldRecommendBackup({ activityCount = 0, lastBackupAt = null, now = new Date(), minimumActivity = 5, maximumAgeDays = 7 } = {}) {
  if (Number(activityCount) < minimumActivity) return false;
  return backupAgeDays(lastBackupAt, now) >= maximumAgeDays;
}
