export const INTEGRITY_RULESET_VERSION = 1;

const ARRAY_COLLECTIONS = Object.freeze([
  "orders",
  "inventory-lots",
  "suppliers",
  "purchase-orders",
  "order-payments",
  "credit-customers",
  "credit-ledger",
  "daily-transactions",
  "waste",
  "daily-closes",
]);

const OBJECT_COLLECTIONS = Object.freeze(["business", "prices", "continuity-meta"]);
const ORDER_STATES = new Set([
  "new", "preparing", "pending_weighing", "pending_customer_confirmation",
  "confirmed", "ready", "delivering", "delivered", "cancelled",
]);
const SETTLEMENTS = new Set(["cash", "transfer", "credit"]);
const EPSILON = 0.001;

function isPlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function finite(value) {
  return Number.isFinite(Number(value));
}

function positive(value) {
  return finite(value) && Number(value) > 0;
}

function nonNegative(value) {
  return finite(value) && Number(value) >= 0;
}

function validDate(value, { allowTimeOnly = false } = {}) {
  if (allowTimeOnly && /^\d{2}:\d{2}$/.test(String(value ?? ""))) return true;
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function validDateKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? "")) && validDate(`${value}T12:00:00`);
}

function createContext(entries, products) {
  const source = isPlainObject(entries) ? entries : {};
  const productIds = new Set((Array.isArray(products) ? products : []).map((item) => item?.id).filter(Boolean));
  const collections = Object.fromEntries(
    ARRAY_COLLECTIONS.map((name) => [name, Array.isArray(source[name]) ? source[name] : []]),
  );
  return {
    source,
    productIds,
    collections,
    supplierIds: new Set(collections.suppliers.map((item) => item?.id).filter(Boolean)),
    lotIds: new Set(collections["inventory-lots"].map((item) => item?.id).filter(Boolean)),
    orderIds: new Set(collections.orders.map((item) => item?.id).filter(Boolean)),
    customerIds: new Set(collections["credit-customers"].map((item) => item?.id).filter(Boolean)),
    transactionIds: new Set(collections["daily-transactions"].map((item) => item?.id).filter(Boolean)),
  };
}

function issue(severity, code, collection, recordId, message, recommendation) {
  return {
    severity,
    code,
    collection,
    recordId: recordId ? String(recordId) : null,
    message,
    recommendation,
  };
}

function duplicateIdIssues(name, records) {
  const seen = new Set();
  const duplicates = new Set();
  records.forEach((record) => {
    const id = String(record?.id ?? "").trim();
    if (!id) return;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  });
  return [...duplicates].map((id) => issue(
    "critical",
    "duplicate-id",
    name,
    id,
    `El identificador ${id} aparece más de una vez.`,
    "Conserva un solo registro o asigna identificadores únicos antes de continuar.",
  ));
}

function missingIdIssues(name, records) {
  return records.flatMap((record, index) => String(record?.id ?? "").trim()
    ? []
    : [issue(
      "critical",
      "missing-id",
      name,
      `posición-${index + 1}`,
      `Hay un registro en ${name} sin identificador.`,
      "Asigna un identificador estable antes de respaldar o migrar.",
    )]);
}

function validateCollectionShapes(context, issues) {
  ARRAY_COLLECTIONS.forEach((name) => {
    if (context.source[name] !== undefined && !Array.isArray(context.source[name])) {
      issues.push(issue(
        "critical",
        "invalid-collection-type",
        name,
        null,
        `${name} debería ser una lista, pero contiene otro tipo de dato.`,
        "Restaura una copia válida o restablece únicamente los datos demo.",
      ));
    }
  });
  OBJECT_COLLECTIONS.forEach((name) => {
    if (context.source[name] !== undefined && !isPlainObject(context.source[name])) {
      issues.push(issue(
        "critical",
        "invalid-collection-type",
        name,
        null,
        `${name} debería ser un objeto, pero contiene otro tipo de dato.`,
        "Restaura una copia válida o revisa la colección antes de continuar.",
      ));
    }
  });
}

