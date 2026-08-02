import { APP_CONFIG, DEFAULT_BUSINESS } from "../core/config.js";
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
let lastAnswer = "";
const context = buildOperationalContext({ lots, customers, ledgerEntries: ledger, closes, purchases });

function applyTheme() {
  document.documentElement.style.setProperty("--primary", business.primaryColor);
  document.documentElement.style.setProperty("--accent", business.accentColor);
  document.documentElement.dataset.theme = business.darkMode ? "dark" : "light";
  document.querySelectorAll("[data-business-name]").forEach((node) => { node.textContent = business.name; });
  document.querySelector("#demo-notice").textContent = APP_CONFIG.demoNotice;
}

function renderContext() {
  document.querySelector("#assistant-context-inventory").textContent = context.inventoryPriority[0]?.productName ?? "Sin alertas";
  document.querySelector("#assistant-context-debt").textContent = `$${context.receivables.totalOutstanding.toLocaleString("es-CL")}`;
  document.querySelector("#assistant-context-close").textContent = context.lastClose?.dateKey ?? "Sin cierre";
  document.querySelector("#assistant-context-purchase").textContent = context.lastPurchase?.supplierName ?? "Sin compras";
}

function answer(text) {
  const result = interpretOperationalQuestion(text, context);
  lastAnswer = result.answer;
  document.querySelector("#assistant-answer").innerHTML = `<strong>${Math.round(result.confidence * 100)}% de confianza</strong><p></p><small></small>`;
  document.querySelector("#assistant-answer p").textContent = result.answer;
  document.querySelector("#assistant-answer small").textContent = result.evidence?.length ? `Evidencia local: ${result.evidence.join(", ")}` : "Sin evidencia suficiente para ejecutar acciones.";
  document.querySelector("#save-assistant-answer").disabled = result.intent === "unknown";
  document.querySelector("#save-assistant-answer").dataset.intent = result.intent;
  document.querySelector("#save-assistant-answer").dataset.confidence = result.confidence;
  return result;
}

function findOrCreateCustomer(name) {
  const normalized = name.toLocaleLowerCase("es").trim();
  let customer = customers.find((item) => item.name.toLocaleLowerCase("es").trim() === normalized);
  if (!customer) { customer = { id: crypto.randomUUID(), name, phone: "", notes: "Creado desde revisión asistida", creditLimit: 0 }; customers.push(customer); }
  return customer;
}

function applyApprovedProposal(proposal) {
  if (!["charge", "payment"].includes(proposal.intent)) return;
  const customer = findOrCreateCustomer(proposal.data.name);
  ledger.push({ id: crypto.randomUUID(), customerId: customer.id, type: proposal.intent, amount: proposal.data.amount, settlement: proposal.intent === "charge" ? "credit" : "unknown", description: "Revisado desde asistente", occurredAt: new Date().toISOString().slice(0, 10), source: "assistant-review", referenceId: proposal.id });
  writeStorage("credit-customers", customers);
  writeStorage("credit-ledger", ledger);
}

function renderProposals() {
  const container = document.querySelector("#assistant-proposals");
  container.replaceChildren();
  [...proposals].reverse().forEach((proposal) => {
    const row = document.createElement("article");
    row.className = `assistant-proposal proposal-${proposal.status}`;
    row.innerHTML = `<div><span></span><strong></strong><small></small></div><div class="proposal-actions"><button class="button small primary" type="button">Aprobar</button><button class="button small secondary" type="button">Rechazar</button></div>`;
    row.querySelector("span").textContent = `${Math.round(proposal.confidence * 100)}% · ${proposal.status}`;
    row.querySelector("strong").textContent = proposal.sourceText || proposal.intent;
    row.querySelector("small").textContent = JSON.stringify(proposal.data);
    const [approve, reject] = row.querySelectorAll("button");
    approve.disabled = reject.disabled = proposal.status !== "pending_review";
    approve.addEventListener("click", () => {
      const reviewed = reviewProposal(proposal, "approved");
      proposals = proposals.map((item) => item.id === reviewed.id ? reviewed : item);
      applyApprovedProposal(reviewed);
      writeStorage("assistant-proposals", proposals);
      renderProposals();
    });
    reject.addEventListener("click", () => {
      const reviewed = reviewProposal(proposal, "rejected");
      proposals = proposals.map((item) => item.id === reviewed.id ? reviewed : item);
      writeStorage("assistant-proposals", proposals);
      renderProposals();
    });
    container.append(row);
  });
}

const question = document.querySelector("#assistant-question");
document.querySelector("#assistant-question-form").addEventListener("submit", (event) => { event.preventDefault(); answer(question.value); });
document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => { question.value = button.dataset.question; answer(question.value); }));
document.querySelector("#speak-assistant-answer").addEventListener("click", () => speakText(lastAnswer));
document.querySelector("#save-assistant-answer").addEventListener("click", (event) => {
  const proposal = createReviewedProposal({ sourceText: question.value, intent: event.currentTarget.dataset.intent, data: { answer: lastAnswer }, confidence: Number(event.currentTarget.dataset.confidence), evidence: [] });
  proposals.push(proposal); writeStorage("assistant-proposals", proposals); renderProposals();
});

document.querySelector("#assistant-photo").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  const preview = document.querySelector("#assistant-photo-preview");
  if (!file) { preview.hidden = true; return; }
  preview.src = URL.createObjectURL(file); preview.hidden = false;
});
document.querySelector("#assistant-import-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const candidates = parseNotebookText(document.querySelector("#assistant-transcript").value);
  candidates.filter((candidate) => candidate.valid).forEach((candidate) => proposals.push(createReviewedProposal({ sourceText: candidate.raw, intent: candidate.type, data: { name: candidate.name, amount: candidate.amount }, confidence: 0.76, evidence: [`line:${candidate.line}`] })));
  writeStorage("assistant-proposals", proposals);
  renderProposals();
  document.querySelector("#assistant-import-status").textContent = `${candidates.filter((item) => item.valid).length} propuesta(s) creadas. Deben aprobarse una por una.`;
});

const speech = createSpeechController({ onFinal: (text) => { question.value = text; answer(text); }, onInterim: (text) => { question.value = text; }, onError: (message) => { document.querySelector("#assistant-voice-status").textContent = message; }, onState: (state) => { document.querySelector("#assistant-voice-status").textContent = state === "listening" ? "Escuchando…" : "Listo"; } });
document.querySelector("#assistant-mic").addEventListener("click", () => speech.start());
applyTheme();
renderContext();
renderProposals();
