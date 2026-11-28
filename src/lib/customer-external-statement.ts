export type ExternalStatementEntryType =
  | "invoice"
  | "payment"
  | "credit_note"
  | "debit_note"
  | "opening_balance"
  | "adjustment";

export type CustomerExternalStatementEntry = {
  entry_reference: string;
  entry_date: string;
  due_date: string | null;
  entry_type: ExternalStatementEntryType;
  debit_amount: string;
  credit_amount: string;
  running_balance: string;
  source_document_number: string | null;
  description: string;
};

export type CustomerExternalStatementCurrency = {
  currency_code: string;
  source_as_of: string;
  entry_count: number;
  total_debit: string;
  total_credit: string;
  closing_balance: string;
  details_partial: boolean;
  entries: CustomerExternalStatementEntry[];
};

export type CustomerExternalStatement = {
  source_mode: "ONYX" | "MUTAKAMEL";
  source_as_of: string;
  details_limit_per_currency: 500;
  currencies: CustomerExternalStatementCurrency[];
};

const ENTRY_TYPES = new Set<ExternalStatementEntryType>([
  "invoice", "payment", "credit_note", "debit_note", "opening_balance", "adjustment",
]);
const UNSIGNED_DECIMAL = /^(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,4}))?$/;
const SIGNED_DECIMAL = /^-?(0|[1-9][0-9]{0,15})(?:\.([0-9]{1,4}))?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const UUID_FREE_TEXT_MAX = 4000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseDecimal(value: unknown, signed: boolean, label: string): string {
  if (typeof value !== "string" || value.length > 32) {
    throw new Error("كشف ERP يحتوي قيمة مالية غير نصية أو خارج الحد في " + label + ".");
  }
  const match = (signed ? SIGNED_DECIMAL : UNSIGNED_DECIMAL).exec(value);
  if (!match || value === "-0" || value.startsWith("-0.") && /^-0(?:\.0+)?$/.test(value)) {
    throw new Error("كشف ERP يحتوي قيمة مالية غير معيارية في " + label + ".");
  }
  return value;
}

function parseDate(value: unknown, label: string, nullable = false): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== "string") throw new Error("كشف ERP يحتوي تاريخًا غير صالح في " + label + ".");
  const match = ISO_DATE.exec(value);
  if (!match) throw new Error("كشف ERP يحتوي تاريخًا غير معياري في " + label + ".");
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days) {
    throw new Error("كشف ERP يحتوي تاريخًا خارج التقويم في " + label + ".");
  }
  return value;
}

function parseTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length > 80 ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !Number.isFinite(Date.parse(value))) {
    throw new Error("كشف ERP يحتوي وقت مزامنة غير صالح في " + label + ".");
  }
  return value;
}

function parseCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000) {
    throw new Error("كشف ERP يحتوي عدادًا غير صالح في " + label + ".");
  }
  return value;
}

function parseEntry(value: unknown, index: number): CustomerExternalStatementEntry {
  const row = asRecord(value);
  if (!row ||
      typeof row.entry_reference !== "string" ||
      row.entry_reference.trim().length < 1 || row.entry_reference.length > 160 ||
      typeof row.entry_type !== "string" || !ENTRY_TYPES.has(row.entry_type as ExternalStatementEntryType) ||
      !(row.source_document_number === null || typeof row.source_document_number === "string" && row.source_document_number.length <= 160) ||
      typeof row.description !== "string" || row.description.length > UUID_FREE_TEXT_MAX ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(row.description)) {
    throw new Error("سطر ERP رقم " + index + " غير مكتمل أو خارج قائمة الحقول المسموحة.");
  }
  const debit = parseDecimal(row.debit_amount, false, "debit_amount");
  const credit = parseDecimal(row.credit_amount, false, "credit_amount");
  if (Number(debit) > 0 && Number(credit) > 0) {
    throw new Error("سطر ERP لا يجوز أن يحتوي مدينًا ودائنًا في الوقت نفسه.");
  }
  return {
    entry_reference: row.entry_reference.trim(),
    entry_date: parseDate(row.entry_date, "entry_date")!,
    due_date: parseDate(row.due_date, "due_date", true),
    entry_type: row.entry_type as ExternalStatementEntryType,
    debit_amount: debit,
    credit_amount: credit,
    running_balance: parseDecimal(row.running_balance, true, "running_balance"),
    source_document_number: row.source_document_number === null
      ? null
      : (row.source_document_number as string).trim() || null,
    description: row.description,
  };
}

