import test from "node:test";
import assert from "node:assert/strict";
import { buildOperationalContext, createReviewedProposal, interpretOperationalQuestion, reviewProposal } from "../assets/js/domain/structured-assistance.js";

const context = buildOperationalContext({
  lots: [{ id: "l1", productId: "banana", productName: "Plátano", unit: "kg", receivedQuantity: 10, soldQuantity: 0, wasteQuantity: 0, unitCost: 900, bestBeforeDate: "2026-08-02", condition: "ripe", ripeness: 5, receivedAt: "2026-08-01" }],
  customers: [{ id: "c1", name: "Ana" }],
  ledgerEntries: [{ customerId: "c1", type: "charge", amount: 5000 }],
});

test("responde usando evidencia operacional", () => {
  assert.equal(interpretOperationalQuestion("qué debería vender primero", context).intent, "inventory_priority");
  assert.equal(interpretOperationalQuestion("cuánto me deben", context).intent, "receivables");
});

test("mantiene propuestas pendientes hasta revisión", () => {
  const proposal = createReviewedProposal({ sourceText: "Ana debe 5000", intent: "charge", data: { amount: 5000 }, confidence: 0.8 });
  assert.equal(proposal.status, "pending_review");
  assert.equal(reviewProposal(proposal, "approved", { amount: 4500 }).data.amount, 4500);
});
