import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createRemoteOrderPayload,
  generateRemotePublicId,
  normalizeRemoteOrder,
  normalizeRemoteProduct,
  unwrapPaginated,
} from "../assets/js/domain/remote-orders.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("remote collections and decimals normalize API payloads", () => {
  assert.deepEqual(unwrapPaginated({ results: [{ id: 1 }], next: null }), [{ id: 1 }]);
  const product = normalizeRemoteProduct({
    id: "product-1",
    sku: "PAL-001",
    name: "Palta",
    category: "Frutas",
    sale_unit: "kg",
    price: "4500.00",
    is_active: true,
    version: 2,
  });
  assert.equal(product.price, 4500);
  assert.equal(product.saleUnit, "kg");
  const order = normalizeRemoteOrder({
    id: "order-1",
    public_id: "FM-API-1",
    customer_name: "Cliente",
    status: "confirmed",
    payment_method: "pending",
    total: "5625.00",
    items: [{
      id: "line-1",
      product: "product-1",
      product_name: "Palta",
      requested_quantity: "1.250",
      actual_quantity: null,
      unit_price: "4500.00",
      line_total: "5625.00",
    }],
  });
  assert.equal(order.total, 5625);
  assert.equal(order.items[0].requestedQuantity, 1.25);
});

test("remote order payload requires customer, idempotency and positive lines", () => {
  const payload = createRemoteOrderPayload({
    customerName: "Cliente piloto",
    publicId: "FM-API-20260802-001",
    idempotencyKey: "browser-safe-request-001",
    notes: "Retiro",
    lines: [{ productId: "product-1", quantity: 1.25, unitPrice: 4500 }],
  });
  assert.equal(payload.status, "confirmed");
  assert.equal(payload.payment_method, "pending");
  assert.equal(payload.items[0].requested_quantity, 1.25);
  assert.throws(() => createRemoteOrderPayload({
    customerName: "A",
    publicId: "FM-1",
    idempotencyKey: "short",
    lines: [],
  }), /cliente válido|clave segura|al menos un producto/);
});

test("remote public identifiers remain operator readable", () => {
  const date = new Date(2026, 7, 2, 22, 40, 5);
  assert.equal(generateRemotePublicId(date, "abc-123"), "FM-API-20260802-224005-ABC123");
});

test("remote workspace is explicit and never silently falls back to local data", async () => {
  const html = await text("pedidos-remotos.html");
  const app = await text("assets/js/remote-orders/app.js");
  const repository = await text("assets/js/repositories/api-market.js");
  for (const id of [
    "remote-blocker", "remote-workspace", "remote-products-body", "remote-order-form",
    "create-remote-order", "remote-orders-body", "refresh-remote",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /Nunca cambia silenciosamente a datos locales/i);
  assert.match(repository, /requireConnected/);
  assert.match(repository, /apiRequest\("orders\//);
  assert.doesNotMatch(repository, /localStorage|readStorage|writeStorage/);
  assert.match(app, /La clave de reintento se conserva/);
});

test("Render blueprint isolates secrets, database and health checks", async () => {
  const blueprint = await text("render.yaml");
  const build = await text("backend/build.sh");
  const settings = await text("backend/config/settings.py");
  const requirements = await text("backend/requirements.txt");
  assert.match(blueprint, /name: crohnoz-fresh-market-api/);
  assert.match(blueprint, /plan: free/);
  assert.match(blueprint, /rootDir: backend/);
  assert.match(blueprint, /healthCheckPath: \/api\/v1\/health\//);
  assert.match(blueprint, /fromDatabase:[\s\S]*crohnoz-fresh-market-db[\s\S]*connectionString/);
  assert.match(blueprint, /CAMILA_PILOT_PASSWORD[\s\S]*sync: false/);
  assert.match(blueprint, /CARMELO_PILOT_PASSWORD[\s\S]*sync: false/);
  assert.doesNotMatch(blueprint, /preDeployCommand/);
  assert.doesNotMatch(blueprint, /camila-pilot-only|carmelo-pilot-only|safe-test-password/);
  assert.match(build, /collectstatic --no-input/);
  assert.match(build, /check --deploy/);
  assert.match(build, /migrate --noinput/);
  assert.match(settings, /DATABASE_URL/);
  assert.match(settings, /WhiteNoiseMiddleware/);
  assert.match(requirements, /dj-database-url/);
  assert.match(requirements, /whitenoise/);
});

test("remote order scripts pass syntax validation", () => {
  for (const path of [
    "assets/js/domain/remote-orders.js",
    "assets/js/repositories/api-market.js",
    "assets/js/remote-orders/app.js",
  ]) execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);
});