function validateIdentifiers(context, issues) {
  ARRAY_COLLECTIONS.forEach((name) => {
    const records = context.collections[name];
    issues.push(...missingIdIssues(name, records), ...duplicateIdIssues(name, records));
  });
}

function validatePrices(context, issues) {
  const prices = context.source.prices;
  if (prices === undefined || !isPlainObject(prices)) return;
  Object.entries(prices).forEach(([productId, value]) => {
    if (context.productIds.size && !context.productIds.has(productId)) {
      issues.push(issue("warning", "unknown-product-price", "prices", productId, `Existe un precio para un producto desconocido: ${productId}.`, "Revisa si el producto fue eliminado o renombrado."));
    }
    if (!nonNegative(value)) {
      issues.push(issue("critical", "invalid-price", "prices", productId, `El precio de ${productId} no es un monto válido.`, "Ingresa un precio mayor o igual a cero."));
    }
  });
}

function validateOrders(context, issues) {
  context.collections.orders.forEach((order) => {
    const id = order?.id;
    if (!String(order?.customer ?? "").trim()) {
      issues.push(issue("warning", "missing-customer-name", "orders", id, "El pedido no tiene nombre de cliente.", "Agrega un nombre o una referencia de mostrador."));
    }
    if (!ORDER_STATES.has(order?.status)) {
      issues.push(issue("critical", "invalid-order-status", "orders", id, `El estado ${order?.status ?? "vacío"} no está reconocido.`, "Asigna un estado operacional válido."));
    }
    if (!validDate(order?.createdAt, { allowTimeOnly: true })) {
      issues.push(issue("warning", "invalid-order-date", "orders", id, "La fecha u hora de creación del pedido no es válida.", "Corrige la fecha para preservar el orden cronológico."));
    }
    if (!Array.isArray(order?.lines) || !order.lines.length) {
      issues.push(issue("critical", "empty-order", "orders", id, "El pedido no contiene productos.", "Elimina el pedido vacío o agrega al menos una línea."));
      return;
    }
    order.lines.forEach((line, index) => {
      const lineId = `${id ?? "pedido"}:línea-${index + 1}`;
      if (context.productIds.size && !context.productIds.has(line?.productId)) {
        issues.push(issue("critical", "unknown-product", "orders", lineId, `La línea referencia un producto desconocido: ${line?.productId ?? "vacío"}.`, "Vincula la línea a un producto existente."));
      }
      if (!positive(line?.requestedQuantity)) {
        issues.push(issue("critical", "invalid-quantity", "orders", lineId, "La cantidad solicitada debe ser mayor que cero.", "Corrige la cantidad del producto."));
      }
      if (line?.actualQuantity !== null && line?.actualQuantity !== undefined && !nonNegative(line.actualQuantity)) {
        issues.push(issue("critical", "invalid-actual-quantity", "orders", lineId, "La cantidad real no es válida.", "Ingresa cero o una cantidad positiva."));
      }
      if (!nonNegative(line?.price)) {
        issues.push(issue("critical", "invalid-line-price", "orders", lineId, "El precio de la línea no es válido.", "Corrige el precio antes de cobrar."));
      }
    });
  });
}

