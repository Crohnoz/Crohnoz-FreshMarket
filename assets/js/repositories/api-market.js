import { ApiError, apiRequest, connectionState } from "../core/connection.js";
import { normalizeRemoteOrder, normalizeRemoteProduct, unwrapPaginated } from "../domain/remote-orders.js";

function requireConnected() {
  const state = connectionState();
  if (state.state !== "connected") {
    throw new ApiError("Conecta una cuenta y elige el negocio antes de usar pedidos remotos.", {
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
