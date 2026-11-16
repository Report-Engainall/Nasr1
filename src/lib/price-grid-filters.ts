import type { ProductPriceGridRow } from './api';

export type PriceGridFilters = {
  search: string;
  productStatus: 'all' | 'active' | 'inactive';
  inventoryStatus: 'all' | 'in_stock' | 'low_stock' | 'out_of_stock' | 'unknown';
  sortBy: 'name' | 'price_high' | 'price_low' | 'stock_high' | 'stock_low';
};

function normalized(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase();
}

function compareNullableNumber(left: number | null, right: number | null, descending: boolean): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return descending ? right - left : left - right;
}

/** Filters and orders the complete server-returned price grid; never mutates saved rows or drafts. */
export function filterPriceGridRows(
  rows: readonly ProductPriceGridRow[],
  filters: PriceGridFilters,
): ProductPriceGridRow[] {
  const search = normalized(filters.search);
  const filtered = rows.filter((row) => {
    if (filters.productStatus === 'active' && !row.is_active) return false;
    if (filters.productStatus === 'inactive' && row.is_active) return false;
    if (search && !normalized(row.name + ' ' + row.item_code).includes(search)) return false;

    const available = row.quantity_available_total;
    if (filters.inventoryStatus === 'in_stock' && !(available !== null && available > 0)) return false;
    if (filters.inventoryStatus === 'low_stock' && !(
      available !== null &&
      available > 0 &&
      row.reorder_point_total !== null &&
      available <= row.reorder_point_total
    )) return false;
    if (filters.inventoryStatus === 'out_of_stock' && available !== 0) return false;
    if (filters.inventoryStatus === 'unknown' && available !== null) return false;
    return true;
  });

  return filtered.map((row, index) => ({ row, index })).sort((left, right) => {
    let comparison = 0;
    switch (filters.sortBy) {
      case 'price_high':
        comparison = right.row.base_price - left.row.base_price;
        break;
      case 'price_low':
        comparison = left.row.base_price - right.row.base_price;
        break;
      case 'stock_high':
        comparison = compareNullableNumber(left.row.quantity_available_total, right.row.quantity_available_total, true);
        break;
      case 'stock_low':
        comparison = compareNullableNumber(left.row.quantity_available_total, right.row.quantity_available_total, false);
        break;
      case 'name':
        comparison = left.row.name.localeCompare(right.row.name, 'ar');
        break;
    }
    return comparison || left.index - right.index;
  }).map(({ row }) => row);
}
