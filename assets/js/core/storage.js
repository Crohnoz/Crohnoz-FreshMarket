import { APP_CONFIG } from "./config.js";
import { isAuditedCollection } from "../domain/audit-trail.js";
import { recordSnapshotRestore, recordStorageMutation } from "./storage-audit.js";

const memory = new Map();

function key(name) {
  return `${APP_CONFIG.storageNamespace}:${name}`;
}

function prefix() {
  return `${APP_CONFIG.storageNamespace}:`;
}

function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function persistRaw(name, value) {
  const storageKey = key(name);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
    memory.delete(storageKey);
  } catch (error) {
    console.warn("No se pudo persistir en localStorage.", error);
    memory.set(storageKey, clone(value));
  }
  return value;
}

function removeRaw(name) {
  const storageKey = key(name);
  try {
    window.localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn("No se pudo limpiar localStorage.", error);
  }
  memory.delete(storageKey);
}

export function readStorage(name, fallback) {
  const storageKey = key(name);
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? clone(fallback) : JSON.parse(raw);
  } catch (error) {
    console.warn("Storage no disponible; se usa memoria temporal.", error);
    return memory.has(storageKey) ? clone(memory.get(storageKey)) : clone(fallback);
  }
}

export function writeStorage(name, value, options = {}) {
  const before = options.audit === false || !isAuditedCollection(name)
    ? null
    : readStorage(name, null);
  persistRaw(name, value);
  if (options.audit !== false) {
    recordStorageMutation({
      collection: name,
      action: options.action ?? "storage.write",
      before,
      after: value,
      read: readStorage,
      persist: persistRaw,
      actor: options.actor,
      organizationId: options.organizationId,
      source: options.source,
      reason: options.reason,
    });
  }
  return value;
}

export function removeStorage(name, options = {}) {
  const before = options.audit === false || !isAuditedCollection(name)
    ? null
    : readStorage(name, null);
  removeRaw(name);
  if (options.audit !== false && before !== null && before !== undefined) {
    recordStorageMutation({
      collection: name,
      action: options.action ?? "storage.remove",
      before,
      after: null,
      read: readStorage,
      persist: persistRaw,
      actor: options.actor,
      organizationId: options.organizationId,
      source: options.source,
      reason: options.reason,
    });
  }
}

export function snapshotStorage() {
  const entries = {};
  const invalidKeys = [];
  let bytes = 0;
  let backend = "localStorage";
  const namespacePrefix = prefix();

  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const storageKey = window.localStorage.key(index);
      if (!storageKey?.startsWith(namespacePrefix)) continue;
      const name = storageKey.slice(namespacePrefix.length);
      const raw = window.localStorage.getItem(storageKey);
      if (raw === null) continue;
      bytes += raw.length * 2;
      try {
        entries[name] = JSON.parse(raw);
      } catch {
        invalidKeys.push(name);
      }
    }
  } catch (error) {
    console.warn("No se pudo inspeccionar localStorage; se revisará la memoria temporal.", error);
    backend = "memory";
  }

  for (const [storageKey, value] of memory.entries()) {
    if (!storageKey.startsWith(namespacePrefix)) continue;
    const name = storageKey.slice(namespacePrefix.length);
    if (Object.hasOwn(entries, name)) continue;
    entries[name] = clone(value);
    bytes += JSON.stringify(value).length * 2;
    backend = backend === "localStorage" ? "mixed" : "memory";
  }

  return {
    namespace: APP_CONFIG.storageNamespace,
    entries,
    collections: Object.keys(entries).length,
    invalidKeys,
    bytes,
    backend,
  };
}

export function replaceStorageSnapshot(entries, options = {}) {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error("No se puede restaurar una colección de datos inválida.");
  }
  const previous = snapshotStorage();
  resetDemoStorage();
  Object.entries(entries).forEach(([name, value]) => persistRaw(name, value));
  recordSnapshotRestore({
    previousSummary: { collections: previous.collections, backend: previous.backend },
    restoredSummary: { collections: Object.keys(entries).length, namespace: APP_CONFIG.storageNamespace },
    read: readStorage,
    persist: persistRaw,
    actor: options.actor,
    organizationId: options.organizationId,
    source: options.source,
    reason: options.reason,
  });
  return snapshotStorage();
}

export function resetDemoStorage() {
  const namespacePrefix = prefix();
  try {
    Object.keys(window.localStorage)
      .filter((item) => item.startsWith(namespacePrefix))
      .forEach((item) => window.localStorage.removeItem(item));
  } catch (error) {
    console.warn("No se pudo restablecer el almacenamiento demo.", error);
  }
  memory.clear();
}
