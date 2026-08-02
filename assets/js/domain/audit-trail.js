import { computeBackupChecksum } from "./backup.js";

export const AUDIT_FORMAT = "crohnoz-fresh-market-audit";
export const AUDIT_VERSION = 1;
export const KERNEL_IMPORT_FORMAT = "crohnoz-kernel-import-package";
export const KERNEL_IMPORT_VERSION = 1;
export const LOCAL_ORGANIZATION_ID = "org-local-pilot";
export const LOCAL_ACTOR_ID = "actor-local-operator";

export const AUDITED_COLLECTIONS = Object.freeze([
  "business",
  "orders",
  "prices",
  "inventory-lots",
  "suppliers",
  "purchase-orders",
  "order-payments",
  "credit-customers",
  "credit-ledger",
  "daily-transactions",
  "waste",
  "daily-closes",
  "assistant-proposals",
  "pilot-validations",
]);

export const KERNEL_EXPORT_COLLECTIONS = Object.freeze([
  ...AUDITED_COLLECTIONS,
  "audit-log",
  "audit-meta",
]);

function clone(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function safeDate(value = new Date().toISOString()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("La auditoría requiere una fecha válida.");
  return date.toISOString();
}

function safeIdentifier(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function recordCount(value) {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === "object") return Object.keys(value).length;
  return value === null || value === undefined ? 0 : 1;
}

function digest(value) {
  return computeBackupChecksum({ value: clone(value) });
}

function eventWithoutHash(event) {
  const { eventHash: _eventHash, ...payload } = event;
  return payload;
}

export function computeAuditEventHash(event) {
  return computeBackupChecksum({ event: eventWithoutHash(event) });
}

export function isAuditedCollection(name) {
  return AUDITED_COLLECTIONS.includes(String(name));
}

export function defaultLocalActor(overrides = {}) {
  return {
    id: safeIdentifier(overrides.id, LOCAL_ACTOR_ID),
    type: safeIdentifier(overrides.type, "local-operator"),
    role: safeIdentifier(overrides.role, "owner"),
    verified: overrides.verified === true,
  };
}

export function createAuditEvent({
  previousEvent = null,
  collection,
  action = "storage.write",
  before = null,
  after = null,
  occurredAt = new Date().toISOString(),
  organizationId = LOCAL_ORGANIZATION_ID,
  actor = defaultLocalActor(),
  source = "browser-local",
  reason = null,
} = {}) {
  const sequence = Number(previousEvent?.sequence ?? 0) + 1;
  const timestamp = safeDate(occurredAt);
  const event = {
    id: `audit-${String(sequence).padStart(6, "0")}-${timestamp.replace(/\D/g, "").slice(0, 17)}`,
    sequence,
    occurredAt: timestamp,
    organizationId: safeIdentifier(organizationId, LOCAL_ORGANIZATION_ID),
    actor: defaultLocalActor(actor),
    action: safeIdentifier(action, "storage.write"),
    source: safeIdentifier(source, "browser-local"),
    resource: {
      collection: safeIdentifier(collection, "unknown"),
      beforeCount: recordCount(before),
      afterCount: recordCount(after),
    },
    beforeDigest: digest(before),
    afterDigest: digest(after),
    previousEventHash: previousEvent?.eventHash ?? null,
    reason: reason ? String(reason).slice(0, 240) : null,
  };
  return { ...event, eventHash: computeAuditEventHash(event) };
}

export function appendAuditEvent(events, input) {
  const current = Array.isArray(events) ? events.map(clone) : [];
  const previousEvent = current.at(-1) ?? null;
  return [...current, createAuditEvent({ ...input, previousEvent })];
}

export function verifyAuditTrail(events) {
  if (!Array.isArray(events)) {
    return {
      status: "blocked",
      eventsChecked: 0,
      lastSequence: 0,
      lastEventHash: null,
      issues: [{ code: "invalid-audit-log", index: null, message: "El historial de auditoría no es una lista." }],
    };
  }
  if (!events.length) {
    return { status: "empty", eventsChecked: 0, lastSequence: 0, lastEventHash: null, issues: [] };
  }

  const issues = [];
  const ids = new Set();
  events.forEach((event, index) => {
    const expectedSequence = index + 1;
    const previousEvent = index > 0 ? events[index - 1] : null;
    if (!event || typeof event !== "object" || Array.isArray(event)) {
      issues.push({ code: "invalid-audit-event", index, message: `El evento ${expectedSequence} no contiene una estructura válida.` });
      return;
    }
    if (!event.id || ids.has(event.id)) {
      issues.push({ code: "invalid-audit-id", index, message: `El evento ${expectedSequence} no tiene un ID único.` });
    }
    ids.add(event.id);
    if (event.sequence !== expectedSequence) {
      issues.push({ code: "audit-sequence-gap", index, message: `La secuencia esperada era ${expectedSequence} y se encontró ${event.sequence ?? "vacío"}.` });
    }
    if (!Number.isFinite(Date.parse(event.occurredAt))) {
      issues.push({ code: "invalid-audit-date", index, message: `El evento ${expectedSequence} no tiene una fecha válida.` });
    }
    const expectedPreviousHash = previousEvent?.eventHash ?? null;
    if (event.previousEventHash !== expectedPreviousHash) {
      issues.push({ code: "audit-chain-break", index, message: `El evento ${expectedSequence} no enlaza con el hash anterior.` });
    }
    try {
      const expectedHash = computeAuditEventHash(event);
      if (event.eventHash !== expectedHash) {
        issues.push({ code: "audit-hash-mismatch", index, message: `El evento ${expectedSequence} fue modificado o está dañado.` });
      }
    } catch {
      issues.push({ code: "audit-hash-error", index, message: `No se pudo recalcular el hash del evento ${expectedSequence}.` });
    }
  });

  return {
    status: issues.length ? "blocked" : "healthy",
    eventsChecked: events.length,
    lastSequence: Number(events.at(-1)?.sequence ?? 0),
    lastEventHash: events.at(-1)?.eventHash ?? null,
    issues,
  };
}

export function summarizeAuditTrail(events) {
  const trail = Array.isArray(events) ? events : [];
  const verification = verifyAuditTrail(trail);
  const collections = new Set(trail.map((event) => event?.resource?.collection).filter(Boolean));
  const unverifiedActors = trail.filter((event) => event?.actor?.verified !== true).length;
  return {
    ...verification,
    collectionsTouched: collections.size,
    firstOccurredAt: trail[0]?.occurredAt ?? null,
    lastOccurredAt: trail.at(-1)?.occurredAt ?? null,
    unverifiedActors,
  };
}

export function auditMeta(events) {
  const summary = summarizeAuditTrail(events);
  return {
    version: AUDIT_VERSION,
    status: summary.status,
    lastSequence: summary.lastSequence,
    lastEventHash: summary.lastEventHash,
    eventCount: summary.eventsChecked,
    updatedAt: summary.lastOccurredAt,
  };
}

function selectedEntries(entries) {
  const source = entries && typeof entries === "object" && !Array.isArray(entries) ? entries : {};
  return KERNEL_EXPORT_COLLECTIONS.reduce((result, name) => {
    if (Object.hasOwn(source, name)) result[name] = clone(source[name]);
    return result;
  }, {});
}

export function createKernelImportPackage(entries, {
  organization = {},
  appVersion = "pilot",
  exportedAt = new Date().toISOString(),
} = {}) {
  const data = selectedEntries(entries);
  const organizationRecord = {
    id: safeIdentifier(organization.id, LOCAL_ORGANIZATION_ID),
    name: safeIdentifier(organization.name, "Negocio local"),
    slug: safeIdentifier(organization.slug, "local-pilot"),
    sourceMode: "local-unverified",
  };
  const audit = Array.isArray(data["audit-log"]) ? data["audit-log"] : [];
  const auditVerification = verifyAuditTrail(audit);
  if (auditVerification.status === "blocked") {
    throw new Error("No se puede crear el paquete Kernel porque la cadena de auditoría está dañada.");
  }
  const payload = {
    organization: organizationRecord,
    data,
    auditVerification: {
      status: auditVerification.status,
      eventsChecked: auditVerification.eventsChecked,
      lastEventHash: auditVerification.lastEventHash,
    },
  };
  return {
    format: KERNEL_IMPORT_FORMAT,
    version: KERNEL_IMPORT_VERSION,
    exportedAt: safeDate(exportedAt),
    source: {
      product: "crohnoz-fresh-market",
      appVersion: String(appVersion),
      persistence: "localStorage",
      actorTrust: "unverified-local",
    },
    ...payload,
    checksum: computeBackupChecksum(payload),
  };
}

export function verifyKernelImportPackage(packageValue) {
  if (!packageValue || typeof packageValue !== "object" || Array.isArray(packageValue)) {
    throw new Error("El paquete Kernel no contiene una estructura válida.");
  }
  if (packageValue.format !== KERNEL_IMPORT_FORMAT || packageValue.version !== KERNEL_IMPORT_VERSION) {
    throw new Error("El formato o versión del paquete Kernel no es compatible.");
  }
  const payload = {
    organization: packageValue.organization,
    data: packageValue.data,
    auditVerification: packageValue.auditVerification,
  };
  if (packageValue.checksum !== computeBackupChecksum(payload)) {
    throw new Error("El checksum del paquete Kernel no coincide.");
  }
  const audit = packageValue.data?.["audit-log"] ?? [];
  const verification = verifyAuditTrail(audit);
  if (verification.status === "blocked") throw new Error("La cadena de auditoría del paquete Kernel está dañada.");
  return { verified: true, audit: verification };
}
