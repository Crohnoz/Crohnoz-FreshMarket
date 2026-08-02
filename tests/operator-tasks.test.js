import test from "node:test";
import assert from "node:assert/strict";

import {
  OPERATOR_TASKS,
  operatorTaskById,
  operatorTaskSearch,
  operatorTasksByGroup,
} from "../assets/js/domain/operator-tasks.js";

test("operator tasks have unique safe identifiers and local destinations", () => {
  const ids = OPERATOR_TASKS.map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length);

  for (const task of OPERATOR_TASKS) {
    assert.match(task.id, /^[a-z0-9-]+$/);
    assert.ok(task.title.length >= 4);
    assert.ok(task.description.length >= 20);
    assert.match(task.href, /^(admin|cuentas|scanner-lab|cierre)\.html/);
    assert.ok(!task.href.includes("javascript:"));
  }
});

test("tasks can be resolved by id and group", () => {
  assert.equal(operatorTaskById("payment")?.title, "Recibir abono");
  assert.equal(operatorTaskById("missing"), null);
  assert.ok(operatorTasksByGroup("credit").length >= 3);
});

test("task search supports everyday Spanish words", () => {
  assert.equal(operatorTaskSearch("abono")[0]?.id, "payment");
  assert.equal(operatorTaskSearch("hablar")[0]?.id, "voice");
  assert.equal(operatorTaskSearch("cerrar caja")[0]?.id, "close-day");
  assert.ok(operatorTaskSearch("").length === OPERATOR_TASKS.length);
});
