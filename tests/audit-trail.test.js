import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  KERNEL_IMPORT_FORMAT,
  KERNEL_IMPORT_VERSION,
  appendAuditEvent,
  createKernelImportPackage,
  summarizeAuditTrail,
  verifyAuditTrail,
  verifyKernelImportPackage,
} from "../assets/js/domain/audit-trail.js";
import { pilotDefaultEntries } from "../assets/js/data/pilot-state.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("audit events form a deterministic linked sequence", () => {
  let events = appendAuditEvent([], {
    collection: "orders",
    before: [],
    after: [{ id: "FM-1" }],
    occurredAt: "2026-08-02T20:00:00.000Z",
  });
  events = appendAuditEvent(events, {
    collection: "prices",
    before: { banana: 1000 },
    after: { banana: 1200 },
    occurredAt: "2026-08-02T20:01:00.000Z",
  });
  const verification = verifyAuditTrail(events);
  assert.equal(verification.status, "healthy");
  assert.equal(verification.eventsChecked, 2);
  assert.equal(events[0].sequence, 1);
  assert.equal(events[1].sequence, 2);
  assert.equal(events[1].previousEventHash, events[0].eventHash);
  assert.equal(events[0].actor.verified, false);
});

test("audit verification detects payload tampering and broken ordering", () => {
  let events = appendAuditEvent([], {
    collection: "inventory-lots",
    before: [],
    after: [{ id: "lot-1" }],
    occurredAt: "2026-08-02T20:00:00.000Z",
  });
  events = appendAuditEvent(events, {
    collection: "waste",
    before: [],
    after: [{ id: "waste-1" }],
    occurredAt: "2026-08-02T20:01:00.000Z",
  });

  const tampered = clone(events);
  tampered[0].resource.afterCount = 99;
  assert.equal(verifyAuditTrail(tampered).status, "blocked");
  assert.ok(verifyAuditTrail(tampered).issues.some((item) => item.code === "audit-hash-mismatch"));

  const reordered = [events[1], events[0]];
  const reorderedResult = verifyAuditTrail(reordered);
  assert.equal(reorderedResult.status, "blocked");
  assert.ok(reorderedResult.issues.some((item) => ["audit-sequence-gap", "audit-chain-break"].includes(item.code)));
});

test("audit summary distinguishes empty and healthy trails", () => {
  assert.deepEqual(summarizeAuditTrail([]), {
    status: "empty",
    eventsChecked: 0,
    lastSequence: 0,
    lastEventHash: null,
    issues: [],
    collectionsTouched: 0,
    firstOccurredAt: null,
    lastOccurredAt: null,
    unverifiedActors: 0,
  });
  const events = appendAuditEvent([], {
    collection: "daily-closes",
    before: [],
    after: [{ id: "close-1" }],
    occurredAt: "2026-08-02T21:00:00.000Z",
  });
  const summary = summarizeAuditTrail(events);
  assert.equal(summary.status, "healthy");
  assert.equal(summary.collectionsTouched, 1);
  assert.equal(summary.unverifiedActors, 1);
});

test("Kernel import package preserves allowed state and verifies checksum", () => {
  const entries = pilotDefaultEntries();
  entries["audit-log"] = appendAuditEvent([], {
    collection: "orders",
    before: [],
    after: entries.orders,
    occurredAt: "2026-08-02T20:00:00.000Z",
  });
  const packageValue = createKernelImportPackage(entries, {
    organization: { id: "org-local", name: "Mercado Prueba", slug: "mercado-prueba" },
    appVersion: "0.5.0-pilot",
    exportedAt: "2026-08-02T21:00:00.000Z",
  });
  assert.equal(packageValue.format, KERNEL_IMPORT_FORMAT);
  assert.equal(packageValue.version, KERNEL_IMPORT_VERSION);
  assert.equal(packageValue.source.actorTrust, "unverified-local");
  assert.equal(packageValue.organization.slug, "mercado-prueba");
  assert.equal(packageValue.auditVerification.status, "healthy");
  assert.equal(verifyKernelImportPackage(packageValue).verified, true);
  assert.ok(!Object.hasOwn(packageValue.data, "cart"));
});

