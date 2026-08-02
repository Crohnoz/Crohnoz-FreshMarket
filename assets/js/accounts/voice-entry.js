import { formatCLP } from "../core/format.js";
import { readStorage } from "../core/storage.js";
import { initialCustomers, initialLedgerEntries } from "../data/receivables-demo.js";
import { buildReceivablesSummary } from "../domain/receivables.js";
import { mountVoiceCopilot } from "./voice-copilot.js";

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .trim();
}

function findCustomerOption(name) {
  const target = normalizeName(name);
  const options = [...document.querySelector("#ledger-customer").options];
  return options.find((option) => normalizeName(option.textContent) === target)
    ?? options.find((option) => normalizeName(option.textContent).includes(target));
}

function createCustomerThroughForm(name) {
  const form = document.querySelector("#customer-form");
  form.name.value = name;
  form.phone.value = "";
  form.notes.value = "Creado mediante copiloto por voz";
  form.requestSubmit();
  return findCustomerOption(name);
}

function applyLedgerProposal(proposal) {
  const { customerName, amount, description } = proposal.data;
  if (!customerName || !amount) throw new Error("Falta confirmar la persona o el monto.");
  const option = findCustomerOption(customerName) ?? createCustomerThroughForm(customerName);
  if (!option) throw new Error("No pude crear o identificar la cuenta.");

  const form = document.querySelector("#ledger-form");
  form.customerId.value = option.value;
  form.type.value = proposal.intent === "payment" ? "payment" : "charge";
  form.amount.value = amount;
  form.description.value = description;
  form.requestSubmit();

  return proposal.intent === "payment"
    ? `Registré un abono de ${formatCLP(amount)} para ${option.textContent}.`
    : `Registré un fiado de ${formatCLP(amount)} para ${option.textContent}.`;
}

function applyTransactionLine(proposal) {
  const { type, product, quantity, unitPrice, unit } = proposal.data;
  const form = document.querySelector("#transaction-form");
  form.type.value = type;
  const row = document.querySelector(".transaction-line");
  if (!row) throw new Error("No encontré una línea de operación disponible.");
  row.querySelector("[name=product]").value = product;
  row.querySelector("[name=quantity]").value = quantity;
  row.querySelector("[name=unitPrice]").value = unitPrice;
  row.querySelectorAll("input").forEach((input) => input.dispatchEvent(new Event("input", { bubbles: true })));
  form.counterparty.focus();
  return `Agregué ${quantity} ${unit} de ${product} a ${formatCLP(unitPrice)}. Falta indicar la contraparte y confirmar la operación.`;
}

function currentSummary() {
  const customers = readStorage("credit-customers", initialCustomers);
  const entries = readStorage("credit-ledger", initialLedgerEntries);
  return buildReceivablesSummary(customers, entries);
}

function answerQuery(intent) {
  const summary = currentSummary();
  if (intent === "query_total_debt") {
    return summary.totalOutstanding
      ? `En total te deben ${formatCLP(summary.totalOutstanding)} entre ${summary.debtorCount} personas.`
      : "No hay deuda pendiente registrada.";
  }
  if (intent === "query_top_debtor") {
    return summary.topDebtor
      ? `${summary.topDebtor.name} tiene el saldo más alto: ${formatCLP(summary.topDebtor.balance)}.`
      : "No hay personas con deuda pendiente.";
  }
  if (intent === "read_pending_accounts") {
    if (!summary.balances.length) return "No hay cuentas pendientes.";
    const top = summary.balances.slice(0, 5)
      .map((customer) => `${customer.name}, ${formatCLP(customer.balance)}`)
      .join("; ");
    return `Las principales cuentas pendientes son: ${top}.`;
  }
  return "No encontré una respuesta para esa consulta.";
}

mountVoiceCopilot({
  async onApply(proposal) {
    if (proposal.intent === "charge" || proposal.intent === "payment") {
      return applyLedgerProposal(proposal);
    }
    if (proposal.intent === "transaction_line") {
      return applyTransactionLine(proposal);
    }
    throw new Error("La acción todavía no está disponible.");
  },
  onQuery: answerQuery,
});