function validateInventory(context, issues) {
  context.collections["inventory-lots"].forEach((lot) => {
    const id = lot?.id;
    if (context.productIds.size && !context.productIds.has(lot?.productId)) {
      issues.push(issue("critical", "unknown-product", "inventory-lots", id, `El lote referencia un producto desconocido: ${lot?.productId ?? "vacío"}.`, "Vincula el lote a un producto existente."));
    }
    if (lot?.supplierId && !context.supplierIds.has(lot.supplierId)) {
      issues.push(issue("warning", "unknown-supplier", "inventory-lots", id, `El proveedor ${lot.supplierId} no existe en el registro local.`, "Crea el proveedor o corrige la referencia."));
    }
    for (const field of ["receivedQuantity", "soldQuantity", "wasteQuantity"]) {
      if (!nonNegative(lot?.[field])) issues.push(issue("critical", "invalid-inventory-quantity", "inventory-lots", id, `${field} no contiene una cantidad válida.`, "Corrige las cantidades del lote."));
    }
    if (!finite(lot?.adjustmentQuantity ?? 0)) {
      issues.push(issue("critical", "invalid-inventory-adjustment", "inventory-lots", id, "El ajuste de inventario no es numérico.", "Corrige o elimina el ajuste."));
    }
    if (!nonNegative(lot?.unitCost)) {
      issues.push(issue("critical", "invalid-unit-cost", "inventory-lots", id, "El costo unitario del lote no es válido.", "Corrige el costo de compra."));
    }
    const balance = Number(lot?.receivedQuantity ?? 0) - Number(lot?.soldQuantity ?? 0) - Number(lot?.wasteQuantity ?? 0) + Number(lot?.adjustmentQuantity ?? 0);
    if (Number.isFinite(balance) && balance < -EPSILON) {
      issues.push(issue("critical", "negative-stock", "inventory-lots", id, `El lote queda con saldo negativo (${balance.toFixed(3)}).`, "Revisa ventas, mermas y ajustes asociados al lote."));
    }
    if (!validDate(lot?.receivedAt)) {
      issues.push(issue("warning", "invalid-received-date", "inventory-lots", id, "La fecha de recepción no es válida.", "Corrige la fecha de ingreso."));
    }
    if (lot?.bestBeforeDate && !validDate(lot.bestBeforeDate)) {
      issues.push(issue("warning", "invalid-best-before-date", "inventory-lots", id, "La fecha de consumo preferente no es válida.", "Corrige la fecha del lote."));
    }
    if (validDate(lot?.receivedAt) && validDate(lot?.bestBeforeDate) && Date.parse(lot.bestBeforeDate) < Date.parse(lot.receivedAt)) {
      issues.push(issue("warning", "best-before-before-received", "inventory-lots", id, "La fecha de consumo preferente es anterior a la recepción.", "Revisa ambas fechas del lote."));
    }
  });
}

function validatePurchases(context, issues) {
  context.collections["purchase-orders"].forEach((purchase) => {
    const id = purchase?.id;
    if (!context.supplierIds.has(purchase?.supplierId)) {
      issues.push(issue("critical", "unknown-supplier", "purchase-orders", id, `La compra referencia un proveedor inexistente: ${purchase?.supplierId ?? "vacío"}.`, "Vincula la compra a un proveedor existente."));
    }
    if (!validDate(purchase?.createdAt)) {
      issues.push(issue("warning", "invalid-purchase-date", "purchase-orders", id, "La fecha de compra no es válida.", "Corrige la fecha de recepción o compra."));
    }
    if (!Array.isArray(purchase?.lines) || !purchase.lines.length) {
      issues.push(issue("critical", "empty-purchase", "purchase-orders", id, "La compra no contiene productos.", "Elimina la compra vacía o agrega líneas válidas."));
      return;
    }
    let computedTotal = 0;
    purchase.lines.forEach((line, index) => {
      const lineId = `${id ?? "compra"}:línea-${index + 1}`;
      if (context.productIds.size && !context.productIds.has(line?.productId)) {
        issues.push(issue("critical", "unknown-product", "purchase-orders", lineId, `La compra referencia un producto desconocido: ${line?.productId ?? "vacío"}.`, "Corrige el producto de la línea."));
      }
      if (!positive(line?.quantity) || !nonNegative(line?.unitCost)) {
        issues.push(issue("critical", "invalid-purchase-line", "purchase-orders", lineId, "La cantidad o costo unitario de la compra no es válido.", "Corrige cantidad y costo antes de usar el lote."));
      } else {
        computedTotal += Number(line.quantity) * Number(line.unitCost);
      }
    });
    if (!nonNegative(purchase?.total)) {
      issues.push(issue("critical", "invalid-purchase-total", "purchase-orders", id, "El total de la compra no es válido.", "Recalcula el total de la compra."));
    } else if (Math.abs(computedTotal - Number(purchase.total)) > 1) {
      issues.push(issue("warning", "purchase-total-mismatch", "purchase-orders", id, `El total guardado (${purchase.total}) no coincide con las líneas (${Math.round(computedTotal)}).`, "Revisa redondeos, descuentos o líneas faltantes."));
    }
    (Array.isArray(purchase?.lotIds) ? purchase.lotIds : []).forEach((lotId) => {
      if (!context.lotIds.has(lotId)) issues.push(issue("warning", "unknown-lot", "purchase-orders", id, `La compra referencia un lote inexistente: ${lotId}.`, "Corrige o elimina la referencia de lote."));
    });
  });
}

