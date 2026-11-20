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

export type ValidatedCustomerPaymentInvoice = {
  id: string;
  invoice_number: string;
  currency: string;
};

export type ValidatedCustomerPayment = {
  id: string;
  invoice_id: string;
  amount: number | string;
  paid_at?: string;
};

export type ValidatedCustomerPaymentHistory = {
  invoices: ValidatedCustomerPaymentInvoice[];
  payments: ValidatedCustomerPayment[];
};

const CUSTOMER_PAYMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CUSTOMER_PAYMENT_INVOICES = 200;
const MAX_CUSTOMER_PAYMENT_ROWS = 500;
const PAYMENT_AMOUNT_DECIMAL = /^\d{1,13}(?:\.\d{1,2})?$/;
const PAYMENT_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function paymentPayloadRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function validatedPaymentAmount(value: unknown): number | string | null {
  const raw = typeof value === "string"
    ? value.trim()
    : typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : "";
  if (!raw || raw.length > 16 || !PAYMENT_AMOUNT_DECIMAL.test(raw)) return null;

  try {
    const [whole, fraction = ""] = raw.split(".");
    const minorUnits = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
    if (minorUnits > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  } catch {
    return null;
  }
  return typeof value === "number" ? Number(raw) : raw;
}

/**
 * Parse the bounded, read-only customer statement projection into a minimal UI DTO.
 * Unknown fields are discarded so the payment-history page cannot accidentally
 * render invoice financials, tenant identifiers, or private metadata added later.
 */
export function parseCustomerPaymentHistoryPayload(value: unknown): ValidatedCustomerPaymentHistory {
  const payload = paymentPayloadRecord(value);
  if (!payload || !Array.isArray(payload.invoices) || !Array.isArray(payload.payments) ||
      payload.invoices.length > MAX_CUSTOMER_PAYMENT_INVOICES ||
      payload.payments.length > MAX_CUSTOMER_PAYMENT_ROWS) {
    throw new Error("أعاد الخادم تفاصيل دفعات غير مكتملة أو تجاوزت حدود القراءة.");
  }

  const invoiceIds = new Set<string>();
  const invoices = payload.invoices.map((candidate, index): ValidatedCustomerPaymentInvoice => {
    const row = paymentPayloadRecord(candidate);
    if (!row ||
        typeof row.id !== "string" || !CUSTOMER_PAYMENT_UUID.test(row.id) ||
        invoiceIds.has(row.id.toLowerCase()) ||
        typeof row.invoice_number !== "string" || !row.invoice_number.trim() ||
        row.invoice_number.trim().length > 100 ||
        typeof row.currency !== "string" || !/^[A-Z]{3}$/.test(row.currency)) {
      throw new Error("تفاصيل الفاتورة رقم " + (index + 1) + " لا تطابق عقد كشف الحساب.");
    }
    invoiceIds.add(row.id.toLowerCase());
    return {
      id: row.id.toLowerCase(),
      invoice_number: row.invoice_number.trim(),
      currency: row.currency,
    };
  });

  const paymentIds = new Set<string>();
  const payments = payload.payments.map((candidate, index): ValidatedCustomerPayment => {
    const row = paymentPayloadRecord(candidate);
    const amount = row ? validatedPaymentAmount(row.amount) : null;
    if (!row ||
        typeof row.id !== "string" || !CUSTOMER_PAYMENT_UUID.test(row.id) ||
        paymentIds.has(row.id.toLowerCase()) ||
        typeof row.invoice_id !== "string" || !CUSTOMER_PAYMENT_UUID.test(row.invoice_id) ||
        amount === null ||
        (row.paid_at !== undefined && row.paid_at !== null &&
          (typeof row.paid_at !== "string" ||
            !PAYMENT_TIMESTAMP.test(row.paid_at) ||
            !Number.isFinite(Date.parse(row.paid_at))))) {
      throw new Error("حركة الدفع رقم " + (index + 1) + " تحتوي معرفًا أو مرجعًا أو مبلغًا أو تاريخًا غير صالح.");
    }
    paymentIds.add(row.id.toLowerCase());
    return {
      id: row.id.toLowerCase(),
      invoice_id: row.invoice_id.toLowerCase(),
      amount,
      ...(typeof row.paid_at === "string" ? { paid_at: row.paid_at } : {}),
    };
  });

  return { invoices, payments };
}

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
