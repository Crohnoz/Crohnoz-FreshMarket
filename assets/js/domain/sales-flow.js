export function orderLineQuantity(line) {
  const actual = Number(line.actualQuantity);
  return Number.isFinite(actual) && actual >= 0 ? actual : Number(line.requestedQuantity ?? 0);
}

export function orderLineTotal(line) {
  return Math.round(orderLineQuantity(line) * Number(line.price ?? 0));
}

export function orderTotal(order) {
  return (order.lines ?? []).reduce((sum, line) => sum + orderLineTotal(line), 0);
}

export function orderDifferenceSummary(order) {
  const lines = (order.lines ?? []).map((line) => {
    const requested = Number(line.requestedQuantity ?? 0);
    const actual = orderLineQuantity(line);
    return {
      name: line.name,
      requested,
      actual,
      difference: Math.round((actual - requested) * 1000) / 1000,
      requiresConfirmation: Boolean(line.adjustment?.requiresConfirmation),
    };
  });
  return {
    lines,
    requiresConfirmation: lines.some((line) => line.requiresConfirmation),
    changedLines: lines.filter((line) => line.difference !== 0).length,
  };
}

export function paymentSummary(payments, orderId, total) {
  const relevant = payments.filter((payment) => payment.orderId === orderId && payment.status !== "void");
  const paid = relevant.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
  return {
    paid: Math.round(paid),
    due: Math.max(0, Math.round(Number(total) - paid)),
    status: paid <= 0 ? "unpaid" : paid >= total ? "paid" : "partial",
    payments: relevant,
  };
}

export function createReceiptText({ businessName, order, payments, issuedAt = new Date() }) {
  const total = orderTotal(order);
  const summary = paymentSummary(payments, order.id, total);
  const lines = [
    businessName,
    `Comprobante interno ${order.id}`,
    `Cliente: ${order.customer}`,
    `Fecha: ${new Intl.DateTimeFormat("es-CL", { dateStyle: "short", timeStyle: "short" }).format(issuedAt)}`,
    "",
    ...(order.lines ?? []).map((line) => `${line.name}: ${orderLineQuantity(line)} ${line.unit} × $${Number(line.price).toLocaleString("es-CL")} = $${orderLineTotal(line).toLocaleString("es-CL")}`),
    "",
    `Total: $${total.toLocaleString("es-CL")}`,
    `Pagado: $${summary.paid.toLocaleString("es-CL")}`,
    `Pendiente: $${summary.due.toLocaleString("es-CL")}`,
    "Documento demostrativo. No es boleta tributaria.",
  ];
  return lines.join("\n");
}

export function nextOrderState(order, action) {
  const transitions = {
    confirm_difference: ["pending_customer_confirmation", "confirmed"],
    mark_ready: ["confirmed", "ready"],
    start_delivery: ["ready", "delivering"],
    complete_pickup: ["ready", "delivered"],
    deliver: ["delivering", "delivered"],
  };
  const transition = transitions[action];
  if (!transition || order.status !== transition[0]) throw new Error("Transición de pedido no permitida.");
  return { ...order, status: transition[1] };
}
