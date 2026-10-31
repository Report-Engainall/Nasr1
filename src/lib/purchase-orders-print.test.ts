import { describe, expect, it } from 'vitest';
import type { PurchaseOrder } from '@/lib/purchase-orders';
import {
  projectPurchaseOrderPrintDocument,
  projectPurchaseOrderPrintResults,
} from '@/lib/purchase-orders-print';

function sampleOrder(): PurchaseOrder {
  return {
    id: 'PRIVATE-ORDER-ID',
    organization_id: 'PRIVATE-TENANT-ID',
    purchase_order_number: 'PO-20261031-000041',
    supplier_id: 'PRIVATE-SUPPLIER-ID',
    supplier_name: 'مورد موثوق',
    supplier_code: 'PRIVATE-SUPPLIER-CODE',
    warehouse_id: 'PRIVATE-WAREHOUSE-ID',
    warehouse_name: 'المستودع الرئيسي',
    status: 'partially_received',
    notes: 'PRIVATE-INTERNAL-NOTE',
    total_cost: null,
    created_by: 'PRIVATE-CREATOR-ID',
    submitted_by: 'PRIVATE-SUBMITTER-ID',
    submitted_at: '2026-10-31T09:00:00.000Z',
    cancelled_by: 'PRIVATE-CANCELLED-BY',
    cancelled_at: '2026-10-31T10:00:00.000Z',
    cancellation_reason: 'PRIVATE-CANCELLATION-REASON',
    created_at: '2026-10-31T08:00:00.000Z',
    updated_at: '2026-10-31T09:00:00.000Z',
    items: [{
      id: 'PRIVATE-LINE-ID',
      product_id: 'PRIVATE-PRODUCT-ID',
      item_code: '00001025',
      product_name: 'زيت نباتي',
      unit: 'كرتون',
      quantity_ordered: 10,
      quantity_received: 4,
      remaining_quantity: 6,
      unit_cost: null,
      line_total: null,
    }],
  };
}

describe('purchase-order print field allowlists', () => {
  it('projects only the exact manager/admin order and item fields', () => {
    const document = projectPurchaseOrderPrintDocument(sampleOrder(), ['manager']);
    expect(document).not.toBeNull();
    expect(Object.keys(document ?? {}).sort()).toEqual([
      'created_at',
      'items',
      'purchase_order_number',
      'status',
      'supplier_name',
      'total_cost',
      'warehouse_name',
    ].sort());
    expect(Object.keys(document?.items[0] ?? {}).sort()).toEqual([
      'item_code',
      'line_total',
      'product_name',
      'quantity_ordered',
      'quantity_received',
      'remaining_quantity',
      'unit',
      'unit_cost',
    ].sort());
    expect(document?.items[0].item_code).toBe('00001025');
  });

  it('excludes tenant, order, supplier, warehouse, product, line and actor sentinels', () => {
    const document = JSON.stringify(projectPurchaseOrderPrintDocument(sampleOrder(), ['admin']));
    for (const privateValue of [
      'PRIVATE-ORDER-ID',
      'PRIVATE-TENANT-ID',
      'PRIVATE-SUPPLIER-ID',
      'PRIVATE-SUPPLIER-CODE',
      'PRIVATE-WAREHOUSE-ID',
      'PRIVATE-LINE-ID',
      'PRIVATE-PRODUCT-ID',
      'PRIVATE-CREATOR-ID',
      'PRIVATE-SUBMITTER-ID',
      'PRIVATE-CANCELLED-BY',
      'PRIVATE-CANCELLATION-REASON',
      'PRIVATE-INTERNAL-NOTE',
    ]) {
      expect(document).not.toContain(privateValue);
    }
  });

  it('keeps unknown order and line costs null rather than converting them to zero', () => {
    const document = projectPurchaseOrderPrintDocument(sampleOrder(), ['admin']);
    expect(document?.total_cost).toBeNull();
    expect(document?.items[0].unit_cost).toBeNull();
    expect(document?.items[0].line_total).toBeNull();
  });

  it('rejects staff and customer roles for both order and result printing', () => {
    const order = sampleOrder();
    expect(projectPurchaseOrderPrintDocument(order, ['staff'])).toBeNull();
    expect(projectPurchaseOrderPrintDocument(order, ['customer'])).toBeNull();
    expect(projectPurchaseOrderPrintResults([order], 'كل الحالات', ['staff'])).toBeNull();
    expect(projectPurchaseOrderPrintResults([order], 'كل الحالات', ['customer'])).toBeNull();
  });

  it('projects filtered result rows without internal IDs or source metadata', () => {
    const results = projectPurchaseOrderPrintResults([sampleOrder()], 'استلام جزئي', ['manager']);
    expect(results?.filter_label).toBe('استلام جزئي');
    expect(Object.keys(results?.orders[0] ?? {}).sort()).toEqual([
      'created_at',
      'item_count',
      'purchase_order_number',
      'status',
      'supplier_name',
      'total_cost',
      'warehouse_name',
    ].sort());
    expect(results?.orders[0].item_count).toBe(1);
    expect(results?.orders[0].total_cost).toBeNull();
    const serialized = JSON.stringify(results);
    for (const privateValue of [
      'PRIVATE-ORDER-ID',
      'PRIVATE-TENANT-ID',
      'PRIVATE-SUPPLIER-ID',
      'PRIVATE-WAREHOUSE-ID',
      'PRIVATE-CREATOR-ID',
      'PRIVATE-CANCELLED-BY',
      'PRIVATE-CANCELLATION-REASON',
      'PRIVATE-INTERNAL-NOTE',
    ]) expect(serialized).not.toContain(privateValue);
  });
});
