import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("ledger settlement enhancement offers cash and transfer", async () => {
  const module = await text("assets/js/accounts/ledger-settlement.js");
  assert.match(module, /value="cash">Efectivo/);
  assert.match(module, /value="transfer">Transferencia/);
  assert.match(module, /created\.settlement/);
});

test("guided shell mounts the ledger settlement enhancement on accounts", async () => {
  const state = await text("assets/js/core/guided-shell-state.js");
  assert.match(state, /import\("\.\.\/accounts\/ledger-settlement\.js"\)/);
});
