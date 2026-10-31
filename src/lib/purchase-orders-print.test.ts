import { describe, expect, it } from 'vitest';
import type { PurchaseOrder } from '@/lib/purchase-orders';
import {
  canPrintPurchaseOrders,
  projectPurchaseOrderPrintDocument,
  projectPurchaseOrdersForPrint,
} from '@/lib/purchase-orders-print';

function sampleOrder(): PurchaseOrder {
  return {
    id: 'order-internal-id-sentinel',
    organization_id: 'tenant-secret-sentinel',
    purchase_order_number: 'PO-20261031-000041',
    supplier_id: 'supplier-private-id-sentinel',
    supplier_name: 'مورد موثوق',
    supplier_code: 'SUP-0041',
    warehouse_id: 'warehouse-private-id-sentinel',
    warehouse_name: 'المخزن الرئيسي',
    status: 'cancelled',
    notes: 'internal-note-must-never-print',
    total_cost: null,
    created_by: 'created-by-actor-id-sentinel',
    submitted_by: 'submitted-by-actor-id-sentinel',
    submitted_at: '2026-10-30T10:00:00Z',
    cancelled_by: 'cancelled-by-actor-id-sentinel',
    cancelled_at: '2026-10-31T10:00:00Z',
    cancellation_reason: 'internal-cancellation-reason-must-never-print',
    created_at: '2026-10-29T10:00:00Z',
    updated_at: '2026-10-31T10:00:00Z',
    items: [{
      id: 'line-internal-id-sentinel',
      product_id: 'product-private-id-sentinel',
      item_code: '000041',
      product_name: 'صنف قابل للطباعة',
      unit: 'كرتون',
      quantity_ordered: 5,
      quantity_received: 2,
      remaining_quantity: 3,
      unit_cost: null,
      line_total: null,
    }],
  };
}

describe('purchase order print projection', () => {
  it('projects exact display allowlists and excludes all internal identifiers and workflow notes', () => {
    const projected = projectPurchaseOrderPrintDocument(sampleOrder(), ['admin']);
    expect(projected).not.toBeNull();
    expect(Object.keys(projected!)).toEqual([
      'purchaseOrderNumber', 'supplierName', 'supplierCode', 'warehouseName',
      'status', 'statusLabel', 'createdAt', 'submittedAt', 'totalCost', 'items',
    ]);
    expect(Object.keys(projected!.items[0])).toEqual([
      'itemCode', 'productName', 'unit', 'quantityOrdered', 'quantityReceived',
      'remainingQuantity', 'unitCost', 'lineTotal',
    ]);

    const output = JSON.stringify(projected);
    for (const sentinel of [
      'order-internal-id-sentinel',
      'tenant-secret-sentinel',
      'supplier-private-id-sentinel',
      'warehouse-private-id-sentinel',
      'created-by-actor-id-sentinel',
      'submitted-by-actor-id-sentinel',
      'cancelled-by-actor-id-sentinel',
      'line-internal-id-sentinel',
      'product-private-id-sentinel',
      'internal-note-must-never-print',
      'internal-cancellation-reason-must-never-print',
      '2026-10-31T10:00:00Z',
    ]) {
      expect(output).not.toContain(sentinel);
    }
  });

  it('does not create a print document for staff, accountants, customers or missing roles', () => {
    const order = sampleOrder();
    expect(canPrintPurchaseOrders(['admin'])).toBe(true);
    expect(canPrintPurchaseOrders(['manager'])).toBe(true);
    for (const roles of [['staff'], ['accountant'], ['customer'], []]) {
      expect(projectPurchaseOrderPrintDocument(order, roles)).toBeNull();
      expect(projectPurchaseOrdersForPrint([order], roles)).toEqual([]);
    }
  });

  it('preserves unknown monetary values as null instead of coercing them to zero', () => {
    const projected = projectPurchaseOrderPrintDocument(sampleOrder(), ['manager']);
    expect(projected).not.toBeNull();
    expect(projected!.totalCost).toBeNull();
    expect(projected!.items[0].unitCost).toBeNull();
    expect(projected!.items[0].lineTotal).toBeNull();
  });

  it('uses only the selected, already-filtered orders supplied by the screen', () => {
    const orders = [sampleOrder()];
    expect(projectPurchaseOrdersForPrint(orders, ['admin']).map((order) => order.purchaseOrderNumber))
      .toEqual(['PO-20261031-000041']);
    expect(projectPurchaseOrdersForPrint([], ['admin'])).toEqual([]);
  });
});
