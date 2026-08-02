export const initialInventoryLots = [
  { id: "lot-tomato-0801", productId: "tomato-long-life", productName: "Tomate larga vida", unit: "kg", receivedQuantity: 18, soldQuantity: 6.5, wasteQuantity: 0.8, adjustmentQuantity: 0, unitCost: 1180, receivedAt: "2026-08-01", bestBeforeDate: "2026-08-03", condition: "ripe", ripeness: 4, supplierId: "sup-vega", source: "demo", notes: "Segunda selección disponible para salsa" },
  { id: "lot-avocado-0731", productId: "avocado-hass", productName: "Palta Hass", unit: "kg", receivedQuantity: 12, soldQuantity: 4.2, wasteQuantity: 0.4, adjustmentQuantity: 0, unitCost: 4050, receivedAt: "2026-07-31", bestBeforeDate: "2026-08-02", condition: "ripe", ripeness: 5, supplierId: "sup-sur", source: "demo", notes: "Priorizar venta hoy" },
  { id: "lot-banana-0802", productId: "banana", productName: "Plátano", unit: "kg", receivedQuantity: 24, soldQuantity: 2, wasteQuantity: 0, adjustmentQuantity: 0, unitCost: 990, receivedAt: "2026-08-02", bestBeforeDate: "2026-08-06", condition: "good", ripeness: 2, supplierId: "sup-vega", source: "demo", notes: "Mezcla verde y firme" },
  { id: "lot-lettuce-0802", productId: "lettuce", productName: "Lechuga escarola", unit: "unit", receivedQuantity: 18, soldQuantity: 3, wasteQuantity: 1, adjustmentQuantity: 0, unitCost: 740, receivedAt: "2026-08-02", bestBeforeDate: "2026-08-04", condition: "good", ripeness: 2, supplierId: "sup-local", source: "demo", notes: "Mantener refrigerada" },
];

export const initialSuppliers = [
  { id: "sup-vega", name: "Distribuidora La Vega", phone: "+56 9 5555 1001", leadTimeDays: 1, notes: "Fruta y verdura mayorista" },
  { id: "sup-sur", name: "Frutas del Sur", phone: "+56 9 5555 1002", leadTimeDays: 2, notes: "Paltas, manzanas y fruta de temporada" },
  { id: "sup-local", name: "Huerta Local", phone: "+56 9 5555 1003", leadTimeDays: 0, notes: "Hojas y productos de cosecha diaria" },
];

export const initialPurchases = [
  { id: "pur-0802-1", supplierId: "sup-vega", supplierName: "Distribuidora La Vega", createdAt: "2026-08-02T08:20:00-04:00", settlement: "transfer", total: 23760, lines: [{ productId: "banana", productName: "Plátano", quantity: 24, unit: "kg", unitCost: 990, targetMarginPercent: 32, expectedWastePercent: 6, suggestedPrice: 1550 }], lotIds: ["lot-banana-0802"] },
];

export const initialOrderPayments = [
  { id: "pay-fm1040", orderId: "FM-1040", amount: 24990, settlement: "transfer", status: "confirmed", createdAt: "2026-08-02T01:25:00-04:00" },
];

export const initialAssistantProposals = [];
export const initialPilotValidations = [];
