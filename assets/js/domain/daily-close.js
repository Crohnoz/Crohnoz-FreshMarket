function money(value, field = "monto") {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${field} debe ser un número mayor o igual a cero.`);
  }
  return Math.round(number);
}

function settlementKey(value) {
  return ["cash", "transfer", "credit"].includes(value) ? value : "unknown";
}

export function localDateKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function isOnBusinessDate(value, dateKey) {
  return Boolean(value) && localDateKey(value) === dateKey;
}

export function summarizeDailyOperations({
  transactions = [],
  ledgerEntries = [],
  waste = [],
  dateKey = localDateKey(),
} = {}) {
  const dayTransactions = transactions.filter((item) => isOnBusinessDate(item.createdAt, dateKey));
  const dayLedgerEntries = ledgerEntries.filter((item) => isOnBusinessDate(item.occurredAt, dateKey));
  const dayWaste = waste.filter((item) => isOnBusinessDate(item.createdAt, dateKey));
  const transactionReferences = new Set(
    dayTransactions.flatMap((transaction) => [transaction.id, transaction.referenceId].filter(Boolean)),
  );
  const isLedgerEntryLinkedToTransaction = (entry) => (
    entry.source === "daily-transaction"
    || Boolean(entry.referenceId && transactionReferences.has(entry.referenceId))
  );

  const sales = { cash: 0, transfer: 0, credit: 0, unknown: 0, total: 0, count: 0 };
  const purchases = { cash: 0, transfer: 0, credit: 0, unknown: 0, total: 0, count: 0 };

  dayTransactions.forEach((transaction) => {
    const target = transaction.type === "purchase" ? purchases : sales;
    const amount = money(transaction.total ?? 0);
    const settlement = settlementKey(transaction.settlement);
    target[settlement] += amount;
    target.total += amount;
    target.count += 1;
  });

  const payments = { cash: 0, transfer: 0, unknown: 0, total: 0, count: 0 };
  let manualCreditCharges = 0;
  let manualCreditChargeCount = 0;

  dayLedgerEntries.forEach((entry) => {
    const amount = money(entry.amount ?? 0);
    if (entry.type === "payment") {
      const settlement = ["cash", "transfer"].includes(entry.settlement)
        ? entry.settlement
        : "unknown";
      payments[settlement] += amount;
      payments.total += amount;
      payments.count += 1;
    }
    if (entry.type === "charge" && !isLedgerEntryLinkedToTransaction(entry)) {
      manualCreditCharges += amount;
      manualCreditChargeCount += 1;
    }
  });

  const wasteSummary = dayWaste.reduce((summary, item) => {
    const quantity = Number(item.quantity ?? 0);
    const value = item.estimatedCost != null
      ? money(item.estimatedCost)
      : Math.round(Math.max(0, quantity) * Math.max(0, Number(item.unitCost ?? 0)));
    summary.quantity += Number.isFinite(quantity) ? Math.max(0, quantity) : 0;
    summary.estimatedCost += value;
    summary.count += 1;
    return summary;
  }, { quantity: 0, estimatedCost: 0, count: 0 });

  const independentLedgerEntries = dayLedgerEntries.filter((entry) => !isLedgerEntryLinkedToTransaction(entry));
  const creditGenerated = sales.credit + manualCreditCharges;
  const movementCount = dayTransactions.length + independentLedgerEntries.length + dayWaste.length;

  return {
    dateKey,
    sales,
    purchases,
    payments,
    creditGenerated,
    manualCreditCharges,
    manualCreditChargeCount,
    waste: wasteSummary,
    movementCount,
    unclassifiedCount: (sales.unknown ? 1 : 0)
      + (purchases.unknown ? 1 : 0)
      + dayLedgerEntries.filter((entry) => entry.type === "payment" && !["cash", "transfer"].includes(entry.settlement)).length,
    unclassifiedPayments: dayLedgerEntries.filter((entry) => entry.type === "payment" && !["cash", "transfer"].includes(entry.settlement)),
    transactionCount: dayTransactions.length,
    ledgerMovementCount: independentLedgerEntries.length,
  };
}

export function buildCashReconciliation({
  summary,
  openingCash = 0,
  countedCash = null,
  otherCashIn = 0,
  cashExpenses = 0,
  cashWithdrawals = 0,
  tolerance = 100,
} = {}) {
  if (!summary) throw new TypeError("Se requiere el resumen del día.");
  const opening = money(openingCash, "caja inicial");
  const otherIn = money(otherCashIn, "otros ingresos");
  const expenses = money(cashExpenses, "gastos en efectivo");
  const withdrawals = money(cashWithdrawals, "retiros de caja");
  const expectedCash = opening
    + money(summary.sales.cash)
    + money(summary.payments.cash)
    + otherIn
    - money(summary.purchases.cash)
    - expenses
    - withdrawals;

  const hasCountedCash = countedCash !== null
    && countedCash !== ""
    && Number.isFinite(Number(countedCash))
    && Number(countedCash) >= 0;
  const counted = hasCountedCash ? money(countedCash, "efectivo contado") : null;
  const difference = counted === null ? null : counted - expectedCash;
  const absoluteDifference = difference === null ? null : Math.abs(difference);
  const status = difference === null
    ? "pending_count"
    : absoluteDifference <= money(tolerance, "tolerancia")
      ? "balanced"
      : "review";

  return {
    openingCash: opening,
    otherCashIn: otherIn,
    cashExpenses: expenses,
    cashWithdrawals: withdrawals,
    expectedCash,
    countedCash: counted,
    difference,
    absoluteDifference,
    status,
  };
}

export function createDailyCloseAssistant(summary, reconciliation) {
  const observations = [
    `Las ventas registradas suman ${summary.sales.total} pesos.`,
    `En efectivo entraron ${summary.sales.cash + summary.payments.cash} pesos por ventas y abonos.`,
  ];
  const warnings = [];

  if (summary.sales.transfer || summary.payments.transfer) {
    observations.push(`Por transferencia se registraron ${summary.sales.transfer + summary.payments.transfer} pesos.`);
  }
  if (summary.creditGenerated) {
    observations.push(`Durante el día se generaron ${summary.creditGenerated} pesos en nuevas cuentas por cobrar.`);
  }
  if (summary.purchases.total) {
    observations.push(`Las compras registradas suman ${summary.purchases.total} pesos.`);
  }
  if (summary.waste.count) {
    observations.push(`Se registraron ${summary.waste.quantity.toFixed(2)} kilos de merma.`);
  }
  if (summary.unclassifiedPayments.length) {
    warnings.push(`${summary.unclassifiedPayments.length} abono(s) no tienen medio de pago y deben clasificarse.`);
  }
  if (reconciliation.status === "pending_count") {
    warnings.push("Falta ingresar el efectivo contado al final del día.");
  }
  if (reconciliation.status === "review") {
    warnings.push(`La caja presenta una diferencia de ${Math.abs(reconciliation.difference)} pesos.`);
  }

  const headline = reconciliation.status === "balanced"
    ? "La caja está dentro de la tolerancia definida."
    : reconciliation.status === "review"
      ? "La caja necesita revisión antes de cerrar."
      : "El cierre está preparado, pero todavía falta contar la caja.";

  return { headline, observations, warnings };
}

export function canSaveDailyClose({ summary, reconciliation, checklist = {} } = {}) {
  return Boolean(
    summary
    && reconciliation?.countedCash !== null
    && summary.unclassifiedPayments.length === 0
    && checklist.salesRecorded
    && checklist.expensesRecorded
    && checklist.cashCounted,
  );
}
