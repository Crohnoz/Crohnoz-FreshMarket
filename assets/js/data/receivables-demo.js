export const initialCustomers = [
  { id: "cust-ana", name: "Ana Morales", phone: "+56 9 5555 0101", notes: "Compra para almacén", creditLimit: 80000 },
  { id: "cust-luis", name: "Luis Rojas", phone: "+56 9 5555 0102", notes: "Vecino del sector", creditLimit: 50000 },
  { id: "cust-marta", name: "Marta Díaz", phone: "", notes: "Retira los viernes", creditLimit: 60000 },
  { id: "cust-don-pedro", name: "Don Pedro", phone: "+56 9 5555 0104", notes: "Verdulería amiga", creditLimit: 180000 },
];

export const initialLedgerEntries = [
  { id: "led-1", customerId: "cust-ana", type: "charge", amount: 28500, description: "Caja semanal", occurredAt: "2026-07-28", source: "demo" },
  { id: "led-2", customerId: "cust-luis", type: "charge", amount: 12300, description: "Frutas y verduras", occurredAt: "2026-07-30", source: "demo" },
  { id: "led-3", customerId: "cust-luis", type: "payment", amount: 5000, description: "Abono", occurredAt: "2026-08-01", source: "demo" },
  { id: "led-4", customerId: "cust-marta", type: "charge", amount: 18900, description: "Pedido retiro", occurredAt: "2026-07-25", source: "demo" },
  { id: "led-5", customerId: "cust-don-pedro", type: "charge", amount: 76400, description: "Venta mayorista", occurredAt: "2026-08-01", source: "demo" },
];

export const initialDailyTransactions = [];
