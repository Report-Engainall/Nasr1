import { describe, expect, it } from 'vitest';
import type { InventoryStockCountLine } from './api';
import { filterStockCountLines, normalizeStockCountSearch, type StockCountLineFilterCriteria } from './stock-count-filters';

const baseLine: InventoryStockCountLine = {
  id: 'line-1', organization_id: 'org-1', session_id: 'session-1', product_id: 'product-1',
  product_code: 'SKU-00125', product_name: 'سكر أبيض ناعم', unit: 'كرتون',
  expected_quantity: 10, expected_reserved_quantity: 2, expected_last_movement_at: null,
  counted_quantity: null, counted_at: null, completed_quantity: null, variance: null, completed_at: null,
};
const defaults: StockCountLineFilterCriteria = { search: '', status: 'all' };
const line = (patch: Partial<InventoryStockCountLine> = {}): InventoryStockCountLine => ({ ...baseLine, ...patch });

describe('stock-count operational filters', () => {
  it('normalizes Arabic diacritics, alef variants and Arabic/Persian digits', () => {
    expect(normalizeStockCountSearch('أَبُو ١٢٣ ۴۵')).toBe('ابو 123 45');
  });
  it('matches every query token across product name, code and unit', () => {
    const item = line();
    expect(filterStockCountLines([item], { ...defaults, search: 'سُكَر ١٢٥ كرتون' })).toEqual([item]);
    expect(filterStockCountLines([item], { ...defaults, search: 'سكر مفقود' })).toEqual([]);
  });
  it('treats saved zero as counted and separates uncounted rows', () => {
    const zero = line({ id: 'zero', product_id: 'zero', counted_quantity: 0, variance: -10 });
    const pending = line({ id: 'pending', product_id: 'pending' });
    expect(filterStockCountLines([zero, pending], { ...defaults, status: 'counted' })).toEqual([zero]);
    expect(filterStockCountLines([zero, pending], { ...defaults, status: 'uncounted' })).toEqual([pending]);
  });
  it('shows only counted quantities with an actual difference in variance mode', () => {
    const match = line({ id: 'variance', counted_quantity: 12, variance: 2 });
    const same = line({ id: 'same', counted_quantity: 10, variance: 0 });
    const pending = line({ id: 'pending', counted_quantity: null, variance: null });
    expect(filterStockCountLines([match, same, pending], { ...defaults, status: 'variance' })).toEqual([match]);
  });
  it('keeps source order and does not mutate persisted rows', () => {
    const first = line({ id: 'first', product_id: 'first', counted_quantity: 3 });
    const second = line({ id: 'second', product_id: 'second', counted_quantity: 4 });
    const source = [first, second];
    expect(filterStockCountLines(source, defaults).map((item) => item.id)).toEqual(['first', 'second']);
    expect(source).toEqual([first, second]);
  });
});
