import type { PurchaseOrder, PurchaseOrderStatus } from './purchase-orders';

export type PurchaseOrderSortOrder = 'newest' | 'oldest';

export type PurchaseOrderFilterCriteria = {
  status: 'all' | PurchaseOrderStatus;
  search: string;
  supplierId: string;
  warehouseId: string;
  dateFrom: string;
  dateTo: string;
  sortOrder: PurchaseOrderSortOrder;
};

const ARABIC_SEARCH_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

/** Normalize Arabic text and localized digits for predictable multi-field search. */
export function normalizePurchaseOrderSearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[ً-ٰٟۖ-ۭ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ئىي]/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_SEARCH_DIGITS[digit] ?? digit)
    .toLocaleLowerCase('ar')
    .replace(/s+/g, ' ')
    .trim();
}

function localCalendarDay(value: string): string | null {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function searchableOrderText(order: PurchaseOrder): string {
  return normalizePurchaseOrderSearch([
    order.purchase_order_number,
    order.supplier_name,
    order.supplier_code,
    order.warehouse_name,
    order.notes ?? '',
    ...order.items.flatMap((item) => [item.item_code, item.product_name]),
  ].join(' '));
}

/**
 * Filters only the records already returned by the tenant-scoped purchase-order RPC.
 * This is deliberately client-side presentation logic; it never widens server access.
 */
export function filterPurchaseOrders(
  orders: readonly PurchaseOrder[],
  filters: PurchaseOrderFilterCriteria,
): PurchaseOrder[] {
  const terms = normalizePurchaseOrderSearch(filters.search).split(' ').filter(Boolean);

  const matched = orders.filter((order) => {
    if (filters.status !== 'all' && order.status !== filters.status) return false;
    if (filters.supplierId !== 'all' && order.supplier_id !== filters.supplierId) return false;
    if (filters.warehouseId !== 'all' && order.warehouse_id !== filters.warehouseId) return false;

    if (filters.dateFrom || filters.dateTo) {
      const createdDay = localCalendarDay(order.created_at);
      // A malformed source timestamp is never silently included in a date-constrained result.
      if (!createdDay) return false;
      if (filters.dateFrom && createdDay < filters.dateFrom) return false;
      if (filters.dateTo && createdDay > filters.dateTo) return false;
    }

    if (terms.length) {
      const text = searchableOrderText(order);
      if (!terms.every((term) => text.includes(term))) return false;
    }
    return true;
  });

  const direction = filters.sortOrder === 'oldest' ? 1 : -1;
  return matched
    .map((order, index) => ({ order, index, timestamp: Date.parse(order.created_at) }))
    .sort((left, right) => {
      const difference = left.timestamp - right.timestamp;
      return difference === 0 ? left.index - right.index : difference * direction;
    })
    .map(({ order }) => order);
}
