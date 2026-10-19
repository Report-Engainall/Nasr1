import type { ProductPriceGridRow } from '@/lib/api';

const CSV_HEADERS = [
  'معرف الصنف',
  'كود الصنف',
  'اسم الصنف',
  'الوحدة',
  'الحالة',
  'السعر الأساسي',
  'جملة الجملة',
  'الجملة',
  'التجزئة',
] as const;

function spreadsheetSafeText(value: string): string {
  // Prefix only formula-shaped text; quote escaping alone does not prevent Excel formula injection.
  return /^\s*[=+\-@]/.test(value) ? "'" + value : value;
}

function csvCell(value: string | number | boolean): string {
  const normalized = typeof value === 'string' ? spreadsheetSafeText(value) : String(value);
  return '"' + normalized.replace(/"/g, '""') + '"';
}

/**
 * Export only the server-read, saved grid. Do not read pending UI drafts into financial exports.
 * String identifiers are preserved in the CSV byte content; import code columns as Text in Excel.
 */
export function buildPriceGridCsv(rows: readonly ProductPriceGridRow[]): string {
  const output = [CSV_HEADERS.map(csvCell).join(',')];
  for (const row of rows) {
    const values: (string | number | boolean)[] = [
      row.id,
      row.item_code,
      row.name,
      row.unit,
      row.is_active ? 'نشط' : 'موقوف',
      Number(row.base_price).toFixed(2),
      Number(row.price_wholesale_of_wholesale).toFixed(2),
      Number(row.price_wholesale).toFixed(2),
      Number(row.price_retail).toFixed(2),
    ];
    output.push(values.map(csvCell).join(','));
  }
  return '\uFEFF' + output.join('\r\n') + '\r\n';
}

export function downloadPriceGridCsv(rows: readonly ProductPriceGridRow[]): void {
  if (!rows.length || typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const file = new Blob([buildPriceGridCsv(rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  anchor.href = url;
  anchor.download = 'aghbari-price-grid-' + date + '.csv';
  anchor.hidden = true;
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
