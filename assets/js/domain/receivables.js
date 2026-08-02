function assertMoney(value, field = "monto") {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${field} debe ser un número mayor o igual a cero.`);
  }
  return Math.round(number);
}

export function calculateLineTotal(quantity, unitPrice) {
  const cleanQuantity = Number(quantity);
  if (!Number.isFinite(cleanQuantity) || cleanQuantity <= 0) {
    throw new TypeError("La cantidad debe ser mayor a cero.");
  }
  return Math.round(cleanQuantity * assertMoney(unitPrice, "precio unitario"));
}

export function calculateTransactionTotal(lines) {
  if (!Array.isArray(lines)) throw new TypeError("Las líneas deben ser una lista.");
  return lines.reduce(
    (total, line) => total + calculateLineTotal(line.quantity, line.unitPrice),
    0,
  );
}

export function customerBalance(entries, customerId) {
  return entries
    .filter((entry) => entry.customerId === customerId)
    .reduce((balance, entry) => {
      const amount = assertMoney(entry.amount);
      if (entry.type === "charge") return balance + amount;
      if (entry.type === "payment") return balance - amount;
      if (entry.type === "adjustment") return balance + Number(entry.signedAmount ?? 0);
      return balance;
    }, 0);
}

export function buildReceivablesSummary(customers, entries) {
  const balances = customers.map((customer) => ({
    ...customer,
    balance: Math.max(0, customerBalance(entries, customer.id)),
  }));
  const debtors = balances.filter((customer) => customer.balance > 0);
  const totalOutstanding = debtors.reduce((sum, customer) => sum + customer.balance, 0);
  const ordered = [...debtors].sort((a, b) => b.balance - a.balance);
  const topDebtor = ordered[0] ?? null;
  const topThree = ordered.slice(0, 3).reduce((sum, customer) => sum + customer.balance, 0);
  return {
    totalOutstanding,
    debtorCount: debtors.length,
    averageDebt: debtors.length ? Math.round(totalOutstanding / debtors.length) : 0,
    topDebtor,
    concentrationPercent: totalOutstanding ? Math.round((topThree / totalOutstanding) * 100) : 0,
    balances: ordered,
  };
}

export function parseNotebookText(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((raw, index) => ({ raw: raw.trim(), index }))
    .filter(({ raw }) => raw && !raw.startsWith("#"))
    .map(({ raw, index }) => {
      const amounts = [...raw.matchAll(/\$?\s*(\d{1,3}(?:[.\s]\d{3})+|\d{3,})/g)];
      const last = amounts.at(-1);
      if (!last) {
        return { line: index + 1, raw, valid: false, reason: "No se encontró un monto claro." };
      }
      const amount = Number(last[1].replace(/[.\s]/g, ""));
      const before = raw.slice(0, last.index).replace(/[-–:;,]+$/g, "").trim();
      const type = /(pagó|pago|abono|canceló|cancelo)/i.test(raw) ? "payment" : "charge";
      const name = before
        .replace(/(debe|fiado|pagó|pago|abono|canceló|cancelo)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const confidence = name.length >= 3 && amount > 0 ? "medium" : "low";
      return {
        line: index + 1,
        raw,
        valid: Boolean(name && amount > 0),
        name: name || "Sin identificar",
        amount,
        type,
        confidence,
      };
    });
}

export function createAssistantReport(customers, entries) {
  const summary = buildReceivablesSummary(customers, entries);
  if (!summary.totalOutstanding) {
    return {
      headline: "No hay deuda pendiente registrada.",
      observations: ["El libro digital está al día."],
    };
  }
  const observations = [
    `${summary.debtorCount} personas mantienen saldo pendiente.`,
    `La deuda promedio es de ${summary.averageDebt} pesos.`,
  ];
  if (summary.topDebtor) {
    observations.push(`${summary.topDebtor.name} concentra el mayor saldo registrado.`);
  }
  if (summary.concentrationPercent >= 60) {
    observations.push(`Los tres saldos más altos representan ${summary.concentrationPercent}% de la deuda; conviene revisarlos primero.`);
  }
  return {
    headline: `Hay ${summary.totalOutstanding} pesos pendientes de cobro.`,
    observations,
  };
}
