import { readStorage, writeStorage } from "../core/storage.js";
import { initialLedgerEntries } from "../data/receivables-demo.js";

function mountSettlementField() {
  const form = document.querySelector("#ledger-form");
  if (!form || form.querySelector("[name=settlement]")) return;

  const label = document.createElement("label");
  label.id = "ledger-settlement-label";
  label.innerHTML = `Medio del abono
    <select name="settlement">
      <option value="cash">Efectivo</option>
      <option value="transfer">Transferencia</option>
    </select>`;
  const grid = form.querySelector(".form-grid");
  grid?.insertAdjacentElement("afterend", label);

  const type = form.querySelector("[name=type]");
  const settlement = form.querySelector("[name=settlement]");
  let submissionContext = null;

  function synchronize() {
    const isPayment = type.value === "payment";
    label.hidden = !isPayment;
    settlement.required = isPayment;
  }

  type.addEventListener("change", synchronize);
  form.addEventListener("reset", () => window.setTimeout(synchronize, 0));

  form.addEventListener("submit", () => {
    const entries = readStorage("credit-ledger", initialLedgerEntries);
    submissionContext = {
      knownIds: new Set(entries.map((entry) => entry.id)),
      type: type.value,
      settlement: settlement.value,
    };
  }, true);

  form.addEventListener("submit", () => {
    queueMicrotask(() => {
      if (!submissionContext) return;
      const entries = readStorage("credit-ledger", initialLedgerEntries);
      const created = [...entries].reverse().find((entry) => !submissionContext.knownIds.has(entry.id));
      if (!created) return;
      created.settlement = submissionContext.type === "payment"
        ? submissionContext.settlement
        : "credit";
      writeStorage("credit-ledger", entries);
      submissionContext = null;
    });
  });

  synchronize();
}

mountSettlementField();
