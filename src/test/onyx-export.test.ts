import { describe, expect, it } from 'vitest';
import { BUSINESS_BRAND_NAME } from '@/lib/brand';
import { buildOnyxDetailRows, buildOnyxOrderWorkbook, ONYX_ORDER_COLUMNS, onyxOrderWorkbookFilename } from '@/lib/onyx-export';

const order = {
  orderId: '11111111-1111-4111-8111-111111111111',
  orderNumber: 'ORD-000125',
  orderStatus: 'confirmed',
  orderCreatedAt: '2026-10-15T09:30:00.000Z',
  customerCode: '000042',
  customerName: 'شركة اختبار الأغبري',
  sourceSnapshotId: '99999999-9999-4999-8999-999999999999',
  items: [{
    item_code: '000125',
    product_name_snapshot: 'سكر "برازيلي", 50ك',
    unit_snapshot: 'كرتون',
    quantity: 2,
    approved_quantity: 3,
    unit_price_snapshot: 10,
    approved_unit_price: 12.5,
  }],
};

function storedZipEntry(bytes: Uint8Array, targetPath: string): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  let offset = 0;
  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const compressedSize = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = decoder.decode(bytes.slice(nameStart, nameStart + nameLength));
    const dataStart = nameStart + nameLength + extraLength;
    if (name === targetPath) return decoder.decode(bytes.slice(dataStart, dataStart + compressedSize));
    offset = dataStart + compressedSize;
  }
  throw new Error('Missing XLSX ZIP entry: ' + targetPath);
}

