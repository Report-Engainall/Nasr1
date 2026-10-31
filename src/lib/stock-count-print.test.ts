import { describe, expect, it } from 'vitest';
import type { InventoryStockCountLine, InventoryStockCountSession } from '@/lib/api';
import { projectStockCountPrintDocument } from '@/lib/stock-count-print';

const session: InventoryStockCountSession = {
  id: 'PRIVATE-SESSION-ID',
  organization_id: 'PRIVATE-TENANT-ID',
  warehouse_id: 'PRIVATE-WAREHOUSE-ID',
  status: 'open',
  idempotency_key: 'PRIVATE-IDEMPOTENCY-KEY',
  notes: 'PRIVATE-SESSION-NOTE',
  started_by: 'PRIVATE-STARTED-BY',
  started_at: '2026-10-31T09:00:00.000Z',
  total_lines: 2,
  counted_lines: 1,
  completed_by: null,
  completed_at: null,
  cancelled_by: null,
  cancelled_at: null,
  cancellation_reason: 'PRIVATE-CANCELLATION-REASON',
};

const lines: InventoryStockCountLine[] = [
  {
    id: 'PRIVATE-LINE-ID',
    organization_id: 'PRIVATE-TENANT-ID',
    session_id: 'PRIVATE-SESSION-ID',
    product_id: 'PRIVATE-PRODUCT-ID',
    product_code: '00001025',
    product_name: 'زيت نباتي',
    unit: 'كرتون',
    expected_quantity: 10,
    expected_reserved_quantity: 2,
    expected_last_movement_at: '2026-10-30T11:00:00.000Z',
    counted_quantity: 7,
    counted_at: '2026-10-31T09:30:00.000Z',
    completed_quantity: null,
    variance: -3,
    completed_at: null,
  },
  {
    id: 'PRIVATE-LINE-UNCOUNTED-ID',
    organization_id: 'PRIVATE-TENANT-ID',
    session_id: 'PRIVATE-SESSION-ID',
    product_id: 'PRIVATE-PRODUCT-UNCOUNTED-ID',
    product_code: '00001026',
    product_name: 'سكر',
    unit: null,
    expected_quantity: 0,
    expected_reserved_quantity: 0,
    expected_last_movement_at: null,
    counted_quantity: null,
    counted_at: null,
    completed_quantity: null,
    variance: null,
    completed_at: null,
  },
];

describe('stock-count print projection', () => {
  it('projects an exact operational allowlist and preserves leading-zero item codes', () => {
    const document = projectStockCountPrintDocument(session, lines, ' المستودع الرئيسي ', true);
    expect(document).not.toBeNull();
    expect(Object.keys(document ?? {}).sort()).toEqual([
      'countedLines', 'items', 'startedAt', 'statusLabel', 'totalLines', 'warehouseName',
    ].sort());
    expect(Object.keys(document!.items[0]).sort()).toEqual([
      'countedQuantity', 'expectedQuantity', 'itemCode', 'productName',
      'reservedQuantity', 'unit', 'variance',
    ].sort());
    expect(document!.warehouseName).toBe('المستودع الرئيسي');
    expect(document!.items[0].itemCode).toBe('00001025');
    expect(document!.countedLines).toBe(1);
    expect(document!.totalLines).toBe(2);
  });

  it('excludes session, tenant, warehouse, product, line, actor, note and financial sentinels', () => {
    const serialized = JSON.stringify(projectStockCountPrintDocument(session, lines, 'المستودع الرئيسي', true));
    for (const privateValue of [
      'PRIVATE-SESSION-ID',
      'PRIVATE-TENANT-ID',
      'PRIVATE-WAREHOUSE-ID',
      'PRIVATE-IDEMPOTENCY-KEY',
      'PRIVATE-SESSION-NOTE',
      'PRIVATE-STARTED-BY',
      'PRIVATE-CANCELLATION-REASON',
      'PRIVATE-LINE-ID',
      'PRIVATE-LINE-UNCOUNTED-ID',
      'PRIVATE-PRODUCT-ID',
      'PRIVATE-PRODUCT-UNCOUNTED-ID',
      '2026-10-30T11:00:00.000Z',
      'PRIVATE-COST',
      'PRIVATE-MARGIN',
    ]) expect(serialized).not.toContain(privateValue);
  });

  it('keeps missing counts and their variance blank rather than creating a zero', () => {
    const document = projectStockCountPrintDocument(session, lines, 'المستودع الرئيسي', true);
    expect(document!.items[1].countedQuantity).toBeNull();
    expect(document!.items[1].variance).toBeNull();
    expect(document!.items[1].expectedQuantity).toBe(0);
  });

  it('uses only the persisted count, recalculating variance from the saved value', () => {
    const document = projectStockCountPrintDocument(session, lines, 'المستودع الرئيسي', true);
    expect(document!.items[0].countedQuantity).toBe(7);
    expect(document!.items[0].variance).toBe(-3);
  });

  it('returns no printable document to non-staff users or when the warehouse name is unavailable', () => {
    expect(projectStockCountPrintDocument(session, lines, 'المستودع الرئيسي', false)).toBeNull();
    expect(projectStockCountPrintDocument(session, lines, null, true)).toBeNull();
    expect(projectStockCountPrintDocument(session, lines, '   ', true)).toBeNull();
  });
});
