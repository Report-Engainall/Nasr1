import { describe, expect, it } from 'vitest';
import { buildPriceGridCsv } from '@/lib/price-grid-csv';

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
};

describe('price grid CSV export', () => {
  it('exports a UTF-8 BOM CSV with stable columns, exact leading-zero code bytes and decimal precision', () => {
    const csv = buildPriceGridCsv([row]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"00001234"');
    expect(csv).toContain('"100.00","90.50","95.00","110.25"');
    expect(csv).toContain('"سكر أبيض، فاخر"');
    expect(csv).toContain('\r\n');
  });

  it('quotes delimiters and blocks spreadsheet formula execution in untrusted text fields', () => {
    const csv = buildPriceGridCsv([{ ...row, item_code: '=HYPERLINK("https://evil.invalid","open")', name: '+CMD|payload' }]);
    expect(csv).toContain("\"'=HYPERLINK(\"\"https://evil.invalid\"\",\"\"open\"\")\"");
    expect(csv).toContain('"+CMD|payload"');
    expect(csv).toContain("'=HYPERLINK");
  });
});
