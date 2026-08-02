import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  buildBackupFilename,
  computeBackupChecksum,
  createBackupEnvelope,
  parseBackupText,
  serializeBackup,
  shouldRecommendBackup,
  summarizeBackupEntries,
} from "../assets/js/domain/backup.js";
import { chooseOperatorRecommendation } from "../assets/js/domain/operator-guidance.js";
import { buildOperatorReadiness, normalizeResumeTarget } from "../assets/js/domain/operator-readiness.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("backup format round-trips valid namespaced data with checksum", () => {
  const entries = {
    business: { name: "Mercado de prueba" },
    orders: [{ id: "FM-1" }, { id: "FM-2" }],
  };
  const envelope = createBackupEnvelope(entries, {
    namespace: "crohnoz-fresh-market",
    appVersion: "0.4.0-pilot",
    exportedAt: "2026-08-02T19:00:00.000Z",
  });
  const restored = parseBackupText(serializeBackup(envelope), { expectedNamespace: "crohnoz-fresh-market" });
  assert.equal(restored.format, BACKUP_FORMAT);
  assert.equal(restored.version, BACKUP_VERSION);
  assert.equal(restored.checksum, computeBackupChecksum(entries));
  assert.equal(restored.integrity.verified, true);
  assert.deepEqual(restored.entries, entries);
  assert.deepEqual(summarizeBackupEntries(entries), {
    collections: 2,
    estimatedRecords: 3,
    bytes: JSON.stringify(entries).length,
  });
});

test("backup parser rejects foreign, unsafe and oversized files", () => {
  const foreign = createBackupEnvelope({ business: {} }, {
    namespace: "another-product",
    exportedAt: "2026-08-02T19:00:00.000Z",
  });
  assert.throws(() => parseBackupText(JSON.stringify(foreign), { expectedNamespace: "crohnoz-fresh-market" }), /otro espacio de datos/);

  const unsafe = JSON.stringify({
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    namespace: "crohnoz-fresh-market",
    exportedAt: "2026-08-02T19:00:00.000Z",
    checksum: "fnv1a64:0000000000000000",
    entries: JSON.parse('{"__proto__":{"polluted":true}}'),
  });
  assert.throws(() => parseBackupText(unsafe, { expectedNamespace: "crohnoz-fresh-market" }), /no permitida/);
  assert.throws(() => parseBackupText("x".repeat(2_000_001)), /máximo de 2 MB/);
});

test("backup filenames are stable and backup reminders require activity", () => {
  assert.equal(buildBackupFilename("Mercado La Cosecha", new Date(2026, 7, 2)), "mercado-la-cosecha-respaldo-2026-08-02.json");
  assert.equal(shouldRecommendBackup({ activityCount: 4, lastBackupAt: null }), false);
  assert.equal(shouldRecommendBackup({ activityCount: 5, lastBackupAt: null }), true);
  assert.equal(shouldRecommendBackup({
    activityCount: 8,
    lastBackupAt: "2026-07-30T10:00:00.000Z",
    now: new Date("2026-08-02T10:00:00.000Z"),
  }), false);
  assert.equal(shouldRecommendBackup({
    activityCount: 8,
    lastBackupAt: "2026-07-20T10:00:00.000Z",
    now: new Date("2026-08-02T10:00:00.000Z"),
  }), true);
});

test("operator guidance recommends continuity without overriding urgent work", () => {
  const daytime = new Date(2026, 7, 2, 15, 0, 0);
  assert.equal(chooseOperatorRecommendation({
    activityCount: 7,
    lastBackupAt: null,
    outstanding: 15000,
    now: daytime,
  }).taskId, "backup");
  assert.equal(chooseOperatorRecommendation({
    orders: [{ status: "pending_weighing" }],
    activityCount: 7,
    lastBackupAt: null,
    now: daytime,
  }).taskId, "prepare");
  assert.equal(chooseOperatorRecommendation({
    inventorySummary: { criticalLots: 1 },
    activityCount: 7,
    lastBackupAt: null,
    now: daytime,
  }).taskId, "inventory");
});

test("readiness tracks configuration, integrity, visits and first backup", () => {
  const defaults = { name: "Mercado", tagline: "Fresco", whatsapp: "", primaryColor: "#000", accentColor: "#fff", deliveryFee: 0, tolerancePercent: 5, maxExtraAmount: 1000 };
  const pending = buildOperatorReadiness({ business: defaults, defaultBusiness: defaults });
  assert.equal(pending.completed, 0);
  assert.equal(pending.total, 5);
  const ready = buildOperatorReadiness({
    business: { ...defaults, name: "Mi negocio" },
    defaultBusiness: defaults,
    visitedPages: ["inventario.html", "ventas.html"],
    continuityMeta: { lastBackupAt: "2026-08-02T19:00:00.000Z" },
    integrityMeta: { lastScanAt: "2026-08-02T18:55:00.000Z", status: "healthy" },
  });
  assert.equal(ready.completed, 5);
  assert.equal(ready.percent, 100);
  assert.equal(ready.ready, true);
});

