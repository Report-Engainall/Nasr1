export type CustomerPaymentFilterPayment = {
  id?: string;
  invoice_id: string;
  amount: number | string;
  paid_at?: string;
};

export type CustomerPaymentFilterInvoice = {
  id: string;
  invoice_number?: string;
  currency?: string;
};

export type CustomerPaymentHistoryFilterInput = {
  payments: readonly CustomerPaymentFilterPayment[];
  invoices: readonly CustomerPaymentFilterInvoice[];
  search: string;
  paidFrom?: string;
  paidThrough?: string;
};

export type CustomerPaymentHistoryFilterResult = {
  items: CustomerPaymentFilterPayment[];
  active: boolean;
  error: string | null;
};

const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeCustomerPaymentSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(ARABIC_MARKS, "")
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) =>
      String(digit.charCodeAt(0) >= 0x06f0
        ? digit.charCodeAt(0) - 0x06f0
        : digit.charCodeAt(0) - 0x0660),
    )
    .replace(/[\u066c,]/g, "")
    .replace(/[\u066b]/g, ".")
    .toLocaleLowerCase("ar-YE")
    .trim();
}

function localDateBoundary(value: string, endExclusive = false): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1000) return null;
  const parsed = new Date(year, month - 1, day);
  if (parsed.getFullYear() !== year ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day) return null;
  if (endExclusive) parsed.setDate(parsed.getDate() + 1);
  return parsed.getTime();
}

function searchableAmount(value: number | string): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "";
  return [
    String(value),
    String(amount),
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 }).format(amount),
    new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 3 }).format(amount),
  ].join(" ");
}

/**
 * Filters only the bounded payment rows returned by the authorized account-statement
 * RPC. Amount/currency search is intentionally unavailable when the linked invoice
 * is outside the server-provided invoice detail window.
 */
export function filterCustomerPaymentHistory(
  input: CustomerPaymentHistoryFilterInput,
): CustomerPaymentHistoryFilterResult {
  const active = Boolean(input.search.trim() || input.paidFrom || input.paidThrough);
  const from = input.paidFrom ? localDateBoundary(input.paidFrom) : null;
  const through = input.paidThrough ? localDateBoundary(input.paidThrough, true) : null;

  if ((input.paidFrom && from === null) || (input.paidThrough && through === null)) {
    return { items: [], active, error: "تاريخ المرشح غير صالح؛ اختر تاريخاً صحيحاً." };
  }
  if (from !== null && through !== null && from >= through) {
    return { items: [], active, error: "تاريخ البداية يجب ألا يأتي بعد تاريخ النهاية." };
  }

  const invoiceById = new Map(input.invoices.map((invoice) => [invoice.id, invoice]));
  const term = normalizeCustomerPaymentSearch(input.search);
  const items = input.payments.filter((payment) => {
    if (from !== null || through !== null) {
      if (!payment.paid_at) return false;
      const paidAt = Date.parse(payment.paid_at);
      if (!Number.isFinite(paidAt) ||
          (from !== null && paidAt < from) ||
          (through !== null && paidAt >= through)) return false;
    }

    if (!term) return true;
    const invoice = invoiceById.get(payment.invoice_id);
    const searchable = [
      invoice?.invoice_number ?? "",
      payment.paid_at ?? "",
      payment.paid_at?.slice(0, 10) ?? "",
      ...(invoice ? [searchableAmount(payment.amount), invoice.currency ?? ""] : []),
    ].map(normalizeCustomerPaymentSearch);
    return searchable.some((value) => value.includes(term));
  });

  return { items, active, error: null };
}
