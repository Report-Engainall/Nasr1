import { describe, expect, it } from 'vitest';
import type { ProductPriceGridRow } from './api';
import { filterPriceGridRows, PRICE_GRID_UNCATEGORIZED_FILTER, type PriceGridFilters } from './price-grid-filters';

function row(id: string, overrides: Partial<ProductPriceGridRow> = {}): ProductPriceGridRow {
  return {
    id,
    name: id,
    item_code: 'SKU-' + id,
    unit: 'قطعة',
    is_active: true,
    category_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    category_name: 'مواد غذائية',
    base_price: 100,
    price_wholesale_of_wholesale: 90,
    price_wholesale: 80,
    price_retail: 110,
    quantity_on_hand_total: 10,
    quantity_reserved_total: 0,
    quantity_available_total: 10,
    reorder_point_total: 5,
    inventory_warehouse_count: 1,
    ...overrides,
  };
}

const defaults: PriceGridFilters = {
  search: '',
  productStatus: 'all',
  inventoryStatus: 'all',
  categoryId: 'all',
  sortBy: 'name',
};

describe('price grid search, stock filters and stable sorting', () => {
  const products = [
    row('أرز بسمتي', { item_code: 'RICE-001', base_price: 100, quantity_available_total: 12 }),
    row('سكر', { item_code: 'SUGAR-002', base_price: 250, quantity_available_total: 2, reorder_point_total: 5 }),
    row('زيت', { item_code: 'OIL-003', is_active: false, base_price: 75, quantity_available_total: 0 }),
    row('صنف غير مثبت', { item_code: 'UNKNOWN-004', quantity_available_total: null, reorder_point_total: null }),
  ];

  it('searches by normalized product name and SKU without altering source rows', () => {
    expect(filterPriceGridRows(products, { ...defaults, search: '  RICE-001 ' }).map((item) => item.id)).toEqual(['أرز بسمتي']);
    expect(filterPriceGridRows(products, { ...defaults, search: 'سكر' }).map((item) => item.id)).toEqual(['سكر']);
    expect(products).toHaveLength(4);
  });

  it('searches and filters using only the server-projected category identity', () => {
    const categoryB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const categorized = [
      products[0],
      row('منظفات', { category_id: categoryB, category_name: 'منظفات منزلية' }),
      row('غير مصنف', { category_id: null, category_name: null }),
    ];
    expect(filterPriceGridRows(categorized, { ...defaults, search: 'منظفات منزلية' }).map((item) => item.id)).toEqual(['منظفات']);
    expect(filterPriceGridRows(categorized, { ...defaults, categoryId: categoryB }).map((item) => item.id)).toEqual(['منظفات']);
    expect(filterPriceGridRows(categorized, { ...defaults, categoryId: PRICE_GRID_UNCATEGORIZED_FILTER }).map((item) => item.id)).toEqual(['غير مصنف']);
    expect(filterPriceGridRows(categorized, defaults)).toHaveLength(3);
  });

  it('filters active and inactive products independently', () => {
    expect(filterPriceGridRows(products, { ...defaults, productStatus: 'active' }).some((item) => item.id === 'زيت')).toBe(false);
    expect(filterPriceGridRows(products, { ...defaults, productStatus: 'inactive' }).map((item) => item.id)).toEqual(['زيت']);
  });

  it('separates available, low, and out-of-stock states', () => {
    expect(filterPriceGridRows(products, { ...defaults, inventoryStatus: 'in_stock' }).map((item) => item.id)).toEqual(['أرز بسمتي', 'سكر']);
    expect(filterPriceGridRows(products, { ...defaults, inventoryStatus: 'low_stock' }).map((item) => item.id)).toEqual(['سكر']);
    expect(filterPriceGridRows(products, { ...defaults, inventoryStatus: 'out_of_stock' }).map((item) => item.id)).toEqual(['زيت']);
  });

  it('preserves unknown stock as unknown rather than converting it to zero', () => {
    expect(filterPriceGridRows(products, { ...defaults, inventoryStatus: 'unknown' }).map((item) => item.id)).toEqual(['صنف غير مثبت']);
  });

  it('sorts by saved price and available stock with stable ordering and null stock last', () => {
    expect(filterPriceGridRows(products, { ...defaults, sortBy: 'price_high' }).map((item) => item.id)).toEqual(['سكر', 'أرز بسمتي', 'صنف غير مثبت', 'زيت']);
    expect(filterPriceGridRows(products, { ...defaults, sortBy: 'stock_high' }).map((item) => item.id)).toEqual(['أرز بسمتي', 'سكر', 'زيت', 'صنف غير مثبت']);
  });

  it('combines search, product status, and inventory state instead of filtering one at a time', () => {
    expect(filterPriceGridRows(products, {
      ...defaults,
      search: 'SUGAR-002',
      productStatus: 'active',
      inventoryStatus: 'low_stock',
    })).toEqual([products[1]]);
  });
});
