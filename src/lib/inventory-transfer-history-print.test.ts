import { describe, expect, it } from 'vitest';
import type { InventoryTransferHistoryRow } from '@/lib/api';
import { projectInventoryTransferPrintRow } from '@/lib/inventory-transfer-history-print';

const source = {
  id: 'PRIVATE-TRANSFER-ID',
  organization_id: 'PRIVATE-ORGANIZATION-ID',
  product_id: 'PRIVATE-PRODUCT-ID',
  source_warehouse_id: 'PRIVATE-SOURCE-WAREHOUSE-ID',
  destination_warehouse_id: 'PRIVATE-DESTINATION-WAREHOUSE-ID',
  quantity: 12,
  reason: 'إعادة توزيع بين المستودعين',
  created_by: 'PRIVATE-ACTOR-UUID',
  created_at: '2026-10-31T09:30:00.000Z',
  batch_id: 'PRIVATE-BATCH-ID',
  batch_line_count: 3,
  product_name: 'زيت نباتي',
  item_code: '00001025',
  unit: 'كرتون',
  source_warehouse_name: 'المستودع الرئيسي',
  destination_warehouse_name: 'مستودع الفرع',
  unit_cost: 'PRIVATE-COST',
  margin: 'PRIVATE-MARGIN',
} as unknown as InventoryTransferHistoryRow;

describe('inventory transfer print field allowlist', () => {
  it('prints only operational fields and keeps leading-zero item codes', () => {
    const projected = projectInventoryTransferPrintRow(source);
    expect(Object.keys(projected).sort()).toEqual([
      'created_at', 'item_code', 'product_name', 'unit', 'source_warehouse_name',
      'destination_warehouse_name', 'quantity', 'transfer_type', 'reason',
    ].sort());
    expect(projected.item_code).toBe('00001025');
    expect(projected.transfer_type).toBe('دفعة متعددة (3 أصناف)');
  });

  it('excludes tenant, record, warehouse, actor and financial identifiers/values', () => {
    const serialized = JSON.stringify(projectInventoryTransferPrintRow(source));
    for (const secret of [
      'PRIVATE-TRANSFER-ID', 'PRIVATE-ORGANIZATION-ID', 'PRIVATE-PRODUCT-ID',
      'PRIVATE-SOURCE-WAREHOUSE-ID', 'PRIVATE-DESTINATION-WAREHOUSE-ID',
      'PRIVATE-ACTOR-UUID', 'PRIVATE-BATCH-ID', 'PRIVATE-COST', 'PRIVATE-MARGIN',
    ]) expect(serialized).not.toContain(secret);
  });
});
