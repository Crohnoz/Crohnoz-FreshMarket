import { DEFAULT_BUSINESS } from "../core/config.js";
import { AUDIT_VERSION } from "../domain/audit-trail.js";
import { initialOrders, products } from "./demo-data.js";
import {
  initialAssistantProposals,
  initialInventoryLots,
  initialOrderPayments,
  initialPilotValidations,
  initialPurchases,
  initialSuppliers,
} from "./operations-demo.js";
import {
  initialCustomers,
  initialDailyTransactions,
  initialLedgerEntries,
} from "./receivables-demo.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function pilotDefaultEntries() {
  return {
    business: clone(DEFAULT_BUSINESS),
    orders: clone(initialOrders),
    prices: Object.fromEntries(products.map((product) => [product.id, product.price])),
    "inventory-lots": clone(initialInventoryLots),
    suppliers: clone(initialSuppliers),
    "purchase-orders": clone(initialPurchases),
    "order-payments": clone(initialOrderPayments),
    "credit-customers": clone(initialCustomers),
    "credit-ledger": clone(initialLedgerEntries),
    "daily-transactions": clone(initialDailyTransactions),
    "assistant-proposals": clone(initialAssistantProposals),
    "pilot-validations": clone(initialPilotValidations),
    cart: [],
    waste: [],
    "daily-closes": [],
    "audit-log": [],
    "audit-meta": {
      version: AUDIT_VERSION,
      status: "empty",
      lastSequence: 0,
      lastEventHash: null,
      eventCount: 0,
      updatedAt: null,
    },
  };
}

export function materializePilotEntries(entries = {}) {
  const source = entries && typeof entries === "object" && !Array.isArray(entries) ? entries : {};
  return {
    ...pilotDefaultEntries(),
    ...clone(source),
  };
}