function validatePayments(context, issues) {
  context.collections["order-payments"].forEach((payment) => {
    const id = payment?.id;
    if (!context.orderIds.has(payment?.orderId)) issues.push(issue("critical", "unknown-order", "order-payments", id, `El pago referencia un pedido inexistente: ${payment?.orderId ?? "vacío"}.`, "Vincula el pago al pedido correcto."));
    if (!positive(payment?.amount)) issues.push(issue("critical", "invalid-payment-amount", "order-payments", id, "El monto del pago debe ser mayor que cero.", "Corrige el monto del pago."));
    if (!SETTLEMENTS.has(payment?.settlement)) issues.push(issue("warning", "invalid-settlement", "order-payments", id, "El medio de pago no está reconocido.", "Clasifica el pago como efectivo, transferencia o fiado."));
    if (!validDate(payment?.createdAt)) issues.push(issue("warning", "invalid-payment-date", "order-payments", id, "La fecha del pago no es válida.", "Corrige la fecha del pago."));
  });
}

function validateReceivables(context, issues) {
  context.collections["credit-customers"].forEach((customer) => {
    if (!String(customer?.name ?? "").trim()) issues.push(issue("critical", "missing-customer-name", "credit-customers", customer?.id, "La cuenta no tiene nombre de cliente.", "Agrega un nombre antes de registrar movimientos."));
    if (!nonNegative(customer?.creditLimit ?? 0)) issues.push(issue("warning", "invalid-credit-limit", "credit-customers", customer?.id, "El límite de crédito no es válido.", "Define un límite mayor o igual a cero."));
  });
  context.collections["credit-ledger"].forEach((entry) => {
    const id = entry?.id;
    if (!context.customerIds.has(entry?.customerId)) issues.push(issue("critical", "unknown-customer", "credit-ledger", id, `El movimiento referencia un cliente inexistente: ${entry?.customerId ?? "vacío"}.`, "Vincula el movimiento a una cuenta existente."));
    if (!["charge", "payment"].includes(entry?.type)) issues.push(issue("critical", "invalid-ledger-type", "credit-ledger", id, "El movimiento no es cargo ni abono.", "Clasifica correctamente el movimiento."));
    if (!positive(entry?.amount)) issues.push(issue("critical", "invalid-ledger-amount", "credit-ledger", id, "El monto debe ser mayor que cero.", "Corrige el monto del movimiento."));
    if (!validDate(entry?.occurredAt)) issues.push(issue("warning", "invalid-ledger-date", "credit-ledger", id, "La fecha del movimiento no es válida.", "Corrige la fecha del cargo o abono."));
    if (entry?.type === "payment" && !["cash", "transfer"].includes(entry?.settlement)) issues.push(issue("warning", "unclassified-payment", "credit-ledger", id, "El abono no indica si fue efectivo o transferencia.", "Clasifica el medio de pago antes del cierre."));
    if (entry?.source === "daily-transaction" && entry?.referenceId && !context.transactionIds.has(entry.referenceId)) issues.push(issue("warning", "unknown-transaction-reference", "credit-ledger", id, `La referencia ${entry.referenceId} no existe en las transacciones.`, "Revisa si la venta asociada fue eliminada."));
  });
}

