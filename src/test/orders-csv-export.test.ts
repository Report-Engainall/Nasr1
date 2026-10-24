import { describe, expect, it } from 'vitest';
import { buildOrdersCsv, type OrdersExportRow } from '@/lib/orders-csv-export';

const sample: OrdersExportRow = {
  order_code: '000123',
  created_at: '2026-10-24T11:30:00.000Z',
  customer: { full_name: 'شركة الأغبري' },
  status: 'pending',
  total_items: 3,
  total_amount: -12.5,
};

describe('safe orders CSV export', () => {
  it('keeps leading-zero order codes and excludes all financial columns for non-finance roles', () => {
    const csv = buildOrdersCsv([sample], false);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"000123"');
    expect(csv).toContain('"شركة الأغبري"');
    expect(csv).not.toContain('الإجمالي');
    expect(csv).not.toContain('-12.5');
  });

  it('includes validated numeric totals only when explicitly authorized by the caller', () => {
    const csv = buildOrdersCsv([sample], true);
    expect(csv).toContain('"الإجمالي"');
    expect(csv).toContain(',-12.5');
  });

  it('neutralizes spreadsheet formulas in untrusted text while preserving numeric values', () => {
    const csv = buildOrdersCsv([{
      ...sample,
      order_code: '=HYPERLINK("https://example.invalid","open")',
      customer: { full_name: '  @SUM(A1:A2)' },
      total_amount: -7,
    }], true);
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"",""open"")"');
    expect(csv).toContain('"\'  @SUM(A1:A2)"');
    expect(csv).toContain(',-7\r\n');
  });

  it('leaves malformed dates and non-finite numeric values blank instead of inventing zero', () => {
    const csv = buildOrdersCsv([{
      ...sample,
      created_at: 'not-a-date',
      total_items: Number.NaN,
      total_amount: Number.POSITIVE_INFINITY,
    }], true);
    expect(csv).toContain('""');
    expect(csv).not.toContain(',0,');
    expect(csv).not.toContain('Infinity');
  });

  it('returns headers only for a genuine empty dataset', () => {
    const csv = buildOrdersCsv([], false);
    expect(csv.split('\r\n')).toHaveLength(2);
    expect(csv).toContain('"رقم الطلب"');
  });
});
