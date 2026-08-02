import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("account movements offer cash and transfer for payments", async () => {
  const app = await text("assets/js/accounts/app.js");
  assert.match(app, /value="cash">Efectivo/);
  assert.match(app, /value="transfer">Transferencia/);
  assert.match(app, /settlement: form\.type\.value === "payment"/);
});

test("credit sales and notebook imports receive explicit classification", async () => {
  const app = await text("assets/js/accounts/app.js");
  assert.match(app, /settlement: "credit"/);
  assert.match(app, /candidate\.type === "payment" \? "unknown" : "credit"/);
});
