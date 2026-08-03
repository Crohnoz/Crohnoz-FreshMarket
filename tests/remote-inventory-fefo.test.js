import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("remote inventory UI identifies FEFO and blocks later consumption", async () => {
  const app = await text("assets/js/remote-inventory/app.js");
  assert.match(app, /function compareFefoLots/);
  assert.match(app, /function fefoLotForProduct/);
  assert.match(app, /quality !== "damaged"/);
  assert.match(app, /laterThanFefo/);
  assert.match(app, /FEFO primero/);
  assert.match(app, /movementButton\.disabled/);
});

test("successful remote writes force a server refresh while preserving retry safety", async () => {
  const app = await text("assets/js/remote-inventory/app.js");
  const forcedRefreshes = app.match(/loadRemoteData\(\{ quiet: true, force: true \}\)/g) ?? [];
  assert.equal(forcedRefreshes.length, 2);
  assert.match(app, /\(loading && !force\)/);
  assert.match(app, /activeReceptionKey = newRequestKey/);
  assert.match(app, /activeMovementKey = newRequestKey/);
  assert.match(app, /La clave de reintento se conserva/);
  execFileSync(process.execPath, ["--check", fileURLToPath(new URL("../assets/js/remote-inventory/app.js", import.meta.url))]);
});