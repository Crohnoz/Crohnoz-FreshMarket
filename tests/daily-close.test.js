import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCashReconciliation,
  canSaveDailyClose,
  createDailyCloseAssistant,
  formatWasteQuantities,
  localDateKey,
  summarizeDailyOperations,
} from "../assets/js/domain/daily-close.js";

const dateKey = "2026-08-02";

function sampleSummary() {
  return summarizeDailyOperations({
    dateKey,
    transactions: [
      { type: "sale", settlement: "cash", total: 18000, createdAt: "2026-08-02T12:00:00" },
      { type: "sale", settlement: "transfer", total: 9000, createdAt: "2026-08-02T13:00:00" },
      { type: "sale", settlement: "credit", total: 7000, createdAt: "2026-08-02T14:00:00" },
      { type: "purchase", settlement: "cash", total: 5000, createdAt: "2026-08-02T15:00:00" },
    ],
    ledgerEntries: [
      { type: "charge", amount: 7000, source: "daily-transaction", occurredAt: dateKey },
      { type: "charge", amount: 3000, source: "manual", occurredAt: dateKey },
      { type: "payment", amount: 4000, settlement: "cash", occurredAt: dateKey },
      { type: "payment", amount: 2500, settlement: "transfer", occurredAt: dateKey },
    ],
    waste: [{ quantity: 1.5, unitCost: 800, createdAt: "2026-08-02T18:00:00" }],
  });
}

test("usa fecha local estable para cadenas de fecha y Date", () => {
  assert.equal(localDateKey("2026-08-02"), "2026-08-02");
  assert.equal(localDateKey(new Date(2026, 7, 2, 10, 0, 0)), "2026-08-02");
});

test("separa efectivo, transferencias, fiados y compras", () => {
  const summary = sampleSummary();
  assert.equal(summary.sales.cash, 18000);
  assert.equal(summary.sales.transfer, 9000);
  assert.equal(summary.sales.credit, 7000);
  assert.equal(summary.purchases.cash, 5000);
  assert.equal(summary.payments.cash, 4000);
  assert.equal(summary.payments.transfer, 2500);
  assert.equal(summary.creditGenerated, 10000);
  assert.equal(summary.waste.estimatedCost, 1200);
});

test("conserva unidades distintas en la merma", () => {
  const summary = summarizeDailyOperations({
    dateKey,
    waste: [
      { quantity: 1.25, unit: "kg", unitCost: 1000, createdAt: `${dateKey}T12:00:00` },
      { quantity: 2, unit: "unit", unitCost: 700, createdAt: `${dateKey}T13:00:00` },
    ],
  });
  assert.deepEqual(summary.waste.quantities, { kg: 1.25, unidad: 2 });
  assert.equal(summary.waste.description, "1,25 kg · 2 unidades");
  assert.equal(formatWasteQuantities(summary.waste), "1,25 kg · 2 unidades");
  assert.equal(summary.waste.estimatedCost, 2650);
});

test("no duplica la venta fiada vinculada al libro de cuentas", () => {
  const summary = sampleSummary();
  assert.equal(summary.manualCreditCharges, 3000);
  assert.equal(summary.creditGenerated, 10000);
});

test("no duplica un fiado de pedido enlazado por referencia", () => {
  const summary = summarizeDailyOperations({
    dateKey,
    transactions: [{
      id: "tx-order-1",
      referenceId: "payment-1",
      type: "sale",
      settlement: "credit",
      total: 7500,
      createdAt: "2026-08-02T17:00:00-04:00",
    }],
    ledgerEntries: [{
      id: "ledger-order-1",
      referenceId: "payment-1",
      source: "order-payment",
      type: "charge",
      settlement: "credit",
      amount: 7500,
      occurredAt: dateKey,
    }],
  });
  assert.equal(summary.sales.credit, 7500);
  assert.equal(summary.manualCreditCharges, 0);
  assert.equal(summary.creditGenerated, 7500);
  assert.equal(summary.movementCount, 1);
});

test("calcula efectivo esperado y diferencia", () => {
  const summary = sampleSummary();
  const result = buildCashReconciliation({
    summary,
    openingCash: 20000,
    countedCash: 35500,
    cashExpenses: 1000,
    cashWithdrawals: 500,
  });
  assert.equal(result.expectedCash, 35500);
  assert.equal(result.difference, 0);
  assert.equal(result.status, "balanced");
});

test("bloquea el cierre si existen abonos sin clasificar", () => {
  const summary = summarizeDailyOperations({
    dateKey,
    ledgerEntries: [{ type: "payment", amount: 5000, occurredAt: dateKey }],
  });
  const reconciliation = buildCashReconciliation({ summary, countedCash: 0 });
  assert.equal(canSaveDailyClose({
    summary,
    reconciliation,
    checklist: { salesRecorded: true, expensesRecorded: true, cashCounted: true },
  }), false);
});

test("genera advertencia cuando la caja no cuadra", () => {
  const summary = sampleSummary();
  const reconciliation = buildCashReconciliation({ summary, countedCash: 1000 });
  const report = createDailyCloseAssistant(summary, reconciliation);
  assert.equal(reconciliation.status, "review");
  assert.match(report.headline, /revisión/i);
  assert.ok(report.warnings.some((item) => item.includes("diferencia")));
});
