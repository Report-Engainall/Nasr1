import { describe, expect, it } from 'vitest';
import { buildInventoryTransferHistoryWorkbookXlsx, type InventoryTransferExportRow } from '@/lib/inventory-transfer-history-xlsx';

function unzipStore(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const files = new Map<string, string>();
  let offset = 0;
  while (offset + 30 < bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    if (view.getUint16(offset + 8, true) !== 0) throw new Error('Expected stored ZIP entry.');
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    files.set(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)), decoder.decode(bytes.slice(dataStart, dataStart + size)));
    offset = dataStart + size;
  }
  return files;
}

const unsafe = {
  created_at: '2026-10-31T09:30:00.000Z',
  item_code: '00001025',
  product_name: 'زيت نباتي',
  unit: 'كرتون',
  source_warehouse_name: 'المستودع الرئيسي',
  destination_warehouse_name: 'مستودع الفرع',
  quantity: 12,
  batch_id: 'PRIVATE-BATCH-ID',
  batch_line_count: 3,
  reason: 'إعادة توزيع بين المستودعين',
  id: 'PRIVATE-TRANSFER-ID',
  organization_id: 'PRIVATE-ORGANIZATION-ID',
  product_id: 'PRIVATE-PRODUCT-ID',
  source_warehouse_id: 'PRIVATE-SOURCE-WAREHOUSE-ID',
  destination_warehouse_id: 'PRIVATE-DESTINATION-WAREHOUSE-ID',
  created_by: 'PRIVATE-ACTOR-UUID',
  unit_cost: 'PRIVATE-COST',
  margin: 'PRIVATE-MARGIN',
} as unknown as InventoryTransferExportRow;

const filters = {
  generated_at: '2026-10-31T10:00:00.000Z',
  search: '00001025',
  warehouse: 'المستودع الرئيسي',
  date_from: '2026-10-01',
  date_to: '2026-10-31',
  source_limit: 500,
};

describe('inventory transfer XLSX role-safe template', () => {
  it('writes the exact 10-column warehouse movement template and Arabic summary', () => {
    const files = unzipStore(buildInventoryTransferHistoryWorkbookXlsx([unsafe], filters));
    const workbook = files.get('xl/workbook.xml') ?? '';
    const details = files.get('xl/worksheets/sheet1.xml') ?? '';
    const summary = files.get('xl/worksheets/sheet2.xml') ?? '';
    expect(workbook).toContain('سجل التحويلات');
    expect(workbook).toContain('ملخص التصدير');
    for (const header of ['التاريخ','كود الصنف','اسم الصنف','الوحدة','مستودع المصدر','مستودع الوجهة','الكمية','نوع التحويل','عدد أصناف الدفعة','السبب']) {
      expect(details).toContain(header);
    }
    expect((details.match(/<c r="[A-J]1"/g) ?? [])).toHaveLength(10);
    expect(details).toContain('00001025');
    expect(details).toContain('دفعة متعددة');
    expect(summary).toContain('نطاق البيانات');
    expect(summary).toContain('الحقول المالية');
  });

  it('excludes all internal IDs and financial fields from both worksheets', () => {
    const files = unzipStore(buildInventoryTransferHistoryWorkbookXlsx([unsafe], filters));
    const output = (files.get('xl/worksheets/sheet1.xml') ?? '') + (files.get('xl/worksheets/sheet2.xml') ?? '');
    for (const secret of [
      'PRIVATE-TRANSFER-ID','PRIVATE-ORGANIZATION-ID','PRIVATE-PRODUCT-ID',
      'PRIVATE-SOURCE-WAREHOUSE-ID','PRIVATE-DESTINATION-WAREHOUSE-ID',
      'PRIVATE-ACTOR-UUID','PRIVATE-BATCH-ID','PRIVATE-COST','PRIVATE-MARGIN',
    ]) expect(output).not.toContain(secret);
  });

  it('rejects invalid dates and incomplete source bounds before producing a workbook', () => {
    expect(() => buildInventoryTransferHistoryWorkbookXlsx([unsafe], { ...filters, generated_at: 'invalid' })).toThrow(/وقت إنشاء ملف التحويلات غير صالح/);
    expect(() => buildInventoryTransferHistoryWorkbookXlsx([unsafe], { ...filters, source_limit: 0 })).toThrow(/عدد صفوف التحويلات/);
  });
});
