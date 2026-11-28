import type { InventoryTransferHistoryRow } from './api';

export type InventoryTransferHistorySort = 'newest' | 'oldest';

export type InventoryTransferHistoryFilters = {
  search: string;
  warehouseId: string;
  dateFrom: string;
  dateTo: string;
  sort: InventoryTransferHistorySort;
};

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export function normalizeInventoryTransferSearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ئىي]/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .toLocaleLowerCase('ar')
    .replace(/\s+/g, ' ')
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

/** Operates only on the already tenant-scoped rows returned by the history RPC. */
export function filterInventoryTransferHistory(
  rows: readonly InventoryTransferHistoryRow[],
  filters: InventoryTransferHistoryFilters,
): InventoryTransferHistoryRow[] {
  const terms = normalizeInventoryTransferSearch(filters.search).split(' ').filter(Boolean);
  const matched = rows.filter((row) => {
    if (filters.warehouseId !== 'all' &&
      row.source_warehouse_id !== filters.warehouseId &&
      row.destination_warehouse_id !== filters.warehouseId) return false;

    if (filters.dateFrom || filters.dateTo) {
      const createdDay = localCalendarDay(row.created_at);
      if (!createdDay) return false;
      if (filters.dateFrom && createdDay < filters.dateFrom) return false;
      if (filters.dateTo && createdDay > filters.dateTo) return false;
    }

    if (terms.length) {
      const searchable = normalizeInventoryTransferSearch([
        row.item_code ?? '',
        row.product_name ?? '',
        row.unit ?? '',
        row.source_warehouse_name ?? '',
        row.destination_warehouse_name ?? '',
        row.reason,
        row.created_by ?? '',
        row.id,
        row.batch_id ?? '',
      ].join(' '));
      if (!terms.every((term) => searchable.includes(term))) return false;
    }
    return true;
  });

  const direction = filters.sort === 'oldest' ? 1 : -1;
  return matched
    .map((row, index) => ({ row, index, timestamp: Date.parse(row.created_at) }))
    .sort((left, right) => {
      const leftValid = Number.isFinite(left.timestamp);
      const rightValid = Number.isFinite(right.timestamp);
      if (leftValid !== rightValid) return leftValid ? -1 : 1;
      if (!leftValid || !rightValid) return left.index - right.index;
      const difference = (left.timestamp - right.timestamp) * direction;
      return difference === 0 ? left.index - right.index : difference;
    })
    .map(({ row }) => row);
}
