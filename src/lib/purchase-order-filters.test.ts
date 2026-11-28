import { describe, expect, it } from 'vitest';
import type { PurchaseOrder } from './purchase-orders';
import {
  filterPurchaseOrders,
  normalizePurchaseOrderSearch,
  type PurchaseOrderFilterCriteria,
} from './purchase-order-filters';

const baseOrder: PurchaseOrder = {
  id: 'order-1',
  organization_id: 'org-1',
  purchase_order_number: 'PO-20261120-000001',
  supplier_id: 'supplier-1',
  supplier_name: 'مؤسسة الأمل',
  supplier_code: 'SUP-01',
  warehouse_id: 'warehouse-1',
  warehouse_name: 'المخزن الرئيسي',
  status: 'draft',
  notes: 'توريد سكر',
  total_cost: null,
  created_by: 'manager-1',
  submitted_by: null,
  submitted_at: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: null,
  created_at: '2026-11-20T09:00:00.000Z',
  updated_at: '2026-11-20T09:00:00.000Z',
  items: [{
    id: 'line-1',
    product_id: 'product-1',
    item_code: '0000125',
    product_name: 'سكر أبيض',
    unit: 'كرتون',
    quantity_ordered: 2,
    quantity_received: 0,
    remaining_quantity: 2,
    unit_cost: null,
    line_total: null,
  }],
};

const defaults: PurchaseOrderFilterCriteria = {
  status: 'all',
  search: '',
  supplierId: 'all',
  warehouseId: 'all',
  dateFrom: '',
  dateTo: '',
  sortOrder: 'newest',
};

function makeOrder(patch: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return { ...baseOrder, ...patch, items: patch.items ?? baseOrder.items };
}

describe('purchase-order workspace filters', () => {
  it('normalizes Arabic hamza, tashkeel and Arabic/Persian digits', () => {
    expect(normalizePurchaseOrderSearch('أَبُو ١٢٣ ۴۵')).toBe('ابو 123 45');
  });

  it('searches all tokens across order, supplier, warehouse and line-item fields', () => {
    const order = makeOrder({
      supplier_name: 'مؤسسة النور',
      warehouse_name: 'فرع عدن',
      items: [{
        ...baseOrder.items[0],
        item_code: 'ABC-007',
        product_name: 'سكر أبيض ناعم',
      }],
    });

    expect(filterPurchaseOrders([order], { ...defaults, search: 'سكر ٠٠٧' })).toEqual([order]);
    expect(filterPurchaseOrders([order], { ...defaults, search: 'النور عدن' })).toEqual([order]);
    expect(filterPurchaseOrders([order], { ...defaults, search: 'سكر مفقود' })).toEqual([]);
  });

  it('combines status, supplier, warehouse and inclusive local date bounds', () => {
    const older = makeOrder({
      id: 'older',
      status: 'submitted',
      supplier_id: 'supplier-2',
      warehouse_id: 'warehouse-2',
      created_at: '2026-11-19T12:00:00.000Z',
    });
    const within = makeOrder({
      id: 'within',
      status: 'received',
      supplier_id: 'supplier-2',
      warehouse_id: 'warehouse-2',
      created_at: '2026-11-20T12:00:00.000Z',
    });
    const newer = makeOrder({
      id: 'newer',
      status: 'received',
      supplier_id: 'supplier-2',
      warehouse_id: 'warehouse-2',
      created_at: '2026-11-22T12:00:00.000Z',
    });

    expect(filterPurchaseOrders([older, within, newer], {
      ...defaults,
      status: 'received',
      supplierId: 'supplier-2',
      warehouseId: 'warehouse-2',
      dateFrom: '2026-11-20',
      dateTo: '2026-11-21',
    }).map((order) => order.id)).toEqual(['within']);
  });

  it('sorts newest and oldest while preserving source order for equal timestamps', () => {
    const first = makeOrder({ id: 'first', created_at: '2026-11-20T09:00:00.000Z' });
    const sameTime = makeOrder({ id: 'same-time', created_at: '2026-11-20T09:00:00.000Z' });
    const later = makeOrder({ id: 'later', created_at: '2026-11-21T09:00:00.000Z' });

    expect(filterPurchaseOrders([first, sameTime, later], defaults).map((order) => order.id))
      .toEqual(['later', 'first', 'same-time']);
    expect(filterPurchaseOrders([first, sameTime, later], {
      ...defaults,
      sortOrder: 'oldest',
    }).map((order) => order.id)).toEqual(['first', 'same-time', 'later']);
  });

  it('fails closed for an invalid timestamp when a date filter is active', () => {
    const invalid = makeOrder({ created_at: 'not-a-date' });
    expect(filterPurchaseOrders([invalid], { ...defaults, dateFrom: '2026-11-01' })).toEqual([]);
  });
});
