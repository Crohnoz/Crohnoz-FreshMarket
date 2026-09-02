import { readStorage, writeStorage } from "./storage.js";

const SETTINGS_KEY = "connection-settings";
const SESSION_KEY = "crohnoz-fresh-market:api-session";
const DEFAULT_SETTINGS = Object.freeze({ mode: "local", apiBaseUrl: "" });

export class ApiError extends Error {
  constructor(message, { status = 0, code = "api_error", detail = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

export function normalizeApiBaseUrl(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Ingresa una dirección API válida, por ejemplo https://api.ejemplo.cl/api/v1");
  }
  const localHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error("La API debe usar HTTPS. HTTP solo se permite en localhost para desarrollo.");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("La dirección API no debe incluir credenciales, parámetros ni fragmentos.");
  }
  return url.toString().replace(/\/$/, "");
}

export function readConnectionSettings() {
  const stored = readStorage(SETTINGS_KEY, DEFAULT_SETTINGS);
  try {
    return {
      mode: stored?.mode === "api" ? "api" : "local",
      apiBaseUrl: normalizeApiBaseUrl(stored?.apiBaseUrl ?? ""),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveConnectionSettings(settings) {
  const normalized = {
    mode: settings?.mode === "api" ? "api" : "local",
    apiBaseUrl: normalizeApiBaseUrl(settings?.apiBaseUrl ?? ""),
  };
  if (normalized.mode === "api" && !normalized.apiBaseUrl) {
    throw new Error("Configura la dirección API antes de activar el modo conectado.");
  }
  writeStorage(SETTINGS_KEY, normalized);
  notifyConnectionChanged();
  return normalized;
}

function safeSession(value) {
  if (!value || typeof value !== "object") return null;
  if (typeof value.token !== "string" || !value.token) return null;
  if (!value.user || typeof value.user !== "object") return null;
  const memberships = Array.isArray(value.memberships) ? value.memberships : [];
  return {
    token: value.token,
    user: value.user,
    memberships,
    organizationId: typeof value.organizationId === "string" ? value.organizationId : "",
    createdAt: typeof value.createdAt === "string" ? value.createdAt : "",
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : "",
  };
}

export function readApiSession() {
  try {
    const session = safeSession(JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? "null"));
    if (!session) return null;
    const expiry = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiry) || expiry <= Date.now()) {
      sessionStorage.removeItem(SESSION_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

export function writeApiSession(session) {
  const normalized = safeSession(session);
  if (!normalized || !Number.isFinite(new Date(normalized.expiresAt).getTime())) {
    throw new Error("La sesión recibida no es válida.");
  }
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
  notifyConnectionChanged();
  return normalized;
}

export function clearApiSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch { /* storage may be unavailable */ }
  notifyConnectionChanged();
}

export function selectOrganization(organizationId) {
  const session = readApiSession();
  if (!session) throw new Error("Inicia sesión antes de elegir un negocio.");
  const id = String(organizationId ?? "").trim();
  if (!session.memberships.some((membership) => String(membership.organization) === id)) {
    throw new Error("La cuenta no pertenece al negocio seleccionado.");
  }
  return writeApiSession({ ...session, organizationId: id });
}

export function activeMembership(session = readApiSession()) {
  if (!session?.organizationId) return null;
  return session.memberships.find((item) => String(item.organization) === String(session.organizationId)) ?? null;
}

export function connectionState() {
  const settings = readConnectionSettings();
  const session = readApiSession();
  if (settings.mode !== "api" || !settings.apiBaseUrl) return { state: "local", settings, session: null, membership: null };
  if (!session) return { state: "configured", settings, session: null, membership: null };
  const membership = activeMembership(session);
  return { state: membership ? "connected" : "organization-required", settings, session, membership };
}

function notifyConnectionChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("crohnoz:connection-changed"));
}

function flattenDetail(value) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(flattenDetail).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    return Object.values(value).map(flattenDetail).filter(Boolean).join(" ");
  }
  return "";
}

async function parseResponse(response) {
  if (response.status === 204) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("application/json")) return null;
  try { return await response.json(); } catch { return null; }
}

export async function apiRequest(path, {
  method = "GET",
  body,
  auth = true,
  organizationId,
  timeoutMs = 12000,
  headers = {},
} = {}) {
  const settings = readConnectionSettings();
  if (!settings.apiBaseUrl) throw new ApiError("La dirección API todavía no está configurada.", { code: "api_not_configured" });
  const session = readApiSession();
  if (auth && !session) throw new ApiError("La sesión terminó. Ingresa nuevamente.", { status: 401, code: "session_required" });

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  const requestHeaders = { Accept: "application/json", ...headers };
  if (body !== undefined) requestHeaders["Content-Type"] = "application/json";
  if (auth) requestHeaders.Authorization = `Token ${session.token}`;
  const selectedOrganization = organizationId ?? session?.organizationId;
  if (selectedOrganization) requestHeaders["X-Organization-ID"] = selectedOrganization;

  try {
    const response = await fetch(`${settings.apiBaseUrl}/${String(path).replace(/^\//, "")}`, {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      credentials: "omit",
      signal: controller.signal,
    });
    const payload = await parseResponse(response);
    if (!response.ok) {
      const wrapped = payload?.error ?? {};
      const message = flattenDetail(wrapped.detail ?? payload?.detail) || `La API respondió con estado ${response.status}.`;
      if (response.status === 401) clearApiSession();
      throw new ApiError(message, { status: response.status, code: wrapped.code ?? "api_error", detail: wrapped.detail ?? payload });
    }
    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error.name === "AbortError") throw new ApiError("La API tardó demasiado en responder.", { code: "timeout" });
    throw new ApiError("No fue posible comunicarse con la API. Revisa internet y la dirección configurada.", { code: "network_error" });
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function testApiConnection() {
  return apiRequest("health/", { auth: false, timeoutMs: 8000 });
}

export async function loginToApi(username, password) {
  const payload = await apiRequest("auth/login/", {
    method: "POST",
    auth: false,
    body: { username: String(username ?? "").trim(), password: String(password ?? "") },
  });
  const organizationId = payload.default_organization ? String(payload.default_organization) : "";
  return writeApiSession({
    token: payload.token,
    user: payload.user,
    memberships: payload.memberships,
    organizationId,
    createdAt: new Date().toISOString(),
    expiresAt: payload.expires_at,
  });
}

export async function logoutFromApi() {
  try {
    if (readApiSession()) await apiRequest("auth/logout/", { method: "POST" });
  } finally {
    clearApiSession();
  }
}

export async function changeApiPassword(currentPassword, newPassword, confirmation) {
  await apiRequest("auth/change-password/", {
    method: "POST",
    body: {
      current_password: String(currentPassword ?? ""),
      new_password: String(newPassword ?? ""),
      new_password_confirmation: String(confirmation ?? ""),
    },
  });
  clearApiSession();
}

export function fetchConnectionSummary() {
  return apiRequest("connection-summary/");
}
