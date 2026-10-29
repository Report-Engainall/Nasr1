import { describe, expect, it } from 'vitest';
import { buildPriceGridCsv, parsePriceGridCsv } from '@/lib/price-grid-csv';

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

describe('price grid CSV export', () => {
  it('exports a UTF-8 BOM CSV with stable columns, exact leading-zero code bytes and decimal precision', () => {
    const csv = buildPriceGridCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"00001234"');
    expect(csv).toContain('"100.00","90.50","95.00","110.25"');
    expect(csv).toContain('"سكر أبيض، فاخر"');
    expect(csv).toContain('"12.125","1.125","11.000","4","2"');
    expect(csv).toContain('\r\n');
  });

  it('imports by exact item code and preserves leading-zero identifiers while producing drafts only', () => {
    const csv = buildPriceGridCsv([row]);
    const result = parsePriceGridCsv(csv, [row]);
    expect(result.itemCount).toBe(1);
    expect(result.drafts[row.id]).toEqual({ basePrice: '100', wholesaleOfWholesale: '90.5', wholesale: '95', retail: '110.25' });
  });

  it('rejects unknown or duplicate product codes and invalid precision without partial import', () => {
    const csv = buildPriceGridCsv([row]);
    expect(() => parsePriceGridCsv(csv.replace('"00001234"', '"00009999"'), [row])).toThrow(/أكواد غير موجودة/);
    const records = csv.split('\r\n');
    expect(() => parsePriceGridCsv(records[0] + '\r\n' + records[1] + '\r\n' + records[1] + '\r\n', [row])).toThrow(/مكرر/);
    expect(() => parsePriceGridCsv(csv.replace('"90.50"', '"90.505"'), [row])).toThrow(/قيمة سعر غير صالحة/);
  });

  it('quotes delimiters and blocks spreadsheet formula execution in untrusted text fields', () => {
    const csv = buildPriceGridCsv([{ ...row, item_code: '=HYPERLINK("https://evil.invalid","open")', name: '+CMD|payload' }]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://evil.invalid\"\",\"\"open\"\")\"");
    expect(csv).toContain("\"'+CMD|payload\"");
    expect(csv).toContain("'=HYPERLINK");
  });
  it('round-trips quoted delimiters, escaped quotes, and embedded newlines without shifting price columns', () => {
    const richRow = { ...row, name: 'شركة "الأغبري"، فرع 2\nالمخزن الخلفي' };
    const csv = buildPriceGridCsv([richRow]);
    const parsed = parsePriceGridCsv(csv, [richRow]);
    expect(parsed.itemCount).toBe(1);
    expect(parsed.drafts[row.id]).toEqual({
      basePrice: '100', wholesaleOfWholesale: '90.5', wholesale: '95', retail: '110.25',
    });
  });

  it('rejects malformed quote boundaries instead of silently normalizing price data', () => {
    const csv = buildPriceGridCsv([row]);
    expect(() => parsePriceGridCsv(csv.replace('"00001234"', '0000"1234'), [row]))
      .toThrow(/علامة اقتباس داخل حقل غير مقتبس/);
    expect(() => parsePriceGridCsv(csv.replace('"90.50"', '"90.50"trailing'), [row]))
      .toThrow(/نص غير مسموح به بعد إغلاق علامة الاقتباس/);

    const rowStart = csv.indexOf('"aef00000-0000-4000-8000-000000000001"');
    const truncated = csv.slice(0, rowStart) + '"aef00000-0000-4000-8000-000000000001';
    expect(() => parsePriceGridCsv(truncated, [row]))
      .toThrow(/حقل نصي غير مغلق بعلامة اقتباس/);
  });

  it('preserves valid negative numeric stock values without treating them as untrusted formula text', () => {
    const csv = buildPriceGridCsv([{
      ...row,
      quantity_on_hand_total: -1.25,
      quantity_available_total: -2.5,
    }]);
    expect(csv).toContain('"110.25","-1.250","1.125","-2.500","4","2"');
    expect(csv).not.toContain('"\'-1.250"');
    expect(csv).not.toContain('"\'-2.500"');
  });

  it('emits the approved CSV schema only, excluding extra cost, margin, warehouse, and foreign-tenant fields', () => {
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

    const csv = buildPriceGridCsv([untrustedRuntimeRow]);
    const [header, data] = csv.replace(/^\uFEFF/, '').trimEnd().split(/\r?\n/);

    expect(header?.split(',')).toHaveLength(14);
    expect(data?.split(',')).toHaveLength(14);
    expect(data).toContain('"00001234"');
    expect(data).toContain('"100.00","90.50","95.00","110.25"');

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
      expect(csv).not.toContain(sentinel);
    }
  });

});
