import test from "node:test";
import assert from "node:assert/strict";
import { createReceiptText, nextOrderState, orderDifferenceSummary, orderTotal, paymentSummary } from "../assets/js/domain/sales-flow.js";

const order = { id: "FM-1", customer: "Ana", status: "pending_customer_confirmation", lines: [{ name: "Tomate", requestedQuantity: 1, actualQuantity: 1.1, unit: "kg", price: 2000, adjustment: { requiresConfirmation: true } }] };

test("usa cantidad real para total y detecta confirmación", () => {
  assert.equal(orderTotal(order), 2200);
  assert.equal(orderDifferenceSummary(order).requiresConfirmation, true);
});

test("resume pagos y crea comprobante no tributario", () => {
  assert.deepEqual(paymentSummary([{ orderId: "FM-1", amount: 1000 }], "FM-1", 2200), { paid: 1000, due: 1200, status: "partial", payments: [{ orderId: "FM-1", amount: 1000 }] });
  assert.match(createReceiptText({ businessName: "Mercado", order, payments: [] }), /No es boleta tributaria/);
});

test("aplica transiciones permitidas para delivery y retiro", () => {
  assert.equal(nextOrderState(order, "confirm_difference").status, "confirmed");
  assert.equal(nextOrderState({ ...order, status: "ready" }, "complete_pickup").status, "delivered");
  assert.throws(() => nextOrderState(order, "deliver"));
});
