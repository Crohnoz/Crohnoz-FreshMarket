import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { OPERATOR_TASKS, operatorTaskSearch } from "../assets/js/domain/operator-tasks.js";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("daily close page exposes calculation, review and save regions", async () => {
  const html = await text("cierre.html");
  for (const id of [
    "close-date",
    "close-breakdown",
    "unclassified-list",
    "close-form",
    "close-assistant",
    "save-close",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test("operator home exposes close day as a searchable task", () => {
  const task = OPERATOR_TASKS.find((item) => item.id === "close-day");
  assert.ok(task);
  assert.equal(task.href, "cierre.html");
  assert.equal(operatorTaskSearch("cerrar caja").some((item) => item.id === "close-day"), true);
});

test("Netlify exposes the daily close alias", async () => {
  const netlify = await text("netlify.toml");
  assert.match(netlify, /from = "\/cierre"\s+to = "\/cierre\.html"/);
});

test("mobile operator navigation exposes daily work destinations", async () => {
  const state = await text("assets/js/core/guided-shell-state.js");
  for (const destination of ["operar.html", "ventas.html", "inventario.html", "cuentas.html", "cierre.html"]) {
    assert.match(state, new RegExp(destination.replace(".", "\\.")));
  }
  assert.match(state, /label: "Inventario"/);
  assert.match(state, /label: "Cierre"/);
});