function validateTransactions(context, issues) {
  context.collections["daily-transactions"].forEach((transaction) => {
    const id = transaction?.id;
    if (!["sale", "purchase"].includes(transaction?.type)) issues.push(issue("critical", "invalid-transaction-type", "daily-transactions", id, "La transacción no es venta ni compra.", "Clasifica correctamente la operación."));
    if (!SETTLEMENTS.has(transaction?.settlement)) issues.push(issue("warning", "invalid-settlement", "daily-transactions", id, "El medio de pago no está reconocido.", "Clasifica la operación antes del cierre."));
    if (transaction?.customerId && !context.customerIds.has(transaction.customerId)) issues.push(issue("critical", "unknown-customer", "daily-transactions", id, `La venta referencia un cliente inexistente: ${transaction.customerId}.`, "Corrige la cuenta asociada."));
    if (!validDate(transaction?.createdAt)) issues.push(issue("warning", "invalid-transaction-date", "daily-transactions", id, "La fecha de la transacción no es válida.", "Corrige la fecha de la operación."));
    if (!Array.isArray(transaction?.lines) || !transaction.lines.length) {
      issues.push(issue("critical", "empty-transaction", "daily-transactions", id, "La transacción no contiene líneas.", "Elimina la transacción vacía o agrega productos."));
      return;
    }
    let computedTotal = 0;
    transaction.lines.forEach((line, index) => {
      const lineId = `${id ?? "transacción"}:línea-${index + 1}`;
      if (!positive(line?.quantity) || !nonNegative(line?.unitPrice)) issues.push(issue("critical", "invalid-transaction-line", "daily-transactions", lineId, "La cantidad o precio unitario no es válido.", "Corrige la línea de la operación."));
      else computedTotal += Number(line.quantity) * Number(line.unitPrice);
    });
    if (!nonNegative(transaction?.total)) issues.push(issue("critical", "invalid-transaction-total", "daily-transactions", id, "El total de la operación no es válido.", "Recalcula el total."));
    else if (Math.abs(computedTotal - Number(transaction.total)) > 1) issues.push(issue("warning", "transaction-total-mismatch", "daily-transactions", id, `El total guardado (${transaction.total}) no coincide con las líneas (${Math.round(computedTotal)}).`, "Revisa redondeos o líneas faltantes."));
  });
}

function validateWaste(context, issues) {
  context.collections.waste.forEach((entry) => {
    const id = entry?.id;
    if (entry?.productId && context.productIds.size && !context.productIds.has(entry.productId)) issues.push(issue("warning", "unknown-product", "waste", id, `La merma referencia un producto desconocido: ${entry.productId}.`, "Corrige el producto de la merma."));
    if (!positive(entry?.quantity)) issues.push(issue("critical", "invalid-waste-quantity", "waste", id, "La cantidad de merma debe ser mayor que cero.", "Corrige o elimina el registro."));
    if (!validDate(entry?.createdAt)) issues.push(issue("warning", "invalid-waste-date", "waste", id, "La fecha de la merma no es válida.", "Corrige la fecha del registro."));
    if (entry?.estimatedCost !== undefined && !nonNegative(entry.estimatedCost)) issues.push(issue("warning", "invalid-waste-cost", "waste", id, "El costo estimado de la merma no es válido.", "Corrige el costo estimado."));
  });
}

