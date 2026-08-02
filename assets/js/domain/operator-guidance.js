import { shouldRecommendBackup } from "./backup.js";

const ACTIVE_ORDER_STATES = new Set([
  "new",
  "preparing",
  "pending_weighing",
  "pending_customer_confirmation",
  "confirmed",
  "ready",
  "delivering",
]);

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function chooseOperatorRecommendation({
  orders = [],
  inventorySummary = {},
  closes = [],
  outstanding = 0,
  activityCount = 0,
  lastBackupAt = null,
  now = new Date(),
} = {}) {
  const activeOrders = orders.filter((order) => ACTIVE_ORDER_STATES.has(order.status));
  const confirmations = activeOrders.filter((order) => order.status === "pending_customer_confirmation");
  if (confirmations.length) {
    return {
      taskId: "sales-control",
      reason: `${confirmations.length} pedido(s) esperan confirmación del cliente antes de cobrar o entregar.`,
      urgency: "high",
    };
  }

  const weighing = activeOrders.filter((order) => ["new", "preparing", "pending_weighing"].includes(order.status));
  if (weighing.length) {
    return {
      taskId: "prepare",
      reason: `${weighing.length} pedido(s) necesitan preparación o peso real.`,
      urgency: "high",
    };
  }

  const readyToComplete = activeOrders.filter((order) => ["confirmed", "ready", "delivering"].includes(order.status));
  if (readyToComplete.length) {
    return {
      taskId: "sales-control",
      reason: `${readyToComplete.length} pedido(s) están listos para cobrar, despachar o entregar.`,
      urgency: "high",
    };
  }

  if (Number(inventorySummary.criticalLots ?? 0) > 0) {
    return {
      taskId: "inventory",
      reason: `${inventorySummary.criticalLots} lote(s) están en riesgo crítico y conviene revisarlos hoy.`,
      urgency: "high",
    };
  }

  const today = dateKey(now);
  const hasCloseToday = closes.some((close) => close.dateKey === today);
  const hour = now instanceof Date ? now.getHours() : new Date(now).getHours();
  if (hour >= 18 && !hasCloseToday) {
    return {
      taskId: "close-day",
      reason: "El día está terminando y todavía no existe un cierre guardado para hoy.",
      urgency: "medium",
    };
  }

  if (shouldRecommendBackup({ activityCount, lastBackupAt, now })) {
    return {
      taskId: "backup",
      reason: lastBackupAt
        ? "Ya hay actividad nueva y el último respaldo tiene una semana o más. Descarga una copia actualizada."
        : "Ya registraste varias operaciones sin descargar un respaldo local.",
      urgency: "medium",
    };
  }

  if (Number(outstanding) > 0) {
    return {
      taskId: "payment",
      reason: "Hay cuentas por cobrar. Puedes registrar un abono apenas llegue un pago.",
      urgency: "normal",
    };
  }

  return {
    taskId: "sale",
    reason: "No hay alertas urgentes. El negocio está listo para registrar una nueva venta.",
    urgency: "normal",
  };
}

export function operatorTaskGroups(tasks = []) {
  const frequentIds = new Set(["sale", "sales-control", "prepare", "inventory", "payment", "close-day"]);
  return {
    frequent: tasks.filter((task) => frequentIds.has(task.id)),
    secondary: tasks.filter((task) => !frequentIds.has(task.id)),
  };
}
