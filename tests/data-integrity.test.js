import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  LEGACY_BACKUP_VERSION,
  computeBackupChecksum,
  createBackupEnvelope,
  parseBackupText,
} from "../assets/js/domain/backup.js";
import { auditDataIntegrity } from "../assets/js/domain/data-integrity.js";
import { chooseOperatorRecommendation } from "../assets/js/domain/operator-guidance.js";
import { products } from "../assets/js/data/demo-data.js";
import { materializePilotEntries, pilotDefaultEntries } from "../assets/js/data/pilot-state.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("the complete effective demo state passes integrity checks", () => {
  const entries = materializePilotEntries({});
  const report = auditDataIntegrity(entries, { products });
  assert.equal(report.status, "healthy");
  assert.deepEqual(report.counts, { critical: 0, warning: 0, info: 0 });
  assert.ok(report.collectionsChecked >= 12);
  assert.ok(report.recordsChecked > 20);
  assert.deepEqual(report.issues, []);
});

test("materialization preserves stored values while supplying missing pilot collections", () => {
  const entries = materializePilotEntries({
    business: { name: "Negocio restaurado" },
    orders: [],
    waste: [{ id: "waste-1", productId: "banana", quantity: 1, unit: "kg", createdAt: "2026-08-02" }],
  });
  assert.equal(entries.business.name, "Negocio restaurado");
  assert.deepEqual(entries.orders, []);
  assert.equal(entries.waste.length, 1);
  assert.ok(Array.isArray(entries.suppliers));
  assert.ok(Array.isArray(entries["credit-customers"]));
  assert.ok(Object.hasOwn(entries, "prices"));
});

test("critical corruption detects duplicates, broken references, negative stock and invalid close math", () => {
  const entries = clone(pilotDefaultEntries());
  entries.orders.push(clone(entries.orders[0]));
  entries["order-payments"][0].orderId = "FM-missing";
  entries["inventory-lots"][0].soldQuantity = 99;
  entries["daily-closes"].push({
    id: "close-broken",
    dateKey: "2026-08-02",
    savedAt: "2026-08-02T20:00:00-04:00",
    reconciliation: {
      expectedCash: 10000,
      countedCash: 8000,
      difference: 500,
      absoluteDifference: 500,
      status: "review",
    },
  });
  const report = auditDataIntegrity(entries, { products });
  const codes = new Set(report.issues.map((item) => item.code));
  assert.equal(report.status, "blocked");
  assert.ok(report.counts.critical >= 4);
  assert.ok(codes.has("duplicate-id"));
  assert.ok(codes.has("unknown-order"));
  assert.ok(codes.has("negative-stock"));
  assert.ok(codes.has("close-difference-mismatch"));
});

test("non-blocking inconsistencies remain review warnings", () => {
  const entries = clone(pilotDefaultEntries());
  const payment = entries["credit-ledger"].find((item) => item.type === "payment");
  payment.settlement = "";
  entries["daily-transactions"][0].total += 50;
  const report = auditDataIntegrity(entries, { products });
  const codes = new Set(report.issues.map((item) => item.code));
  assert.equal(report.status, "review");
  assert.equal(report.counts.critical, 0);
  assert.ok(report.counts.warning >= 2);
  assert.ok(codes.has("unclassified-payment"));
  assert.ok(codes.has("transaction-total-mismatch"));
});

test("checksum is deterministic across object key order", () => {
  const left = {
    orders: [{ id: "1", customer: "Ana" }],
    business: { name: "Mercado", colors: { primary: "green", accent: "yellow" } },
  };
  const right = {
    business: { colors: { accent: "yellow", primary: "green" }, name: "Mercado" },
    orders: [{ customer: "Ana", id: "1" }],
  };
  assert.equal(computeBackupChecksum(left), computeBackupChecksum(right));
  assert.match(computeBackupChecksum(left), /^fnv1a64:[a-f0-9]{16}$/);
});

test("tampered version 2 backup is rejected", () => {
  const envelope = createBackupEnvelope(pilotDefaultEntries(), {
    namespace: "crohnoz-fresh-market",
    appVersion: "0.4.0-pilot",
    exportedAt: "2026-08-02T20:00:00.000Z",
  });
  const tampered = clone(envelope);
  tampered.entries.business.name = "Nombre alterado";
  assert.throws(
    () => parseBackupText(JSON.stringify(tampered), { expectedNamespace: "crohnoz-fresh-market" }),
    /checksum no coincide/,
  );
});

test("legacy version 1 backup remains compatible but unverified", () => {
  const entries = pilotDefaultEntries();
  const legacy = {
    format: BACKUP_FORMAT,
    version: LEGACY_BACKUP_VERSION,
    namespace: "crohnoz-fresh-market",
    appVersion: "0.3.0-pilot",
    exportedAt: "2026-08-02T19:00:00.000Z",
    entries,
  };
  const restored = parseBackupText(JSON.stringify(legacy), { expectedNamespace: "crohnoz-fresh-market" });
  assert.equal(restored.version, LEGACY_BACKUP_VERSION);
  assert.equal(restored.integrity.verified, false);
  assert.equal(restored.integrity.legacy, true);
});

test("operator priorities stop on critical integrity but defer warnings behind urgent operations", () => {
  const daytime = new Date(2026, 7, 2, 15, 0, 0);
  assert.equal(chooseOperatorRecommendation({
    integritySummary: { status: "blocked", counts: { critical: 2, warning: 0 } },
    orders: [{ status: "pending_weighing" }],
    now: daytime,
  }).taskId, "integrity");
  assert.equal(chooseOperatorRecommendation({
    integritySummary: { status: "review", counts: { critical: 0, warning: 2 } },
    orders: [{ status: "pending_weighing" }],
    now: daytime,
  }).taskId, "prepare");
  assert.equal(chooseOperatorRecommendation({
    integritySummary: { status: "review", counts: { critical: 0, warning: 2 } },
    now: daytime,
  }).taskId, "integrity");
});

test("integrity page exposes status, filtering and report controls", async () => {
  const html = await text("integridad.html");
  for (const id of [
    "run-integrity",
    "download-integrity",
    "integrity-status-card",
    "integrity-status-title",
    "integrity-collections",
    "integrity-records",
    "integrity-critical",
    "integrity-warning",
    "integrity-search",
    "integrity-filters",
    "integrity-issues",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /solo lectura/i);
  assert.match(html, /assets\/js\/integrity\/app\.js/);
});

test("Netlify and offline shell expose the integrity route", async () => {
  const netlify = await text("netlify.toml");
  const worker = await text("sw.js");
  assert.match(netlify, /from = "\/integridad"[\s\S]*to = "\/integridad\.html"/);
  assert.match(worker, /crohnoz-fresh-market-v6/);
  assert.match(worker, /\/integridad\.html/);
  assert.match(worker, /assets\/css\/data-integrity\.css/);
  assert.match(worker, /assets\/js\/integrity\/app\.js/);
});

test("integrity and checksum scripts pass syntax validation", () => {
  for (const path of [
    "assets/js/domain/backup.js",
    "assets/js/domain/data-integrity.js",
    "assets/js/data/pilot-state.js",
    "assets/js/integrity/app.js",
    "assets/js/configurator/app.js",
    "assets/js/operator/home.js",
    "assets/js/core/guided-shell.js",
    "assets/js/core/guided-shell-state.js",
    "sw.js",
  ]) {
    execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);
  }
});

test("current backup constants describe version 2 with legacy support", () => {
  assert.equal(BACKUP_VERSION, 2);
  assert.equal(LEGACY_BACKUP_VERSION, 1);
});