test("resume targets accept only known local operator routes", () => {
  assert.deepEqual(normalizeResumeTarget({
    href: "ventas.html?estado=ready#pedido",
    label: "Cobros y entregas",
    visitedAt: "2026-08-02T19:00:00.000Z",
  }), {
    href: "ventas.html?estado=ready#pedido",
    label: "Cobros y entregas",
    visitedAt: "2026-08-02T19:00:00.000Z",
  });
  assert.deepEqual(normalizeResumeTarget({ href: "integridad.html", label: "Integridad de datos" }), {
    href: "integridad.html",
    label: "Integridad de datos",
    visitedAt: null,
  });
  assert.equal(normalizeResumeTarget({ href: "https://example.com", label: "Fuera" }), null);
  assert.equal(normalizeResumeTarget({ href: "unknown.html", label: "Desconocido" }), null);
  assert.equal(normalizeResumeTarget({ href: "operar.html", label: "Inicio" }), null);
});

test("configuration page exposes checksum, integrity, restore and destructive reset controls", async () => {
  const html = await text("configurador.html");
  for (const id of ["continuidad", "export-backup", "backup-file", "backup-preview", "backup-preview-integrity", "import-backup", "reset-demo", "continuity-status"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /Máximo 2 MB/);
  assert.match(html, /checksum/);
  assert.match(html, /integridad\.html/);
  assert.match(html, /guided-shell\.js/);
});

test("guided shell normalizes aliases and records resumable operator routes", async () => {
  const shell = await text("assets/js/core/guided-shell.js");
  const state = await text("assets/js/core/guided-shell-state.js");
  assert.match(shell, /guided-onboarding-v2/);
  assert.match(shell, /PAGE_ALIASES/);
  assert.match(shell, /integridad: "integridad\.html"/);
  assert.match(shell, /visited-operator-pages-v1/);
  assert.match(shell, /last-operator-route/);
  assert.match(shell, /saleContext/);
  assert.match(shell, /voiceContext/);
  assert.match(shell, /Comprueba y respalda/);
  assert.match(state, /guided-onboarding-v2/);
  assert.doesNotMatch(state, /guided-onboarding-v1/);
});

test("operator home exposes resume and five-step readiness regions", async () => {
  const html = await text("operar.html");
  const app = await text("assets/js/operator/home.js");
  for (const id of ["resume-card", "resume-action", "readiness-count", "readiness-progress", "readiness-list"]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /id="readiness-count">0\/5/);
  assert.match(app, /buildOperatorReadiness/);
  assert.match(app, /materializePilotEntries/);
  assert.match(app, /integritySummary/);
  assert.match(app, /lastBackupAt/);
});

test("continuity scripts pass syntax checks and integrity assets are cached offline", async () => {
  for (const path of [
    "assets/js/core/config.js",
    "assets/js/core/storage.js",
    "assets/js/core/guided-shell.js",
    "assets/js/core/guided-shell-state.js",
    "assets/js/configurator/app.js",
    "assets/js/integrity/app.js",
    "assets/js/data/pilot-state.js",
    "assets/js/domain/backup.js",
    "assets/js/domain/data-integrity.js",
    "assets/js/domain/operator-guidance.js",
    "assets/js/domain/operator-readiness.js",
    "assets/js/domain/operator-tasks.js",
    "assets/js/operator/home.js",
    "sw.js",
  ]) {
    execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);
  }
  const storage = await text("assets/js/core/storage.js");
  const worker = await text("sw.js");
  const config = await text("assets/js/core/config.js");
  assert.match(storage, /export function snapshotStorage/);
  assert.match(storage, /export function replaceStorageSnapshot/);
  assert.match(worker, /crohnoz-fresh-market-v6/);
  assert.match(worker, /integridad\.html/);
  assert.match(worker, /assets\/js\/domain\/backup\.js/);
  assert.match(worker, /assets\/js\/domain\/data-integrity\.js/);
  assert.match(worker, /assets\/js\/data\/pilot-state\.js/);
  assert.match(worker, /assets\/js\/integrity\/app\.js/);
  assert.match(config, /0\.4\.0-pilot/);
});
