import { describe, expect, it } from 'vitest';
import type { InventoryTransferHistoryRow } from './api';
import {
  filterInventoryTransferHistory,
  normalizeInventoryTransferSearch,
  type InventoryTransferHistoryFilters,
} from './inventory-transfer-history-filter';

const baseRow: InventoryTransferHistoryRow = {
  id: 'transfer-1',
  organization_id: 'org-1',
  product_id: 'product-1',
  source_warehouse_id: 'warehouse-1',
  destination_warehouse_id: 'warehouse-2',
  quantity: 12.5,
  reason: 'تغذية فرع عدن',
  created_by: 'موظف المخزون',
  created_at: '2026-11-20T09:00:00.000Z',
  batch_id: 'batch-1',
  product_name: 'سكر أبيض',
  item_code: '0000125',
  unit: 'كرتون',
  source_warehouse_name: 'المخزن الرئيسي',
  destination_warehouse_name: 'مستودع عدن',
  batch_line_count: 2,
};

const defaults: InventoryTransferHistoryFilters = {
  search: '',
  warehouseId: 'all',
  dateFrom: '',
  dateTo: '',
  sort: 'newest',
};

function row(patch: Partial<InventoryTransferHistoryRow> = {}): InventoryTransferHistoryRow {
  return { ...baseRow, ...patch };
}

describe('inventory transfer history filters', () => {
  it('normalizes Arabic spelling, diacritics and localized digits', () => {
    expect(normalizeInventoryTransferSearch('أَبُو ١٢٣ ۴۵')).toBe('ابو 123 45');
  });

  it('searches all terms across item, code, warehouse, reason and batch identifiers', () => {
    const source = row();
    expect(filterInventoryTransferHistory([source], { ...defaults, search: 'سكر ١٢٥ عدن' })).toEqual([source]);
    expect(filterInventoryTransferHistory([source], { ...defaults, search: 'مؤسسة لا توجد' })).toEqual([]);
  });

  it('matches a selected warehouse at either end of a transfer', () => {
    const source = row();
    expect(filterInventoryTransferHistory([source], { ...defaults, warehouseId: 'warehouse-1' })).toEqual([source]);
    expect(filterInventoryTransferHistory([source], { ...defaults, warehouseId: 'warehouse-2' })).toEqual([source]);
    expect(filterInventoryTransferHistory([source], { ...defaults, warehouseId: 'warehouse-3' })).toEqual([]);
  });

  it('applies inclusive created-date boundaries and fails closed for invalid timestamps', () => {
    const before = row({ id: 'before', created_at: '2026-11-19T23:59:59.000Z' });
    const inside = row({ id: 'inside', created_at: '2026-11-20T09:00:00.000Z' });
    const after = row({ id: 'after', created_at: '2026-11-21T00:00:00.000Z' });
    const invalid = row({ id: 'invalid', created_at: 'not-a-date' });
    expect(filterInventoryTransferHistory([before, inside, after, invalid], {
      ...defaults,
      dateFrom: '2026-11-20',
      dateTo: '2026-11-20',
    }).map((item) => item.id)).toEqual(['inside']);
  });

  it('sorts newest or oldest and keeps ties stable', () => {
    const older = row({ id: 'older', created_at: '2026-11-19T09:00:00.000Z' });
    const first = row({ id: 'first', created_at: '2026-11-20T09:00:00.000Z' });
    const tie = row({ id: 'tie', created_at: '2026-11-20T09:00:00.000Z' });
    expect(filterInventoryTransferHistory([older, first, tie], defaults).map((item) => item.id))
      .toEqual(['first', 'tie', 'older']);
    expect(filterInventoryTransferHistory([older, first, tie], {
      ...defaults,
      sort: 'oldest',
    }).map((item) => item.id)).toEqual(['older', 'first', 'tie']);
  });
});
