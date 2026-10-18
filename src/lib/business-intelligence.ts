import type { Order } from './types';

export type BusinessIntelligenceOrder = Pick<Order, 'id' | 'customer_id' | 'status' | 'total_amount'>;
export type BusinessSignalKind = 'pending_backlog' | 'cancellation_rate' | 'repeat_customer' | 'customer_concentration';
export interface BusinessSnapshot {
  orderCount: number;
  pendingCount: number;
  activeFulfillmentCount: number;
  completedCount: number;
  cancelledCount: number;
  invalidAmountCount: number;
  grossValue: number | null;
  completionRate: number;
  cancellationRate: number;
}
export interface BusinessSignal {
  kind: BusinessSignalKind;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  evidence: { orderCount: number; customerCount: number; invalidAmountCount: number };
}

function finiteMoney(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= Number.MAX_SAFE_INTEGER ? parsed : null;
}

function safeOrders(orders: unknown): BusinessIntelligenceOrder[] {
  if (!Array.isArray(orders)) return [];
  return orders.filter((order): order is BusinessIntelligenceOrder =>
    Boolean(order) && typeof order === 'object' &&
    typeof order.id === 'string' && typeof order.customer_id === 'string' &&
    typeof order.status === 'string'
  );
}

export function buildBusinessSnapshot(input: BusinessIntelligenceOrder[] | null | undefined): BusinessSnapshot {
  const orders = safeOrders(input);
  const amounts = orders.map((order) => finiteMoney(order.total_amount));
  const invalidAmountCount = amounts.filter((amount) => amount === null).length;
  let sum = 0;
  let overflow = false;
  for (const amount of amounts) {
    if (amount === null) continue;
    sum += amount;
    if (!Number.isFinite(sum) || sum > Number.MAX_SAFE_INTEGER) overflow = true;
  }
  const orderCount = orders.length;
  const pendingCount = orders.filter((order) => order.status === 'pending').length;
  const activeFulfillmentCount = orders.filter((order) => ['confirmed', 'processing'].includes(order.status)).length;
  const completedCount = orders.filter((order) => ['delivered', 'completed'].includes(order.status)).length;
  const cancelledCount = orders.filter((order) => order.status === 'cancelled').length;
  const amountIsComplete = invalidAmountCount === 0 && !overflow;
  return {
    orderCount,
    pendingCount,
    activeFulfillmentCount,
    completedCount,
    cancelledCount,
    invalidAmountCount,
    grossValue: amountIsComplete ? sum : null,
    completionRate: orderCount ? completedCount / orderCount : 0,
    cancellationRate: orderCount ? cancelledCount / orderCount : 0,
  };
}

/** Deterministic signal layer; reports observed counts and suppresses financial signals for incomplete data. */
export function buildBusinessSignals(input: BusinessIntelligenceOrder[] | null | undefined): BusinessSignal[] {
  const orders = safeOrders(input);
  const snapshot = buildBusinessSnapshot(orders);
  const customerOrderCounts = new Map<string, number>();
  const customerTotals = new Map<string, number>();
  let missingCustomerId = false;
  const invalidAmount = snapshot.invalidAmountCount > 0 || snapshot.grossValue === null;
  for (const order of orders) {
    const customerId = order.customer_id.trim();
    if (!customerId) { missingCustomerId = true; continue; }
    customerOrderCounts.set(customerId, (customerOrderCounts.get(customerId) ?? 0) + 1);
    const amount = finiteMoney(order.total_amount);
    if (amount === null) continue;
    customerTotals.set(customerId, (customerTotals.get(customerId) ?? 0) + amount);
  }
  const customerCount = customerOrderCounts.size;
  const evidence = { orderCount: snapshot.orderCount, customerCount, invalidAmountCount: snapshot.invalidAmountCount };
  const signals: BusinessSignal[] = [];
  if (snapshot.pendingCount >= 5 || (snapshot.orderCount > 0 && snapshot.pendingCount / snapshot.orderCount >= 0.25)) {
    signals.push({
      kind: 'pending_backlog',
      severity: snapshot.pendingCount >= 10 ? 'critical' : 'warning',
      title: 'تراكم طلبات قيد المراجعة',
      detail: snapshot.pendingCount + ' من ' + snapshot.orderCount + ' طلبًا ما زالت قيد المراجعة.',
      evidence,
    });
  }
  if (snapshot.cancelledCount >= 3 || (snapshot.orderCount > 0 && snapshot.cancellationRate >= 0.1)) {
    signals.push({
      kind: 'cancellation_rate',
      severity: snapshot.cancellationRate >= 0.2 ? 'critical' : 'warning',
      title: 'معدل الإلغاء يحتاج مراجعة',
      detail: snapshot.cancelledCount + ' طلبًا ملغيًا من إجمالي ' + snapshot.orderCount + '.',
      evidence,
    });
  }
  const repeatedOrders = [...customerOrderCounts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
  if (repeatedOrders > 0) {
    signals.push({
      kind: 'repeat_customer',
      severity: 'info',
      title: 'وجود عملاء متكررين',
      detail: repeatedOrders + ' طلبًا إضافيًا فوق أول طلب لكل عميل ضمن البيانات المحمّلة.',
      evidence,
    });
  }
  if (!invalidAmount && !missingCustomerId && snapshot.grossValue !== null && snapshot.grossValue > 0 && customerCount > 1) {
    const topCustomerValue = Math.max(0, ...customerTotals.values());
    if (topCustomerValue / snapshot.grossValue >= 0.5) {
      signals.push({
        kind: 'customer_concentration',
        severity: 'warning',
        title: 'تركيز مرتفع في قيمة المبيعات',
        detail: 'عميل واحد يمثل 50% أو أكثر من قيمة الطلبات المحمّلة؛ راجع توزيع المبيعات قبل اتخاذ قرار.',
        evidence,
      });
    }
  }
  return signals;
}
