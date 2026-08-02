import {
  LOCAL_ORGANIZATION_ID,
  appendAuditEvent,
  auditMeta,
  defaultLocalActor,
  isAuditedCollection,
} from "../domain/audit-trail.js";

function sameValue(left, right) {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

export function recordStorageMutation({
  collection,
  action = "storage.write",
  before = null,
  after = null,
  read,
  persist,
  actor = defaultLocalActor(),
  organizationId = LOCAL_ORGANIZATION_ID,
  source = "browser-local",
  reason = null,
} = {}) {
  if (!isAuditedCollection(collection) || sameValue(before, after)) return null;
  if (typeof read !== "function" || typeof persist !== "function") {
    throw new Error("La auditoría de almacenamiento requiere adaptadores de lectura y escritura.");
  }
  const current = read("audit-log", []);
  const events = appendAuditEvent(Array.isArray(current) ? current : [], {
    collection,
    action,
    before,
    after,
    actor,
    organizationId,
    source,
    reason,
  });
  persist("audit-log", events);
  persist("audit-meta", auditMeta(events));
  return events.at(-1);
}

export function recordSnapshotRestore({
  previousSummary,
  restoredSummary,
  read,
  persist,
  actor = defaultLocalActor(),
  organizationId = LOCAL_ORGANIZATION_ID,
  source = "backup-restore",
  reason = "Restauración confirmada por el operador local.",
} = {}) {
  if (typeof read !== "function" || typeof persist !== "function") {
    throw new Error("La restauración auditada requiere adaptadores de lectura y escritura.");
  }
  const current = read("audit-log", []);
  const events = appendAuditEvent(Array.isArray(current) ? current : [], {
    collection: "storage",
    action: "snapshot.restore",
    before: previousSummary,
    after: restoredSummary,
    actor,
    organizationId,
    source,
    reason,
  });
  persist("audit-log", events);
  persist("audit-meta", auditMeta(events));
  return events.at(-1);
}
