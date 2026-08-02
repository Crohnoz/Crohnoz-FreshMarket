import test from "node:test";
import assert from "node:assert/strict";
import { interpretVoiceCommand, parseSpokenNumber } from "../assets/js/assistant/voice-intents.js";

test("parsea números hablados y lucas", () => {
  assert.equal(parseSpokenNumber("quince mil"), 15000);
  assert.equal(parseSpokenNumber("mil cuatrocientos noventa"), 1490);
  assert.equal(parseSpokenNumber("cinco"), 5);
});

test("interpreta un nuevo fiado", () => {
  const result = interpretVoiceCommand("Anótale a Rosa quince mil de fiado");
  assert.equal(result.intent, "charge");
  assert.equal(result.data.customerName, "Rosa");
  assert.equal(result.data.amount, 15000);
});

test("interpreta un abono en lucas", () => {
  const result = interpretVoiceCommand("Pedro abonó cinco lucas");
  assert.equal(result.intent, "payment");
  assert.equal(result.data.customerName, "Pedro");
  assert.equal(result.data.amount, 5000);
});

test("interpreta una línea de venta", () => {
  const result = interpretVoiceCommand("Vendí cinco kilos de tomate a mil cuatrocientos noventa");
  assert.equal(result.intent, "transaction_line");
  assert.equal(result.data.type, "sale");
  assert.equal(result.data.quantity, 5);
  assert.equal(result.data.product, "tomate");
  assert.equal(result.data.unitPrice, 1490);
  assert.deepEqual(result.missing, []);
});

test("interpreta consultas de cobranza", () => {
  assert.equal(interpretVoiceCommand("Cuánto me deben en total").intent, "query_total_debt");
  assert.equal(interpretVoiceCommand("Quién me debe más").intent, "query_top_debtor");
  assert.equal(interpretVoiceCommand("Léeme las cuentas pendientes").intent, "read_pending_accounts");
});

test("no inventa una acción si falta contexto", () => {
  const result = interpretVoiceCommand("hola necesito ayuda");
  assert.equal(result.intent, "unknown");
});