export function parseCustomerExternalStatement(
  value: unknown,
  expectedSourceMode: "ONYX" | "MUTAKAMEL",
  expectedSourceAsOf: string | null,
): CustomerExternalStatement {
  const root = asRecord(value);
  if (!root || root.source_mode !== expectedSourceMode ||
      typeof root.details_limit_per_currency !== "number" ||
      root.details_limit_per_currency !== 500 ||
      !Array.isArray(root.currencies) || root.currencies.length < 1 || root.currencies.length > 10) {
    throw new Error("استجابة كشف الحساب الخارجي لا تطابق مصدر الحساب أو حدود القراءة المعتمدة.");
  }
  const sourceAsOf = parseTimestamp(root.source_as_of, "source_as_of");
  if (!expectedSourceAsOf || !Number.isFinite(Date.parse(expectedSourceAsOf)) ||
      Date.parse(sourceAsOf) !== Date.parse(expectedSourceAsOf)) {
    throw new Error("تغير توقيت مصدر ERP عن ربط الحساب المعتمد؛ أوقفنا عرض الكشف.");
  }
  const currencies = root.currencies.map((candidate, currencyIndex): CustomerExternalStatementCurrency => {
    const row = asRecord(candidate);
    if (!row || typeof row.currency_code !== "string" || !/^[A-Z]{3}$/.test(row.currency_code) ||
        !Array.isArray(row.entries) || row.entries.length > 500 ||
        typeof row.details_partial !== "boolean") {
      throw new Error("ملخص عملة ERP رقم " + currencyIndex + " غير صالح.");
    }
    const currencySourceAsOf = parseTimestamp(row.source_as_of, "currency.source_as_of");
    if (Date.parse(currencySourceAsOf) < Date.parse(sourceAsOf) ||
        Date.parse(currencySourceAsOf) > Date.now() ||
        Date.now() - Date.parse(currencySourceAsOf) > 24 * 60 * 60 * 1000) {
      throw new Error("نطاق عملة ERP قديم أو أسبق من إثبات المزامنة المعتمد.");
    }
    const entryCount = parseCount(row.entry_count, "entry_count");
    const entries = row.entries.map((entry, index) => parseEntry(entry, index + 1));
    if (entryCount < entries.length ||
        row.details_partial !== (entryCount > entries.length) ||
        (row.details_partial && entries.length !== 500)) {
      throw new Error("عدد حركات ERP لا يطابق حدود التفاصيل المعلنة.");
    }
    return {
      currency_code: row.currency_code,
      source_as_of: currencySourceAsOf,
      entry_count: entryCount,
      total_debit: parseDecimal(row.total_debit, false, "total_debit"),
      total_credit: parseDecimal(row.total_credit, false, "total_credit"),
      closing_balance: parseDecimal(row.closing_balance, true, "closing_balance"),
      details_partial: row.details_partial,
      entries,
    };
  });
  if (new Set(currencies.map(currency => currency.currency_code)).size !== currencies.length) {
    throw new Error("كشف ERP يحتوي أكثر من نطاق لنفس العملة.");
  }
  return {
    source_mode: expectedSourceMode,
    source_as_of: sourceAsOf,
    details_limit_per_currency: 500,
    currencies: currencies.sort((a, b) => a.currency_code.localeCompare(b.currency_code)),
  };
}

export function formatCustomerExternalStatementAmount(value: string, currency: string): string {
  const parsed = parseDecimal(value, true, "display_amount");
  const negative = parsed.startsWith("-");
  const unsigned = negative ? parsed.slice(1) : parsed;
  const [whole, fraction] = unsigned.split(".");
  const grouped = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 0 }).format(BigInt(whole));
  return (negative ? "−" : "") + grouped + (fraction ? "." + fraction : "") + " " + currency;
}

export function customerExternalStatementEntryTypeLabel(value: ExternalStatementEntryType): string {
  const labels: Record<ExternalStatementEntryType, string> = {
    invoice: "فاتورة",
    payment: "دفعة",
    credit_note: "إشعار دائن",
    debit_note: "إشعار مدين",
    opening_balance: "رصيد افتتاحي",
    adjustment: "تسوية",
  };
  return labels[value];
}
