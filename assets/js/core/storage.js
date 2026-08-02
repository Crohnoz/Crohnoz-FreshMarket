import { APP_CONFIG } from "./config.js";

const memory = new Map();

function key(name) {
  return `${APP_CONFIG.storageNamespace}:${name}`;
}

export function readStorage(name, fallback) {
  const storageKey = key(name);
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? structuredClone(fallback) : JSON.parse(raw);
  } catch (error) {
    console.warn("Storage no disponible; se usa memoria temporal.", error);
    return memory.has(storageKey) ? structuredClone(memory.get(storageKey)) : structuredClone(fallback);
  }
}

export function writeStorage(name, value) {
  const storageKey = key(name);
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(value));
  } catch (error) {
    console.warn("No se pudo persistir en localStorage.", error);
    memory.set(storageKey, structuredClone(value));
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

export function resetDemoStorage() {
  const prefix = `${APP_CONFIG.storageNamespace}:`;
  try {
    Object.keys(window.localStorage)
      .filter((item) => item.startsWith(prefix))
      .forEach((item) => window.localStorage.removeItem(item));
  } catch (error) {
    console.warn("No se pudo restablecer el almacenamiento demo.", error);
  }
  memory.clear();
}
