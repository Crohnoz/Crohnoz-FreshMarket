import { APP_CONFIG } from "./config.js";

const memory = new Map();

function key(name) {
  return `${APP_CONFIG.storageNamespace}:${name}`;
}

function prefix() {
  return `${APP_CONFIG.storageNamespace}:`;
}

function clone(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
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

export function writeStorage(name, value) {
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

export function removeStorage(name) {
  const storageKey = key(name);
  try {
    window.localStorage.removeItem(storageKey);
  } catch (error) {
    console.warn("No se pudo limpiar localStorage.", error);
  }
  memory.delete(storageKey);
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

export function replaceStorageSnapshot(entries) {
  if (!entries || typeof entries !== "object" || Array.isArray(entries)) {
    throw new Error("No se puede restaurar una colección de datos inválida.");
  }
  resetDemoStorage();
  Object.entries(entries).forEach(([name, value]) => writeStorage(name, value));
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
