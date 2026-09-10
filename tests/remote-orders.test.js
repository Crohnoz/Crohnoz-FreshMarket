import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  createRemoteOrderPayload,
  createRemoteWeighingPayload,
  generateRemotePublicId,
  normalizeRemoteOrder,
  normalizeRemoteProduct,
  remoteOrderCanBeReady,
  unwrapPaginated,
} from "../assets/js/domain/remote-orders.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function preparingOrder(overrides = {}) {
  return {
    id: "order-1",
    publicId: "FM-API-1",
    status: "preparing",
    version: 2,
    items: [{
      id: "line-1",
      productName: "Palta",
      productSaleUnit: "kg",
      requestedQuantity: 1.25,
      actualQuantity: null,
    }],
    ...overrides,
  };
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
    version: 3,
    items: [{
      id: "line-1",
      product: "product-1",
      product_name: "Palta",
      product_sale_unit: "kg",
      requested_quantity: "1.250",
      actual_quantity: null,
      unit_price: "4500.00",
      line_total: "5625.00",
    }],
  });
  assert.equal(order.total, 5625);
  assert.equal(order.version, 3);
  assert.equal(order.items[0].requestedQuantity, 1.25);
  assert.equal(order.items[0].productSaleUnit, "kg");
});

test("remote order payload requires customer, idempotency and unique positive lines", () => {
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
  assert.throws(() => createRemoteOrderPayload({
    customerName: "Cliente",
    publicId: "FM-2",
    idempotencyKey: "safe-request-key",
    lines: [
      { productId: "product-1", quantity: 1, unitPrice: 1000 },
      { productId: "product-1", quantity: 2, unitPrice: 1000 },
    ],
  }), /una sola vez/);
});

test("remote weighing requires every current line and respects units", () => {
  const order = preparingOrder();
  assert.deepEqual(createRemoteWeighingPayload(order, [{ id: "line-1", actualQuantity: "1.300" }]), [
    { id: "line-1", actual_quantity: 1.3 },
  ]);
  assert.equal(remoteOrderCanBeReady(order), false);
  assert.equal(remoteOrderCanBeReady({ ...order, items: [{ ...order.items[0], actualQuantity: 1.3 }] }), true);
  assert.throws(() => createRemoteWeighingPayload(order, []), /exactamente todas/);
  const unitOrder = preparingOrder({
    items: [{ ...order.items[0], productName: "Lechuga", productSaleUnit: "unit" }],
  });
  assert.throws(() => createRemoteWeighingPayload(unitOrder, [{ id: "line-1", actualQuantity: "1.5" }]), /número entero/);
});

test("remote public identifiers remain operator readable", () => {
  const date = new Date(2026, 7, 2, 22, 40, 5);
  assert.equal(generateRemotePublicId(date, "abc-123"), "FM-API-20260802-224005-ABC123");
});

test("remote workspace exposes explicit versioned workflow without local fallback", async () => {
  const html = await text("pedidos-remotos.html");
  const app = await text("assets/js/remote-orders/app.js");
  const repository = await text("assets/js/repositories/api-market.js");
  for (const id of [
    "remote-blocker", "remote-workspace", "remote-products-body", "remote-order-form",
    "create-remote-order", "remote-orders-body", "refresh-remote", "remote-weighing-dialog",
    "remote-weighing-form", "remote-weighing-lines", "save-remote-weighing",
  ]) assert.match(html, new RegExp(`id=["']${id}["']`));
  assert.match(html, /controla la versión del pedido/i);
  assert.match(repository, /requireConnected/);
  assert.match(repository, /If-Match/);
  assert.match(repository, /Idempotency-Key/);
  assert.match(repository, /start-preparing/);
  assert.match(repository, /confirm-weighing/);
  assert.match(repository, /mark-ready/);
  assert.doesNotMatch(repository, /localStorage|readStorage|writeStorage/);
  assert.match(app, /workflowKeys/);
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
  assert.match(blueprint, /PILOT_MANAGER_PASSWORD[\s\S]*sync: false/);
  assert.match(blueprint, /PILOT_OPERATOR_PASSWORD[\s\S]*sync: false/);
  assert.doesNotMatch(blueprint, /preDeployCommand/);
  assert.doesNotMatch(blueprint, /manager-prototype-only|operator-prototype-only|safe-test-password/);
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