describe('Onyx order workbook draft', () => {
  it('keeps the exact 27 reference columns and preserves identifier strings', () => {
    expect(ONYX_ORDER_COLUMNS).toHaveLength(27);
    const rows = buildOnyxDetailRows(order);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual([
      'رقم الصنف','اسم الصنف','الوحدة','المخزن','الكمية','ك.المجانية','السعر','رقم الدفعة',
      'تاريخ الانتهاء','رقم المستفيد','مركز التكلفة','المشروع','النشاط','رقم عرض السعر','الوحدة العددية',
      'الخصم1','الخصم2','الخصم3','نوع الخصم (1-نسبة، 2-مبلغ)','حجز الكميات','إلى تاريخ',
      'الكمية المحجوزة','البيان','الطول','العرض','الارتفاع','العدد',
    ]);
    expect(rows[1]).toHaveLength(27);
    expect(rows[1][0]).toBe('000125');
    expect(rows[1][4]).toBe(3);
    expect(rows[1][6]).toBe(12.5);
    expect(rows[1][22]).toBe('ORD-000125');
    expect(rows[1][3]).toBe('');
  });

  it('creates an XLSX ZIP package with both worksheets and customer header', () => {
    const bytes = buildOnyxOrderWorkbook(order);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const archiveText = new TextDecoder().decode(bytes);
    expect(archiveText).toContain('[Content_Types].xml');
    expect(archiveText).toContain('xl/worksheets/sheet1.xml');
    expect(archiveText).toContain('xl/worksheets/sheet2.xml');
    expect(archiveText).toContain('000125');
    expect(archiveText).toContain('شركة اختبار الأغبري');
    expect(archiveText).toContain(BUSINESS_BRAND_NAME);
    expect(archiveText).toContain('<dc:creator>' + BUSINESS_BRAND_NAME + '</dc:creator>');
    expect(archiveText).toContain('<Application>' + BUSINESS_BRAND_NAME + '</Application>');
    expect(archiveText).toContain('غير مثبت');
    expect(archiveText).toContain('inlineStr');
  });

  it('embeds the persisted central audit event ID in the final workbook header', () => {
    const auditId = '9f4c1d25-7ab9-47e1-9ac8-67f0c15b4c20';
    const bytes = buildOnyxOrderWorkbook({ ...order, exportAuditId: auditId });
    const headerXml = storedZipEntry(bytes, 'xl/worksheets/sheet2.xml');
    expect(headerXml).toContain('معرف سجل التدقيق المركزي');
    expect(headerXml).toContain(auditId);
    expect(headerXml).toContain('معرف لقطة مصدر أونكس المختارة');
    expect(headerXml).toContain(order.sourceSnapshotId);
    expect(headerXml).toContain('حالة توافق أونكس');
    expect(headerXml).toContain('غير مثبت');
  });

  it('removes XML 1.0-forbidden control characters from dirty imported cells', () => {
    const control1 = String.fromCharCode(1);
    const control2 = String.fromCharCode(2);
    const control3 = String.fromCharCode(3);
    const dirty = {
      ...order,
      orderNumber: 'ORD' + control1 + '-002',
      customerName: 'شركة' + control2 + ' الاختبار',
      items: [{
        ...order.items[0],
        product_name_snapshot: 'سكر' + control3 + ' برازيلي',
      }],
    };
    const bytes = buildOnyxOrderWorkbook(dirty);
    const detailXml = storedZipEntry(bytes, 'xl/worksheets/sheet1.xml');
    const headerXml = storedZipEntry(bytes, 'xl/worksheets/sheet2.xml');
    expect(detailXml).not.toContain(control1);
    expect(detailXml).not.toContain(control3);
    expect(headerXml).not.toContain(control1);
    expect(headerXml).not.toContain(control2);
    expect(detailXml).toContain('سكر برازيلي');
  });

  it('ignores unsupported internal cost, margin and foreign-tier values in XLSX item payloads', () => {
    const untrustedItem = {
      ...order.items[0],
      base_price: 987654.321,
      price_wholesale: 876543.219,
      price_retail: 765432.198,
      cost_price: 654321.987,
      purchase_price: 543210.876,
      unit_cost: 432109.765,
      profit_margin: 321098.654,
      gross_profit: 210987.543,
      margin: 109876.432,
    };
    const bytes = buildOnyxOrderWorkbook({
      ...order,
      items: [untrustedItem] as unknown as typeof order.items,
    });
    const detailXml = storedZipEntry(bytes, 'xl/worksheets/sheet1.xml');
    const headerXml = storedZipEntry(bytes, 'xl/worksheets/sheet2.xml');
    const row = detailXml.match(/<row r="2"[^>]*>([\s\S]*?)<\/row>/);
    expect(row).not.toBeNull();
    const numericCellRefs = [...row![1].matchAll(/<c r="([A-Z]+\d+)" t="n">/g)].map((match) => match[1]);
    expect(numericCellRefs).toEqual(["E2", "G2"]);
    const xml = detailXml + headerXml;
    for (const sentinel of [
      "987654.321", "876543.219", "765432.198", "654321.987",
      "543210.876", "432109.765", "321098.654", "210987.543", "109876.432",
    ]) {
      expect(xml).not.toContain(sentinel);
    }
    expect(xml).not.toMatch(/(?:base_price|price_wholesale|price_retail|cost_price|purchase_price|unit_cost|profit_margin|gross_profit)/i);
  });

  it('rejects invalid quantities and prices instead of emitting blank accounting cells', () => {
    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_quantity: -1 }],
    })).toThrow('قيمة الكمية غير صالحة');

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_quantity: 0 }],
    })).toThrow('كمية كل بند أكبر من صفر');

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: Number.NaN }],
    })).toThrow('قيمة سعر الوحدة غير صالحة');

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: -0.01 }],
    })).toThrow('قيمة سعر الوحدة غير صالحة');

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: '' as unknown as number }],
    })).toThrow('قيمة سعر الوحدة غير صالحة');

    expect(buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: null }],
    })[1][6]).toBe(10);

    expect(() => buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: null, unit_price_snapshot: null as unknown as number }],
    })).toThrow('قيمة سعر الوحدة غير صالحة');

    expect(buildOnyxDetailRows({
      ...order,
      items: [{ ...order.items[0], approved_unit_price: 0 }],
    })[1][6]).toBe(0);
  });

  it('rejects empty exports and sanitizes filenames', () => {
    expect(() => buildOnyxOrderWorkbook({ ...order, items: [] })).toThrow('بلا أصناف');
    expect(onyxOrderWorkbookFilename('ORD/001 2026')).toBe('Aghbari-Onyx-ORD-001-2026.xlsx');
  });
});
