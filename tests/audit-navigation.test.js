import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeResumeTarget } from "../assets/js/domain/operator-readiness.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("audit workspace is a safe resumable operator route", () => {
  assert.deepEqual(normalizeResumeTarget({
    href: "auditoria.html",
    label: "Auditoría y trazabilidad",
    visitedAt: "2026-08-02T22:00:00.000Z",
  }), {
    href: "auditoria.html",
    label: "Auditoría y trazabilidad",
    visitedAt: "2026-08-02T22:00:00.000Z",
  });
});

test("audit page exposes mobile navigation and records last route", async () => {
  const html = await text("auditoria.html");
  const navigation = await text("assets/js/audit/navigation.js");
  const shellState = await text("assets/js/core/guided-shell-state.js");
  const worker = await text("sw.js");
  assert.match(html, /operator-bottom-nav/);
  assert.match(html, /assets\/js\/audit\/navigation\.js/);
  assert.match(navigation, /last-operator-route/);
  assert.match(navigation, /auditoria\.html/);
  assert.match(shellState, /auditoria: "auditoria\.html"/);
  assert.match(worker, /assets\/js\/audit\/navigation\.js/);
});

test("audit navigation script passes syntax validation", () => {
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("../assets/js/audit/navigation.js", import.meta.url))]);
});
