import test from "node:test";
import assert from "node:assert/strict";
import { OPERATOR_TASKS, operatorTaskById, operatorTaskSearch, operatorTasksByGroup } from "../assets/js/domain/operator-tasks.js";

test("operator tasks have unique safe identifiers and local destinations", () => {
  const ids = OPERATOR_TASKS.map((task) => task.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const task of OPERATOR_TASKS) {
    assert.match(task.id, /^[a-z0-9-]+$/);
    assert.ok(task.title.length >= 4);
    assert.ok(task.description.length >= 20);
    assert.match(task.href, /^(admin|cuentas|scanner-lab|cierre|inventario|inventario-remoto|compras|ventas|pedidos-remotos|asistente|validacion|configurador|integridad|auditoria|conexion)\.html/);
    assert.ok(!task.href.includes("javascript:"));
  }
});

test("tasks can be resolved by id and group", () => {
  assert.equal(operatorTaskById("payment")?.title, "Recibir abono");
  assert.equal(operatorTaskById("inventory")?.href, "inventario.html");
  assert.equal(operatorTaskById("backup")?.href, "configurador.html#continuidad");
  assert.equal(operatorTaskById("integrity")?.href, "integridad.html");
  assert.equal(operatorTaskById("audit")?.href, "auditoria.html");
  assert.equal(operatorTaskById("connect-backend")?.href, "conexion.html");
  assert.equal(operatorTaskById("remote-orders")?.href, "pedidos-remotos.html");
  assert.equal(operatorTaskById("remote-inventory")?.href, "inventario-remoto.html");
  assert.equal(operatorTaskById("missing"), null);
  assert.ok(operatorTasksByGroup("credit").length >= 3);
});

test("task search supports everyday Spanish words", () => {
  assert.equal(operatorTaskSearch("abono")[0]?.id, "payment");
  assert.equal(operatorTaskSearch("cerrar caja")[0]?.id, "close-day");
  assert.equal(operatorTaskSearch("vender primero")[0]?.id, "inventory");
  assert.equal(operatorTaskSearch("probar piloto")[0]?.id, "validate-pilot");
  assert.equal(operatorTaskSearch("guardar copia")[0]?.id, "backup");
  assert.equal(operatorTaskSearch("referencias duplicadas")[0]?.id, "integrity");
  assert.equal(operatorTaskSearch("historial cambios")[0]?.id, "audit");
  assert.equal(operatorTaskSearch("login django")[0]?.id, "connect-backend");
  assert.equal(operatorTaskSearch("pedido remoto")[0]?.id, "remote-orders");
  assert.equal(operatorTaskSearch("recepcion lote")[0]?.id, "remote-inventory");
  assert.ok(operatorTaskSearch("").length === OPERATOR_TASKS.length);
});
