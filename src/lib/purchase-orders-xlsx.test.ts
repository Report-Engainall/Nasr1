import { describe, expect, it } from 'vitest';
import type { PurchaseOrder } from '@/lib/purchase-orders';
import { buildPurchaseOrdersWorkbookXlsx } from '@/lib/purchase-orders-xlsx';

function sampleOrders(): PurchaseOrder[] {
  return [
    {
      id: 'po-1',
      organization_id: 'org-private-must-not-export',
      purchase_order_number: 'PO-20261019-000001',
      supplier_id: 'supplier-private-id',
      supplier_name: 'مورد موثوق',
      supplier_code: 'SUP-0007',
      warehouse_id: 'warehouse-private-id',
      warehouse_name: 'المخزن الرئيسي',
      status: 'draft',
      notes: '=HYPERLINK("https://evil.invalid","open")',
      total_cost: null,
      created_by: 'private-user-id',
      submitted_by: null,
      submitted_at: null,
      cancelled_by: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: '2026-10-19T09:00:00Z',
      updated_at: '2026-10-19T09:00:00Z',
      items: [
        {
          id: 'line-private-id',
          product_id: 'product-private-id',
          item_code: '0000125',
          product_name: '+CMD|payload',
          unit: 'كرتون',
          quantity_ordered: 2,
          quantity_received: 0,
          remaining_quantity: 2,
          unit_cost: null,
          line_total: null,
        },
      ],
    },
    {
      id: 'po-2',
      organization_id: 'org-private-must-not-export',
      purchase_order_number: 'PO-20261019-000002',
      supplier_id: 'supplier-private-id',
      supplier_name: 'مورد ثانٍ',
      supplier_code: 'SUP-0008',
      warehouse_id: 'warehouse-private-id',
      warehouse_name: 'مخزن فرعي',
      status: 'received',
      notes: null,
      total_cost: 75,
      created_by: 'private-user-id',
      submitted_by: 'private-user-id',
      submitted_at: '2026-10-20T09:00:00Z',
      cancelled_by: null,
      cancelled_at: null,
      cancellation_reason: null,
      created_at: '2026-10-19T10:00:00Z',
      updated_at: '2026-10-20T09:00:00Z',
      items: [
        {
          id: 'line-2',
          product_id: 'product-private-id',
          item_code: '0000126',
          product_name: 'زيت نباتي',
          unit: 'علبة',
          quantity_ordered: 3,
          quantity_received: 3,
          remaining_quantity: 0,
          unit_cost: 25,
          line_total: 75,
        },
      ],
    },
  ];
}

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

describe('purchase order XLSX export', () => {
  it('creates three readable sheets for the applied filter, order headers and item lines', () => {
    const files = unzipStore(buildPurchaseOrdersWorkbookXlsx(sampleOrders(), 'كل الحالات'));
    const workbook = files.get('xl/workbook.xml') ?? '';
    const summary = files.get('xl/worksheets/sheet1.xml') ?? '';
    const orders = files.get('xl/worksheets/sheet2.xml') ?? '';
    const lines = files.get('xl/worksheets/sheet3.xml') ?? '';

    expect(workbook).toContain('ملخص التصدير');
    expect(workbook).toContain('أوامر الشراء');
    expect(workbook).toContain('بنود الشراء');
    expect(summary).toContain('كل الحالات');
    expect(summary).toContain('السجلات المحمّلة في الشاشة');
    expect(orders).toContain('PO-20261019-000001');
    expect(orders).toContain('SUP-0007');
    expect(lines).toContain('0000125');
    expect(lines).toContain('كمية');
    expect(lines).toContain('تكلفة الوحدة');
  });

  it('keeps unknown costs blank, preserves leading zeros and escapes formula-like text as strings', () => {
    const files = unzipStore(buildPurchaseOrdersWorkbookXlsx(sampleOrders(), 'كل الحالات'));
    const orders = files.get('xl/worksheets/sheet2.xml') ?? '';
    const lines = files.get('xl/worksheets/sheet3.xml') ?? '';

    expect(orders).not.toContain('<c r="H2"');
    expect(lines).not.toContain('<c r="H2"');
    expect(lines).not.toContain('<c r="I2"');
    expect(lines).toContain('0000125');
    expect(lines).toContain('+CMD|payload');
    expect(orders).toContain('=HYPERLINK');
    expect(orders).toContain('&quot;https://evil.invalid&quot;');
    expect((orders + lines)).not.toMatch(/<f(?:\s|>)/);
    for (const privateValue of ['org-private-must-not-export', 'supplier-private-id', 'warehouse-private-id', 'private-user-id', 'product-private-id', 'line-private-id']) {
      expect(orders + lines).not.toContain(privateValue);
    }
  });

  it('rejects empty, duplicate and inconsistent source rows instead of exporting an unverifiable list', () => {
    expect(() => buildPurchaseOrdersWorkbookXlsx([], 'كل الحالات')).toThrow(/لا توجد أوامر شراء/);
    const duplicates = sampleOrders();
    duplicates[1] = { ...duplicates[1], id: duplicates[0].id };
    expect(() => buildPurchaseOrdersWorkbookXlsx(duplicates, 'كل الحالات')).toThrow(/أوامر مكررة/);
    const inconsistent = sampleOrders();
    inconsistent[0] = { ...inconsistent[0], items: [{ ...inconsistent[0].items[0], quantity_received: 4 }] };
    expect(() => buildPurchaseOrdersWorkbookXlsx(inconsistent, 'كل الحالات')).toThrow(/كميات بند/);
  });
});
