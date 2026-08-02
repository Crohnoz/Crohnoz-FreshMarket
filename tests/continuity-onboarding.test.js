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

test("checksummed backups round-trip and reject invalid input", () => {
  const entries = { business: { name: "Mercado" }, orders: [{ id: "FM-1" }, { id: "FM-2" }] };
  const envelope = createBackupEnvelope(entries, {
    namespace: "crohnoz-fresh-market",
    appVersion: "0.5.0-pilot",
    exportedAt: "2026-08-02T19:00:00.000Z",
  });
  const restored = parseBackupText(serializeBackup(envelope), { expectedNamespace: "crohnoz-fresh-market" });
  assert.equal(restored.format, BACKUP_FORMAT);
  assert.equal(restored.version, BACKUP_VERSION);
  assert.equal(restored.checksum, computeBackupChecksum(entries));
  assert.equal(restored.integrity.verified, true);
  assert.deepEqual(restored.entries, entries);
  assert.deepEqual(summarizeBackupEntries(entries), { collections: 2, estimatedRecords: 3, bytes: JSON.stringify(entries).length });
  assert.throws(() => parseBackupText("x".repeat(2_000_001)), /máximo de 2 MB/);
  const foreign = createBackupEnvelope({ business: {} }, { namespace: "another-product", exportedAt: "2026-08-02T19:00:00.000Z" });
  assert.throws(() => parseBackupText(JSON.stringify(foreign), { expectedNamespace: "crohnoz-fresh-market" }), /otro espacio de datos/);
});

test("backup naming and recommendation remain stable", () => {
  assert.equal(buildBackupFilename("Mercado La Cosecha", new Date(2026, 7, 2)), "mercado-la-cosecha-respaldo-2026-08-02.json");
  assert.equal(shouldRecommendBackup({ activityCount: 4, lastBackupAt: null }), false);
  assert.equal(shouldRecommendBackup({ activityCount: 5, lastBackupAt: null }), true);
  assert.equal(shouldRecommendBackup({ activityCount: 8, lastBackupAt: "2026-07-30T10:00:00.000Z", now: new Date("2026-08-02T10:00:00.000Z") }), false);
});

test("urgent work still outranks continuity", () => {
  const now = new Date(2026, 7, 2, 15, 0, 0);
  assert.equal(chooseOperatorRecommendation({ activityCount: 7, lastBackupAt: null, now }).taskId, "backup");
  assert.equal(chooseOperatorRecommendation({ orders: [{ status: "pending_weighing" }], activityCount: 7, lastBackupAt: null, now }).taskId, "prepare");
  assert.equal(chooseOperatorRecommendation({ inventorySummary: { criticalLots: 1 }, activityCount: 7, lastBackupAt: null, now }).taskId, "inventory");
});

test("readiness and resume targets preserve operator safety", () => {
  const defaults = { name: "Mercado", tagline: "Fresco", whatsapp: "", primaryColor: "#000", accentColor: "#fff", deliveryFee: 0, tolerancePercent: 5, maxExtraAmount: 1000 };
  assert.equal(buildOperatorReadiness({ business: defaults, defaultBusiness: defaults }).total, 5);
  const ready = buildOperatorReadiness({
    business: { ...defaults, name: "Mi negocio" },
    defaultBusiness: defaults,
    visitedPages: ["inventario.html", "ventas.html"],
    continuityMeta: { lastBackupAt: "2026-08-02T19:00:00.000Z" },
    integrityMeta: { lastScanAt: "2026-08-02T18:55:00.000Z", status: "healthy" },
  });
  assert.equal(ready.percent, 100);
  assert.equal(normalizeResumeTarget({ href: "integridad.html", label: "Integridad" })?.href, "integridad.html");
  assert.equal(normalizeResumeTarget({ href: "https://example.com", label: "Fuera" }), null);
});

test("configuration, onboarding and operator home expose continuity controls", async () => {
  const configurator = await text("configurador.html");
  const shell = await text("assets/js/core/guided-shell.js");
  const state = await text("assets/js/core/guided-shell-state.js");
  const home = await text("operar.html");
  for (const id of ["continuidad", "export-backup", "backup-file", "backup-preview", "backup-preview-integrity", "import-backup", "reset-demo"]) {
    assert.match(configurator, new RegExp(`id=["']${id}["']`));
  }
  assert.match(configurator, /checksum/);
  assert.match(shell, /guided-onboarding-v2/);
  assert.match(shell, /Comprueba y respalda/);
  assert.match(state, /guided-onboarding-v2/);
  assert.doesNotMatch(state, /guided-onboarding-v1/);
  assert.match(home, /id="readiness-count">0\/5/);
});

test("continuity and audit scripts pass syntax checks and cache v7", async () => {
  for (const path of [
    "assets/js/core/config.js",
    "assets/js/core/storage.js",
    "assets/js/core/storage-audit.js",
    "assets/js/configurator/app.js",
    "assets/js/integrity/app.js",
    "assets/js/audit/app.js",
    "assets/js/data/pilot-state.js",
    "assets/js/domain/backup.js",
    "assets/js/domain/audit-trail.js",
    "assets/js/domain/data-integrity.js",
    "assets/js/operator/home.js",
    "sw.js",
  ]) execFileSync(process.execPath, ["--check", fileURLToPath(new URL(`../${path}`, import.meta.url))]);

  const storage = await text("assets/js/core/storage.js");
  const worker = await text("sw.js");
  const config = await text("assets/js/core/config.js");
  assert.match(storage, /recordStorageMutation/);
  assert.match(storage, /recordSnapshotRestore/);
  assert.match(worker, /crohnoz-fresh-market-v7/);
  assert.match(worker, /auditoria\.html/);
  assert.match(worker, /assets\/js\/domain\/audit-trail\.js/);
  assert.match(worker, /assets\/js\/core\/storage-audit\.js/);
  assert.match(config, /0\.5\.0-pilot/);
});
