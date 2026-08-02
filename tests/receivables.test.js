import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReceivablesSummary,
  calculateLineTotal,
  calculateTransactionTotal,
  customerBalance,
  parseNotebookText,
} from "../assets/js/domain/receivables.js";

test("calcula líneas y total de una operación", () => {
  assert.equal(calculateLineTotal(5, 1490), 7450);
  assert.equal(calculateTransactionTotal([
    { quantity: 5, unitPrice: 1490 },
    { quantity: 2, unitPrice: 990 },
  ]), 9430);
});

test("calcula saldo con cargos y abonos", () => {
  const entries = [
    { customerId: "a", type: "charge", amount: 20000 },
    { customerId: "a", type: "payment", amount: 5000 },
  ];
  assert.equal(customerBalance(entries, "a"), 15000);
});

test("resume deuda bruta y concentración", () => {
  const customers = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
  const entries = [
    { customerId: "a", type: "charge", amount: 30000 },
    { customerId: "b", type: "charge", amount: 10000 },
  ];
  const summary = buildReceivablesSummary(customers, entries);
  assert.equal(summary.totalOutstanding, 40000);
  assert.equal(summary.debtorCount, 2);
  assert.equal(summary.topDebtor.name, "A");
});

test("extrae candidatos simples desde transcripción", () => {
  const result = parseNotebookText("Juan debe 15.000\nAna 8500\nLuis pagó 5.000\nsin monto");
  assert.equal(result[0].name, "Juan");
  assert.equal(result[0].amount, 15000);
  assert.equal(result[2].type, "payment");
  assert.equal(result[3].valid, false);
});
