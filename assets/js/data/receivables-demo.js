function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function todayAt(hour, minute) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute).toISOString();
}

const demoToday = localDateKey();

export const initialCustomers = [
  { id: "cust-ana", name: "Ana Morales", phone: "+56 9 5555 0101", notes: "Compra para almacén", creditLimit: 80000 },
  { id: "cust-luis", name: "Luis Rojas", phone: "+56 9 5555 0102", notes: "Vecino del sector", creditLimit: 50000 },
  { id: "cust-marta", name: "Marta Díaz", phone: "", notes: "Retira los viernes", creditLimit: 60000 },
  { id: "cust-don-pedro", name: "Don Pedro", phone: "+56 9 5555 0104", notes: "Verdulería amiga", creditLimit: 180000 },
];

export const initialLedgerEntries = [
  { id: "led-1", customerId: "cust-ana", type: "charge", amount: 28500, description: "Caja semanal", occurredAt: "2026-07-28", source: "demo", settlement: "credit" },
  { id: "led-2", customerId: "cust-luis", type: "charge", amount: 12300, description: "Frutas y verduras", occurredAt: "2026-07-30", source: "demo", settlement: "credit" },
  { id: "led-3", customerId: "cust-luis", type: "payment", amount: 5000, description: "Abono", occurredAt: "2026-08-01", source: "demo", settlement: "cash" },
  { id: "led-4", customerId: "cust-marta", type: "charge", amount: 18900, description: "Pedido retiro", occurredAt: "2026-07-25", source: "demo", settlement: "credit" },
  { id: "led-5", customerId: "cust-don-pedro", type: "charge", amount: 76400, description: "Venta mayorista", occurredAt: "2026-08-01", source: "demo", settlement: "credit" },
  { id: "led-today-payment", customerId: "cust-don-pedro", type: "payment", amount: 8000, description: "Abono en efectivo", occurredAt: demoToday, source: "demo", settlement: "cash" },
  { id: "led-today-credit", customerId: "cust-ana", type: "charge", amount: 9500, description: "Venta fiada del día", occurredAt: demoToday, source: "daily-transaction", settlement: "credit", referenceId: "txn-today-credit" },
];

export const initialDailyTransactions = [
  {
    id: "txn-today-cash",
    type: "sale",
    counterparty: "Venta mostrador",
    settlement: "cash",
    customerId: null,
    lines: [
      { product: "Tomate", quantity: 5, unitPrice: 1490 },
      { product: "Papas", quantity: 4, unitPrice: 2762.5 },
    ],
    total: 18500,
    createdAt: todayAt(10, 15),
    source: "demo",
  },
  {
    id: "txn-today-transfer",
    type: "sale",
    counterparty: "Cliente transferencia",
    settlement: "transfer",
    customerId: null,
    lines: [{ product: "Caja de verduras", quantity: 1, unitPrice: 12400 }],
    total: 12400,
    createdAt: todayAt(12, 40),
    source: "demo",
  },
  {
    id: "txn-today-credit",
    type: "sale",
    counterparty: "Ana Morales",
    settlement: "credit",
    customerId: "cust-ana",
    lines: [{ product: "Frutas surtidas", quantity: 1, unitPrice: 9500 }],
    total: 9500,
    createdAt: todayAt(14, 5),
    source: "demo",
  },
  {
    id: "txn-today-purchase",
    type: "purchase",
    counterparty: "Proveedor local",
    settlement: "cash",
    customerId: null,
    lines: [{ product: "Reposición de hojas verdes", quantity: 1, unitPrice: 7200 }],
    total: 7200,
    createdAt: todayAt(8, 30),
    source: "demo",
  },
];
