import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
import { formatCLP } from "../core/format.js";
import { readStorage, writeStorage } from "../core/storage.js";
import { initialCustomers, initialLedgerEntries } from "../data/receivables-demo.js";
import { initialAssistantProposals, initialInventoryLots, initialPurchases } from "../data/operations-demo.js";
import { parseNotebookText } from "../domain/receivables.js";
import { buildOperationalContext, createReviewedProposal, interpretOperationalQuestion, reviewProposal } from "../domain/structured-assistance.js";
import { createSpeechController, speakText } from "./speech.js";

const business = readStorage("business", DEFAULT_BUSINESS);
let customers = readStorage("credit-customers", initialCustomers);
let ledger = readStorage("credit-ledger", initialLedgerEntries);
const lots = readStorage("inventory-lots", initialInventoryLots);
const closes = readStorage("daily-closes", []);
const purchases = readStorage("purchase-orders", initialPurchases);
let proposals = readStorage("assistant-proposals", initialAssistantProposals);
let context = buildOperationalContext({ lots, customers, ledgerEntries: ledger, closes, purchases });
let lastAnswer = "";
let previewUrl = null;

function localDateKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function refreshContext() {
  context = buildOperationalContext({ lots, customers, ledgerEntries: ledger, closes, purchases });
}

function renderContext() {
  document.querySelector("#assistant-context-inventory").textContent = context.inventoryPriority[0]?.productName ?? "Sin alertas";
  document.querySelector("#assistant-context-debt").textContent = formatCLP(context.receivables.totalOutstanding);
  document.querySelector("#assistant-context-close").textContent = context.lastClose?.dateKey ?? "Sin cierre";
  document.querySelector("#assistant-context-purchase").textContent = context.lastPurchase?.supplierName ?? "Sin compras";
}

function answer(text) {
  const result = interpretOperationalQuestion(text, context);
  lastAnswer = result.answer;
  const container = document.querySelector("#assistant-answer");
  container.innerHTML = `<strong></strong><p></p><small></small>`;
  container.querySelector("strong").textContent = `${Math.round(result.confidence * 100)}% de confianza`;
  container.querySelector("p").textContent = result.answer;
  container.querySelector("small").textContent = result.evidence?.length
    ? `Evidencia local: ${result.evidence.join(", ")}`
    : "Sin evidencia suficiente para ejecutar acciones.";
  const save = document.querySelector("#save-assistant-answer");
  save.disabled = result.intent === "unknown";
  save.dataset.intent = result.intent;
  save.dataset.confidence = result.confidence;
  return result;
}

function findOrCreateCustomer(name) {
  const normalized = String(name ?? "").toLocaleLowerCase("es").trim();
  if (!normalized) throw new Error("La propuesta no tiene un nombre de cliente válido.");
  let customer = customers.find((item) => item.name.toLocaleLowerCase("es").trim() === normalized);
  if (!customer) {
    customer = { id: crypto.randomUUID(), name: String(name).trim(), phone: "", notes: "Creado desde revisión asistida", creditLimit: 0 };
    customers.push(customer);
  }
  return customer;
}

function proposalStatusLabel(status) {
  return ({ pending_review: "Pendiente", approved: "Aprobada", rejected: "Rechazada" })[status] ?? status;
}

function proposalSummary(proposal) {
  if (proposal.intent === "charge") return `Nuevo fiado para ${proposal.data.name ?? "persona sin nombre"}: ${formatCLP(proposal.data.amount)}`;
  if (proposal.intent === "payment") return `Abono de ${proposal.data.name ?? "persona sin nombre"}: ${formatCLP(proposal.data.amount)}`;
  if (proposal.data?.answer) return proposal.data.answer;
  return proposal.sourceText || "Propuesta sin detalle";
}

function applyApprovedProposal(proposal) {
  if (!["charge", "payment"].includes(proposal.intent)) return;
  const amount = Math.round(Number(proposal.data.amount));
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("La propuesta no tiene un monto válido.");
  const settlement = proposal.intent === "charge" ? "credit" : proposal.data.settlement;
  if (proposal.intent === "payment" && !["cash", "transfer"].includes(settlement)) {
    throw new Error("Debes elegir si el abono fue en efectivo o transferencia.");
  }
  const customer = findOrCreateCustomer(proposal.data.name);
  ledger.push({
    id: crypto.randomUUID(),
    customerId: customer.id,
    type: proposal.intent,
    amount,
    settlement,
    description: "Revisado desde asistente",
    occurredAt: localDateKey(),
    source: "assistant-review",
    referenceId: proposal.id,
  });
  writeStorage("credit-customers", customers);
  writeStorage("credit-ledger", ledger);
  refreshContext();
  renderContext();
}

