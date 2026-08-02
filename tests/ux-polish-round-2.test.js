import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chooseOperatorRecommendation, operatorTaskGroups } from "../assets/js/domain/operator-guidance.js";
import { OPERATOR_TASKS } from "../assets/js/domain/operator-tasks.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("operator guidance prioritizes customer confirmation, weighing and ready orders", () => {
  assert.equal(chooseOperatorRecommendation({
    orders: [{ status: "pending_customer_confirmation" }],
  }).taskId, "sales-control");
  assert.equal(chooseOperatorRecommendation({
    orders: [{ status: "pending_weighing" }],
  }).taskId, "prepare");
  assert.equal(chooseOperatorRecommendation({
    orders: [{ status: "ready" }],
    inventorySummary: { criticalLots: 3 },
  }).taskId, "sales-control");
});

test("operator guidance prioritizes critical inventory and evening close", () => {
  assert.equal(chooseOperatorRecommendation({
    inventorySummary: { criticalLots: 2 },
  }).taskId, "inventory");
  assert.equal(chooseOperatorRecommendation({
    now: new Date(2026, 7, 2, 19, 0, 0),
    closes: [],
  }).taskId, "close-day");
});

test("operator tasks are split into frequent and secondary groups", () => {
  const groups = operatorTaskGroups(OPERATOR_TASKS);
  assert.ok(groups.frequent.some((task) => task.id === "sale"));
  assert.ok(groups.frequent.some((task) => task.id === "inventory"));
  assert.ok(groups.secondary.some((task) => task.id === "scan"));
  assert.ok(groups.secondary.some((task) => task.id === "backup"));
  assert.equal(groups.frequent.length + groups.secondary.length, OPERATOR_TASKS.length);
});

test("operator home exposes recommendation, filters and two task levels", async () => {
  const html = await text("operar.html");
  for (const id of ["operator-recommendation", "recommendation-action", "task-filters", "operator-tasks", "operator-more-tasks"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("shared UX layer exposes confirmation, toast and undo controls", async () => {
  const base = await text("assets/css/base.css");
  const css = await text("assets/css/ux-polish.css");
  const feedback = await text("assets/js/core/ui-feedback.js");
  assert.match(base, /ux-polish\.css/);
  assert.match(css, /app-toast-region/);
  assert.match(css, /app-confirm-dialog/);
  assert.match(feedback, /export function confirmAction/);
  assert.match(feedback, /export function showToast/);
});

test("inventory, purchases, sales and admin provide guarded reversible operations", async () => {
  const inventory = await text("assets/js/inventory/app.js");
  const purchasing = await text("assets/js/purchasing/app.js");
  const sales = await text("assets/js/sales/app.js");
  const admin = await text("assets/js/admin/dashboard.js");
  assert.match(inventory, /actionLabel: "Deshacer"/);
  assert.match(purchasing, /confirmAction/);
  assert.match(purchasing, /La última compra fue deshecha/);
  assert.match(sales, /confirmAction/);
  assert.match(sales, /Solo puede deshacerse la operación más reciente/);
  assert.match(admin, /Registrar merma/);
  assert.match(admin, /actionLabel: "Deshacer"/);
});

test("storefront hides advanced product options behind explicit customization", async () => {
  const store = await text("assets/js/store/app.js");
  assert.match(store, /product-customization/);
  assert.match(store, /Cambiar presentación y preferencias/);
  assert.match(store, /catalog-result-count/);
  assert.match(store, /clear-catalog-filters/);
});

test("audited scripts pass syntax validation and offline cache includes new assets", async () => {
  for (const path of [
    "assets/js/core/ui-feedback.js",
    "assets/js/domain/operator-guidance.js",
    "assets/js/operator/home.js",
    "assets/js/inventory/app.js",
    "assets/js/purchasing/app.js",
    "assets/js/sales/app.js",
    "assets/js/admin/dashboard.js",
    "assets/js/store/app.js",
    "sw.js",
  ]) {
    execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);
  }
  const worker = await text("sw.js");
  assert.match(worker, /crohnoz-fresh-market-v\d+/);
  assert.match(worker, /assets\/css\/ux-polish\.css/);
  assert.match(worker, /assets\/js\/core\/ui-feedback\.js/);
  assert.match(worker, /assets\/js\/domain\/operator-guidance\.js/);
});