test("Kernel import package rejects changed data and damaged audit", () => {
  const entries = pilotDefaultEntries();
  entries["audit-log"] = appendAuditEvent([], {
    collection: "orders",
    before: [],
    after: entries.orders,
    occurredAt: "2026-08-02T20:00:00.000Z",
  });
  const packageValue = createKernelImportPackage(entries, {
    organization: { name: "Mercado Prueba", slug: "mercado-prueba" },
    appVersion: "0.5.0-pilot",
    exportedAt: "2026-08-02T21:00:00.000Z",
  });
  const changed = clone(packageValue);
  changed.data.orders[0].customer = "Alterado";
  assert.throws(() => verifyKernelImportPackage(changed), /checksum/);

  const damagedEntries = clone(entries);
  damagedEntries["audit-log"][0].resource.afterCount = 77;
  assert.throws(() => createKernelImportPackage(damagedEntries), /cadena de auditoría/);
});

test("storage adapter records business writes and one restore event", async () => {
  const storage = await text("assets/js/core/storage.js");
  const adapter = await text("assets/js/core/storage-audit.js");
  assert.match(storage, /recordStorageMutation/);
  assert.match(storage, /recordSnapshotRestore/);
  assert.match(storage, /options\.audit !== false/);
  assert.match(adapter, /audit-log/);
  assert.match(adapter, /snapshot\.restore/);
  assert.match(adapter, /isAuditedCollection/);
});

test("audit workspace exposes verification, filtering and Kernel export", async () => {
  const html = await text("auditoria.html");
  for (const id of [
    "refresh-audit",
    "export-kernel-package",
    "audit-status-card",
    "audit-event-count",
    "audit-search",
    "audit-collection-filter",
    "audit-action-filter",
    "audit-list",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /actor local no verificado/i);
  assert.match(html, /assets\/js\/audit\/app\.js/);
});

test("Netlify and offline shell expose audit assets", async () => {
  const netlify = await text("netlify.toml");
  const worker = await text("sw.js");
  assert.match(netlify, /from = "\/auditoria"[\s\S]*to = "\/auditoria\.html"/);
  assert.match(worker, /crohnoz-fresh-market-v7/);
  assert.match(worker, /\/auditoria\.html/);
  assert.match(worker, /assets\/css\/audit\.css/);
  assert.match(worker, /assets\/js\/audit\/app\.js/);
  assert.match(worker, /assets\/js\/core\/storage-audit\.js/);
  assert.match(worker, /assets\/js\/domain\/audit-trail\.js/);
});

test("Kernel contracts require tenant scope, RBAC, idempotency and immutable audit", async () => {
  const openapi = await text("docs/contracts/fresh-market.openapi.yaml");
  const sql = await text("docs/contracts/postgresql-schema.sql");
  const schema = JSON.parse(await text("docs/contracts/kernel-import-package.schema.json"));
  const bridge = await text("docs/KERNEL_MIGRATION_BRIDGE.md");

  assert.match(openapi, /openapi: 3\.1\.0/);
  assert.match(openapi, /Idempotency-Key/);
  assert.match(openapi, /organizationId/);
  assert.match(openapi, /bearerAuth/);
  assert.match(openapi, /audit-events/);
  assert.match(sql, /organization_memberships/);
  assert.match(sql, /role in \('owner', 'manager', 'operator', 'viewer'\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /audit_events is append-only/);
  assert.match(sql, /idempotency_records/);
  assert.equal(schema.properties.format.const, KERNEL_IMPORT_FORMAT);
  assert.equal(schema.properties.version.const, KERNEL_IMPORT_VERSION);
  assert.match(bridge, /Ocultar botones no constituye RBAC/);
  assert.match(bridge, /No declarar producción/);
});

test("audit bridge scripts pass syntax validation", () => {
  for (const path of [
    "assets/js/domain/audit-trail.js",
    "assets/js/core/storage-audit.js",
    "assets/js/core/storage.js",
    "assets/js/data/pilot-state.js",
    "assets/js/audit/app.js",
    "sw.js",
  ]) {
    execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);
  }
});
