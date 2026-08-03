import { ApiError, apiRequest, connectionState } from "../core/connection.js";
import { normalizeRemoteLot } from "../domain/remote-inventory.js";
import { normalizeRemoteOrder, normalizeRemoteProduct, unwrapPaginated } from "../domain/remote-orders.js";

function requireConnected() {
  const state = connectionState();
  if (state.state !== "connected") {
    throw new ApiError("Conecta una cuenta y elige el negocio antes de usar operaciones remotas.", {
      status: 401,
      code: "connected_session_required",
    });
  }
  return state;
}

async function fetchAllPages(resource, query = {}, { maxPages = 20 } = {}) {
  requireConnected();
  const records = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({ ...query, page: String(page) });
    const payload = await apiRequest(`${resource}/?${params.toString()}`);
    records.push(...unwrapPaginated(payload));
    if (!payload?.next) return records;
  }
  throw new ApiError("La colección remota excedió el límite seguro de páginas.", { code: "pagination_limit" });
}

export async function listRemoteProducts() {
  const records = await fetchAllPages("products", { is_active: "true" });
  return records.map(normalizeRemoteProduct);
}

export async function listRemoteLots({ status = "", product = "" } = {}) {
  const query = {};
  if (status) query.status = status;
  if (product) query.product = product;
  const records = await fetchAllPages("inventory-lots", query);
  return records.map(normalizeRemoteLot);
}

export async function receiveRemoteLot(payload, { idempotencyKey } = {}) {
  requireConnected();
  return normalizeRemoteLot(await apiRequest("inventory-lots/receive/", {
    method: "POST",
    body: payload,
    headers: { "Idempotency-Key": String(idempotencyKey ?? "") },
    timeoutMs: 18000,
  }));
}

export async function listRemoteOrders({ status = "" } = {}) {
  const query = status ? { status } : {};
  const records = await fetchAllPages("orders", query);
  return records.map(normalizeRemoteOrder);
}

export async function createRemoteOrder(payload) {
  requireConnected();
  return normalizeRemoteOrder(await apiRequest("orders/", {
    method: "POST",
    body: payload,
    timeoutMs: 18000,
  }));
}

async function runOrderWorkflow(order, action, {
  body = {},
  idempotencyKey,
} = {}) {
  requireConnected();
  if (!order?.id || !Number.isInteger(Number(order.version))) {
    throw new ApiError("El pedido remoto no contiene una versión válida. Actualiza la pantalla.", { code: "invalid_order_version" });
  }
  return normalizeRemoteOrder(await apiRequest(`orders/${order.id}/${action}/`, {
    method: "POST",
    body,
    headers: {
      "If-Match": String(order.version),
      "Idempotency-Key": String(idempotencyKey ?? ""),
    },
    timeoutMs: 18000,
  }));
}

export function startRemoteOrderPreparation(order, options = {}) {
  return runOrderWorkflow(order, "start-preparing", options);
}

export function confirmRemoteOrderWeighing(order, items, options = {}) {
  return runOrderWorkflow(order, "confirm-weighing", { ...options, body: { items } });
}

export function markRemoteOrderReady(order, options = {}) {
  return runOrderWorkflow(order, "mark-ready", options);
}