function validateCloses(context, issues) {
  const dates = new Set();
  context.collections["daily-closes"].forEach((close) => {
    const id = close?.id;
    if (!validDateKey(close?.dateKey)) issues.push(issue("critical", "invalid-close-date", "daily-closes", id, "La fecha del cierre no es válida.", "Corrige la fecha comercial del cierre."));
    if (dates.has(close?.dateKey)) issues.push(issue("warning", "duplicate-close-date", "daily-closes", id, `Existe más de un cierre para ${close?.dateKey}.`, "Conserva una sola revisión final por fecha."));
    dates.add(close?.dateKey);
    if (!validDate(close?.savedAt)) issues.push(issue("warning", "invalid-close-saved-at", "daily-closes", id, "La fecha de guardado del cierre no es válida.", "Corrige la marca de tiempo del cierre."));
    const reconciliation = close?.reconciliation;
    if (!isPlainObject(reconciliation)) {
      issues.push(issue("critical", "missing-reconciliation", "daily-closes", id, "El cierre no contiene conciliación de caja.", "Vuelve a calcular y guardar el cierre."));
      return;
    }
    for (const field of ["expectedCash", "countedCash", "absoluteDifference"]) {
      if (reconciliation[field] !== null && !nonNegative(reconciliation[field])) issues.push(issue("critical", "invalid-close-value", "daily-closes", id, `${field} no contiene un monto válido.`, "Recalcula el cierre."));
    }
    if (finite(reconciliation.countedCash) && finite(reconciliation.expectedCash) && finite(reconciliation.difference)) {
      const expectedDifference = Number(reconciliation.countedCash) - Number(reconciliation.expectedCash);
      if (Math.abs(expectedDifference - Number(reconciliation.difference)) > 1) issues.push(issue("critical", "close-difference-mismatch", "daily-closes", id, "La diferencia de caja no coincide con contado menos esperado.", "Recalcula el cierre antes de usarlo."));
    }
  });
}

function recordCount(context) {
  return ARRAY_COLLECTIONS.reduce((total, name) => total + context.collections[name].length, 0)
    + OBJECT_COLLECTIONS.filter((name) => context.source[name] !== undefined).length;
}

export function auditDataIntegrity(entries, { products = [] } = {}) {
  const context = createContext(entries, products);
  const issues = [];
  if (!isPlainObject(entries)) {
    issues.push(issue("critical", "invalid-snapshot", "storage", null, "El almacenamiento no contiene una instantánea válida.", "Restaura un respaldo compatible o restablece los datos demo."));
  }
  validateCollectionShapes(context, issues);
  validateIdentifiers(context, issues);
  validatePrices(context, issues);
  validateOrders(context, issues);
  validateInventory(context, issues);
  validatePurchases(context, issues);
  validatePayments(context, issues);
  validateReceivables(context, issues);
  validateTransactions(context, issues);
  validateWaste(context, issues);
  validateCloses(context, issues);

  const counts = issues.reduce((result, item) => {
    result[item.severity] += 1;
    return result;
  }, { critical: 0, warning: 0, info: 0 });
  const status = counts.critical ? "blocked" : counts.warning ? "review" : "healthy";
  const collectionsChecked = [...ARRAY_COLLECTIONS, ...OBJECT_COLLECTIONS]
    .filter((name) => context.source[name] !== undefined).length;
  const byCollection = issues.reduce((result, item) => {
    result[item.collection] = (result[item.collection] ?? 0) + 1;
    return result;
  }, {});

  return {
    rulesetVersion: INTEGRITY_RULESET_VERSION,
    status,
    counts,
    collectionsChecked,
    recordsChecked: recordCount(context),
    issues,
    byCollection,
  };
}

export function integrityStatusLabel(status) {
  return ({
    healthy: "Datos coherentes",
    review: "Revisión recomendada",
    blocked: "Correcciones necesarias",
  })[status] ?? "Estado desconocido";
}

export function integrityStatusDescription(report) {
  if (!report || report.status === "blocked") return "Existen errores críticos que pueden afectar cálculos, referencias o una futura migración.";
  if (report.status === "review") return "No hay errores críticos, pero existen advertencias que conviene resolver.";
  return "No se detectaron referencias rotas, duplicados ni montos inválidos en las colecciones revisadas.";
}
