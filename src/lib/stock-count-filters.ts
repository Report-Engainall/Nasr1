import type { InventoryStockCountLine } from './api';

export type StockCountLineFilter = 'all' | 'counted' | 'uncounted' | 'variance';
export type StockCountLineFilterCriteria = { search: string; status: StockCountLineFilter };

const ARABIC_DIGITS: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '۰': '0', '۱': '1', '۲': '2', '۳': '3', '۴': '4',
  '۵': '5', '۶': '6', '۷': '7', '۸': '8', '۹': '9',
};

export function normalizeStockCountSearch(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[ئىي]/g, 'ي')
    .replace(/ـ/g, '')
    .replace(/[٠-٩۰-۹]/g, (digit) => ARABIC_DIGITS[digit] ?? digit)
    .toLocaleLowerCase('ar')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Filters only the visible presentation; totals, finalization, export and print use the full session. */
export function filterStockCountLines(
  lines: readonly InventoryStockCountLine[],
  filters: StockCountLineFilterCriteria,
): InventoryStockCountLine[] {
  const tokens = normalizeStockCountSearch(filters.search).split(' ').filter(Boolean);
  return lines.filter((line) => {
    const counted = line.counted_quantity !== null;
    if (filters.status === 'counted' && !counted) return false;
    if (filters.status === 'uncounted' && counted) return false;
    if (filters.status === 'variance' && (
      line.counted_quantity === null ||
      Math.abs(line.counted_quantity - line.expected_quantity) < 0.0005
    )) return false;
    if (tokens.length) {
      const text = normalizeStockCountSearch([line.product_code, line.product_name, line.unit ?? ''].join(' '));
      if (!tokens.every((token) => text.includes(token))) return false;
    }
    return true;
  });
}