function renderProposals() {
  const container = document.querySelector("#assistant-proposals");
  container.replaceChildren();
  if (!proposals.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "No hay propuestas pendientes. Puedes analizar una transcripción o guardar una respuesta para revisión.";
    container.append(empty);
    return;
  }

  [...proposals].reverse().forEach((proposal) => {
    const pending = proposal.status === "pending_review";
    const actionable = ["charge", "payment"].includes(proposal.intent);
    const row = document.createElement("article");
    row.className = `assistant-proposal proposal-${proposal.status}`;
    row.innerHTML = `<div><span></span><strong></strong><small></small></div><div class="proposal-actions"></div>`;
    row.querySelector("span").textContent = `${Math.round(proposal.confidence * 100)}% · ${proposalStatusLabel(proposal.status)}`;
    row.querySelector("strong").textContent = proposalSummary(proposal);
    row.querySelector("small").textContent = proposal.sourceText && proposal.sourceText !== proposalSummary(proposal)
      ? `Origen: ${proposal.sourceText}`
      : actionable ? "Revisa nombre, monto y medio de pago antes de aprobar." : "Esta nota no modifica saldos ni inventario.";

    const actions = row.querySelector(".proposal-actions");
    let settlementSelect = null;
    if (proposal.intent === "payment" && pending) {
      const label = document.createElement("label");
      label.className = "proposal-settlement";
      label.textContent = "Medio del abono";
      settlementSelect = document.createElement("select");
      settlementSelect.innerHTML = '<option value="">Seleccionar</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option>';
      settlementSelect.value = ["cash", "transfer"].includes(proposal.data.settlement) ? proposal.data.settlement : "";
      label.append(settlementSelect);
      actions.append(label);
    }

    const approve = document.createElement("button");
    approve.className = "button small primary";
    approve.type = "button";
    approve.textContent = actionable ? "Aprobar y registrar" : "Marcar revisada";
    const reject = document.createElement("button");
    reject.className = "button small secondary";
    reject.type = "button";
    reject.textContent = "Rechazar";
    approve.disabled = !pending || (proposal.intent === "payment" && !settlementSelect?.value);
    reject.disabled = !pending;
    settlementSelect?.addEventListener("change", () => { approve.disabled = !settlementSelect.value; });

    approve.addEventListener("click", () => {
      try {
        const corrections = settlementSelect ? { settlement: settlementSelect.value } : null;
        const reviewed = reviewProposal(proposal, "approved", corrections);
        applyApprovedProposal(reviewed);
        proposals = proposals.map((item) => item.id === reviewed.id ? reviewed : item);
        writeStorage("assistant-proposals", proposals);
        document.querySelector("#assistant-voice-status").textContent = actionable
          ? "Propuesta aprobada y registrada."
          : "Respuesta marcada como revisada.";
        renderProposals();
      } catch (error) {
        document.querySelector("#assistant-voice-status").textContent = error.message;
      }
    });
    reject.addEventListener("click", () => {
      const reviewed = reviewProposal(proposal, "rejected");
      proposals = proposals.map((item) => item.id === reviewed.id ? reviewed : item);
      writeStorage("assistant-proposals", proposals);
      document.querySelector("#assistant-voice-status").textContent = "Propuesta rechazada. No se modificaron datos.";
      renderProposals();
    });
    actions.append(approve, reject);
    container.append(row);
  });
}

const question = document.querySelector("#assistant-question");
document.querySelector("#assistant-question-form").addEventListener("submit", (event) => {
  event.preventDefault();
  answer(question.value);
});
document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
  question.value = button.dataset.question;
  answer(question.value);
}));
document.querySelector("#speak-assistant-answer").addEventListener("click", () => {
  if (!lastAnswer) {
    document.querySelector("#assistant-voice-status").textContent = "Primero analiza una pregunta.";
    return;
  }
  if (!speakText(lastAnswer)) document.querySelector("#assistant-voice-status").textContent = "Este navegador no ofrece lectura en voz alta.";
});
document.querySelector("#save-assistant-answer").addEventListener("click", (event) => {
  const proposal = createReviewedProposal({
    sourceText: question.value,
    intent: event.currentTarget.dataset.intent,
    data: { answer: lastAnswer },
    confidence: Number(event.currentTarget.dataset.confidence),
    evidence: [],
  });
  proposals.push(proposal);
  writeStorage("assistant-proposals", proposals);
  document.querySelector("#assistant-voice-status").textContent = "Respuesta guardada en la cola de revisión.";
  renderProposals();
});

document.querySelector("#assistant-photo").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  const preview = document.querySelector("#assistant-photo-preview");
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  if (!file) {
    preview.hidden = true;
    preview.removeAttribute("src");
    return;
  }
  if (!file.type.startsWith("image/")) {
    event.target.value = "";
    preview.hidden = true;
    document.querySelector("#assistant-import-status").textContent = "Selecciona una fotografía válida.";
    document.querySelector("#assistant-import-status").dataset.state = "error";
    return;
  }
  previewUrl = URL.createObjectURL(file);
  preview.src = previewUrl;
  preview.hidden = false;
  document.querySelector("#assistant-import-status").textContent = "Vista previa local lista. Revisa o escribe la transcripción.";
  document.querySelector("#assistant-import-status").dataset.state = "success";
});

document.querySelector("#assistant-import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const candidates = parseNotebookText(document.querySelector("#assistant-transcript").value);
  const valid = candidates.filter((candidate) => candidate.valid);
  valid.forEach((candidate) => proposals.push(createReviewedProposal({
    sourceText: candidate.raw,
    intent: candidate.type,
    data: { name: candidate.name, amount: candidate.amount },
    confidence: 0.76,
    evidence: [`line:${candidate.line}`],
  })));
  writeStorage("assistant-proposals", proposals);
  renderProposals();
  const status = document.querySelector("#assistant-import-status");
  status.textContent = valid.length
    ? `${valid.length} propuesta(s) creadas. Deben revisarse una por una.`
    : "No encontramos líneas completas con nombre y monto. Corrige la transcripción e intenta nuevamente.";
  status.dataset.state = valid.length ? "success" : "warning";
});

const speech = createSpeechController({
  onFinal: (text) => { question.value = text; answer(text); },
  onInterim: (text) => { question.value = text; },
  onError: (message) => { document.querySelector("#assistant-voice-status").textContent = message; },
  onState: (state) => { document.querySelector("#assistant-voice-status").textContent = state === "listening" ? "Escuchando…" : "Listo"; },
});
document.querySelector("#assistant-mic").addEventListener("click", () => speech.start());

applyTheme();
renderContext();
renderProposals();
