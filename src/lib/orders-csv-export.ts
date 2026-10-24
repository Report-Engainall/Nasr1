export type OrdersExportRow = {
  order_code?: unknown;
  created_at?: unknown;
  status?: unknown;
  total_items?: unknown;
  total_amount?: unknown;
  customer?: { full_name?: unknown } | null;
};

const FORMULA_PREFIX = /^[\u0000-\u0020\uFEFF]*[=+\-@]/;

function safeText(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value).replace(/\0/g, '');
  // Text fields must not become spreadsheet formulas when opened in Excel/LibreOffice.
  return FORMULA_PREFIX.test(text) ? "'" + text : text;
}

function csvText(value: unknown): string {
  return '"' + safeText(value).replace(/"/g, '""') + '"';
}

function csvNumber(value: unknown, integerOnly = false): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (integerOnly && !Number.isSafeInteger(value)) return '';
  return String(value);
}

function dateValue(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') return '';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  pending: 'بانتظار التأكيد',
  confirmed: 'معتمد',
  processing: 'قيد التجهيز',
  shipped: 'تم الشحن',
  delivered: 'تم التسليم',
  cancelled: 'ملغي',
  new: 'جديد',
  received: 'تم الاستلام',
  reviewing: 'قيد المراجعة',
  returned: 'معاد للتعديل',
  approved: 'معتمد',
  preparing: 'قيد التجهيز',
  prepared: 'تم التجهيز',
  dispatched: 'خرج للتسليم',
  rejected: 'مرفوض',
  invoiced: 'حوّل إلى فاتورة',
};

const BASE_HEADERS = ['رقم الطلب', 'تاريخ الإنشاء (UTC)', 'العميل', 'الحالة', 'عدد الأصناف'];
const AMOUNT_HEADER = 'الإجمالي';

/**
 * Builds a tenant-authorized CSV projection. Financial columns are deliberately omitted
 * unless the caller has independently established a finance-capable staff role.
 * Text values are formula-safe; numeric values remain numeric, including legitimate negatives.
 */
export function buildOrdersCsv(rows: readonly OrdersExportRow[], includeAmounts: boolean): string {
  const headers = includeAmounts ? [...BASE_HEADERS, AMOUNT_HEADER] : BASE_HEADERS;
  const lines = [headers.map(csvText).join(',')];

  for (const order of rows) {
    const status = typeof order.status === 'string'
      ? STATUS_LABELS[order.status] ?? order.status
      : '';
    const cells = [
      csvText(order.order_code),
      csvText(dateValue(order.created_at)),
      csvText(order.customer?.full_name),
      csvText(status),
      csvNumber(order.total_items, true),
    ];
    if (includeAmounts) cells.push(csvNumber(order.total_amount));
    lines.push(cells.join(','));
  }

  // BOM keeps Arabic headers readable in common spreadsheet applications.
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}
