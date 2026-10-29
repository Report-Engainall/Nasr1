import { describe, expect, it } from 'vitest';
import { buildPriceGridXlsx } from '@/lib/price-grid-xlsx';
import { buildPriceGridCsv, parsePriceGridRecords } from '@/lib/price-grid-csv';
import { parseXlsxFirstWorksheet } from '@/lib/unified-import';

async function blobBytes(blob: Blob): Promise<Uint8Array> {
  const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => reader.result instanceof ArrayBuffer ? resolve(reader.result) : reject(new Error('Failed to read Blob bytes'));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read Blob bytes'));
    reader.readAsArrayBuffer(blob);
  });
  return new Uint8Array(buffer);
}

const row = {
  id: 'aef00000-0000-4000-8000-000000000001',
  item_code: '00001234',
  name: 'سكر أبيض، فاخر',
  unit: 'كرتون',
  is_active: true,
  base_price: 100,
  price_wholesale_of_wholesale: 90.5,
  price_wholesale: 95,
  price_retail: 110.25,
  quantity_on_hand_total: 12.125,
  quantity_reserved_total: 1.125,
  quantity_available_total: 11,
  reorder_point_total: 4,
  inventory_warehouse_count: 2,
};

describe('price grid XLSX workbook', () => {
  it('round-trips a real stored ZIP/XLSX workbook through the hardened XLSX reader and shared price validation', async () => {
    const workbook = buildPriceGridXlsx([row]);
    expect(workbook.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const records: string[][] = [];
    const parsed = await parseXlsxFirstWorksheet(workbook, values => { records.push(values); });
    expect(parsed.worksheetName).toBe('شبكة الأسعار');
    expect(records).toHaveLength(2);
    expect(records[1][1]).toBe('00001234');
    expect(records[1].slice(5)).toEqual(['100.00', '90.50', '95.00', '110.25', '12.125', '1.125', '11.000', '4', '2']);
    const imported = parsePriceGridRecords(records, [row]);
    expect(imported.itemCount).toBe(1);
    expect(imported.drafts[row.id]).toEqual({ basePrice: '100', wholesaleOfWholesale: '90.5', wholesale: '95', retail: '110.25' });
    expect(Object.values(imported.drafts[row.id]).length).toBe(4); // Stock columns are export-only and never become stock update drafts.
  });

  it('writes hostile identifiers and labels as inline text, never formula cells', async () => {
    const hostile = { ...row, item_code: '=HYPERLINK("https://invalid.example","x")', name: '+SUM(1,1)' };
    const bytes = await blobBytes(buildPriceGridXlsx([hostile]));
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('t="inlineStr"');
    expect(text).not.toContain('<f>');
    expect(text).toContain('&quot;https://invalid.example&quot;');
  });

  it('keeps CSV and XLSX stock metrics identical for negative, zero, and positive values', async () => {
    const cases = [
      { ...row, item_code: 'PARITY-NEG', name: 'Negative stock', quantity_on_hand_total: -1.25, quantity_reserved_total: 0, quantity_available_total: -2.5, reorder_point_total: 0, inventory_warehouse_count: 0 },
      { ...row, item_code: 'PARITY-ZERO', name: 'Zero stock', quantity_on_hand_total: 0, quantity_reserved_total: 0, quantity_available_total: 0, reorder_point_total: 0, inventory_warehouse_count: 0 },
      { ...row, item_code: 'PARITY-POS', name: 'Positive stock', quantity_on_hand_total: 3.125, quantity_reserved_total: 1.125, quantity_available_total: 2, reorder_point_total: 4, inventory_warehouse_count: 2 },
    ];
    const csvRows = buildPriceGridCsv(cases)
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n')
      .map(line => line.split(',').map(cell => cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell));
    const workbook = buildPriceGridXlsx(cases);
    const workbookText = new TextDecoder().decode(await blobBytes(workbook));
    // Assert actual OOXML numeric cells, not only parser read-back (which also returns text cells as strings).
    for (const [cell, value] of [
      ['J2', '-1.250'], ['K2', '0.000'], ['L2', '-2.500'],
      ['J3', '0.000'], ['K3', '0.000'], ['L3', '0.000'],
      ['J4', '3.125'], ['K4', '1.125'], ['L4', '2.000'],
    ]) {
      expect(workbookText).toContain('<c r="' + cell + '" t="n"><v>' + value + '</v></c>');
    }
    const xlsxRecords: string[][] = [];
    await parseXlsxFirstWorksheet(workbook, values => { xlsxRecords.push(values); });

    const csvStock = csvRows.slice(1).map(record => record.slice(9, 14));
    const xlsxStock = xlsxRecords.slice(1).map(record => record.slice(9, 14));
    expect(xlsxStock).toEqual(csvStock);
    expect(xlsxStock).toEqual([
      ['-1.250', '0.000', '-2.500', '0', '0'],
      ['0.000', '0.000', '0.000', '0', '0'],
      ['3.125', '1.125', '2.000', '4', '2'],
    ]);
  });

  it('rejects negative prices, thresholds, warehouse counts and malformed numeric values in both exports', () => {
    const invalidCases = [
      { ...row, base_price: -1 },
      { ...row, price_wholesale_of_wholesale: -0.01 },
      { ...row, reorder_point_total: -1 },
      { ...row, inventory_warehouse_count: -1 },
      { ...row, quantity_on_hand_total: Number.NaN },
      { ...row, quantity_available_total: -1_000_000_000_000 },
    ];
    for (const invalid of invalidCases) {
      expect(() => buildPriceGridCsv([invalid])).toThrow();
      expect(() => buildPriceGridXlsx([invalid])).toThrow();
    }
  });

  it('keeps unknown stock measures blank in CSV and XLSX while preserving zero-padded item codes', async () => {
    const unknownStock = {
      ...row,
      item_code: '00000007',
      quantity_on_hand_total: null,
      quantity_reserved_total: null,
      quantity_available_total: null,
      reorder_point_total: null,
    };

    const csvRecords = buildPriceGridCsv([unknownStock])
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n')
      .map(line => line.split(',').map(cell => cell.startsWith('"') ? cell.slice(1, -1).replace(/""/g, '"') : cell));
    expect(csvRecords[1][1]).toBe('00000007');
    expect(csvRecords[1].slice(9)).toEqual(['', '', '', '', '2']);

    const xlsxRecords: string[][] = [];
    await parseXlsxFirstWorksheet(buildPriceGridXlsx([unknownStock]), values => { xlsxRecords.push(values); });
    expect(xlsxRecords[1][1]).toBe('00000007');
    expect(xlsxRecords[1].slice(9)).toEqual(['', '', '', '', '2']);
  });

  it('removes XML 1.0-forbidden controls from exported product text', async () => {
    const hostile = {
      ...row,
      item_code: "00\u000101234",
      name: "سكر\u0000 أبيض\u0007",
    };
    const records: string[][] = [];
    await parseXlsxFirstWorksheet(buildPriceGridXlsx([hostile]), values => { records.push(values); });
    expect(records).toHaveLength(2);
    expect(records[1][1]).toBe('0001234');
    expect(records[1][2]).toBe('سكر أبيض');
  });

  it('rejects malformed price cells using the exact same validator as CSV', async () => {
    const records: string[][] = [];
    await parseXlsxFirstWorksheet(buildPriceGridXlsx([row]), values => { records.push(values); });
    records[1][5] = '-1';
    expect(() => parsePriceGridRecords(records, [row])).toThrow(/قيمة سعر غير صالحة/);
  });

  it('emits only the approved price-grid XLSX fields, not cost, margin, or foreign-tenant metadata', async () => {
    const untrustedRuntimeRow = {
      ...row,
      organization_id: 'FOREIGN_ORGANIZATION_SENTINEL',
      warehouse_id: 'PRIVATE_WAREHOUSE_SENTINEL',
      inventory_row_id: 'PRIVATE_INVENTORY_ID_SENTINEL',
      cost_price: 'INTERNAL_COST_SENTINEL',
      purchase_price: 'INTERNAL_PURCHASE_PRICE_SENTINEL',
      unit_cost: 'INTERNAL_UNIT_COST_SENTINEL',
      profit_margin: 'INTERNAL_PROFIT_MARGIN_SENTINEL',
      gross_profit: 'INTERNAL_GROSS_PROFIT_SENTINEL',
      margin: 'INTERNAL_MARGIN_SENTINEL',
      display_price: 'DISPLAY_PRICE_SENTINEL',
      foreign_tier_price: 'FOREIGN_TIER_PRICE_SENTINEL',
      quantity_on_hand: 'RAW_ON_HAND_SENTINEL',
      quantity_reserved: 'RAW_RESERVED_SENTINEL',
    } as typeof row;

    const workbook = buildPriceGridXlsx([untrustedRuntimeRow]);
    const bytes = await blobBytes(workbook);
    const xml = new TextDecoder().decode(bytes);
    const records: string[][] = [];
    await parseXlsxFirstWorksheet(workbook, values => { records.push(values); });

    expect(records[0]).toEqual([
      'معرف الصنف', 'كود الصنف', 'اسم الصنف', 'الوحدة', 'الحالة',
      'السعر الأساسي', 'جملة الجملة', 'الجملة', 'التجزئة',
      'إجمالي الرصيد الفعلي', 'إجمالي الكمية المحجوزة', 'إجمالي المتاح',
      'إجمالي حد إعادة الطلب', 'عدد المخازن ذات الرصيد',
    ]);
    expect(records[1]).toHaveLength(14);
    expect(records[1].slice(5, 9)).toEqual(['100.00', '90.50', '95.00', '110.25']);

    for (const sentinel of [
      'FOREIGN_ORGANIZATION_SENTINEL',
      'PRIVATE_WAREHOUSE_SENTINEL',
      'PRIVATE_INVENTORY_ID_SENTINEL',
      'INTERNAL_COST_SENTINEL',
      'INTERNAL_PURCHASE_PRICE_SENTINEL',
      'INTERNAL_UNIT_COST_SENTINEL',
      'INTERNAL_PROFIT_MARGIN_SENTINEL',
      'INTERNAL_GROSS_PROFIT_SENTINEL',
      'INTERNAL_MARGIN_SENTINEL',
      'DISPLAY_PRICE_SENTINEL',
      'FOREIGN_TIER_PRICE_SENTINEL',
      'RAW_ON_HAND_SENTINEL',
      'RAW_RESERVED_SENTINEL',
    ]) {
      expect(xml).not.toContain(sentinel);
    }
  });
});
