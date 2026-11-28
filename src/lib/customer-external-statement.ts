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

function timestampMicroseconds(value: unknown, label: string): bigint {
  if (typeof value !== "string" || value.length > 80) {
    throw new Error("كشف ERP يحتوي وقت مزامنة غير صالح في " + label + ".");
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):([0-5]\d))$/.exec(value);
  if (!match) {
    throw new Error("كشف ERP يحتوي وقت مزامنة غير معياري في " + label + ".");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  const offsetHour = match[10] ? Number(match[10]) : 0;
  const offsetMinute = match[11] ? Number(match[11]) : 0;
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth ||
      offsetHour > 14 || (offsetHour === 14 && offsetMinute !== 0)) {
    throw new Error("كشف ERP يحتوي وقت مزامنة خارج النطاق في " + label + ".");
  }

  const local = new Date(0);
  local.setUTCFullYear(year, month - 1, day);
  local.setUTCHours(Number(match[4]), Number(match[5]), Number(match[6]), 0);
  const offsetSign = match[9] === "+" ? 1 : -1;
  const offsetMilliseconds = (offsetHour * 60 + offsetMinute) * 60_000 * offsetSign;
  const epochMilliseconds = local.getTime() - offsetMilliseconds;
  if (!Number.isFinite(epochMilliseconds)) {
    throw new Error("كشف ERP يحتوي وقت مزامنة غير صالح في " + label + ".");
  }
  const fractionalMicroseconds = BigInt((match[7] ?? "").padEnd(6, "0") || "0");
  return BigInt(epochMilliseconds) * 1_000n + fractionalMicroseconds;
}

function parseTimestamp(value: unknown, label: string): string {
  timestampMicroseconds(value, label);
  return value as string;
}

function decimalToScale4(value: string): bigint {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = unsigned.split(".");
  const scaled = BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, "0"));
  return negative ? -scaled : scaled;
}

function validateCurrencyLedger(input: {
  entryCount: number;
  totalDebit: string;
  totalCredit: string;
  closingBalance: string;
  detailsPartial: boolean;
  entries: CustomerExternalStatementEntry[];
}): void {
  const totalDebit = decimalToScale4(input.totalDebit);
  const totalCredit = decimalToScale4(input.totalCredit);
  const closingBalance = decimalToScale4(input.closingBalance);

  for (let index = 0; index < input.entries.length; index += 1) {
    const current = input.entries[index];
    const older = input.entries[index + 1];
    if (!older) continue;
    if (current.entry_date < older.entry_date) {
      throw new Error("ترتيب حركات كشف ERP ليس من الأحدث إلى الأقدم.");
    }
    const balanceChange = decimalToScale4(current.running_balance) - decimalToScale4(older.running_balance);
    const movement = decimalToScale4(current.debit_amount) - decimalToScale4(current.credit_amount);
    if (balanceChange !== movement) {
      throw new Error("الرصيد الجاري لا يطابق حركة المدين والدائن بين سطرين متتابعين.");
    }
  }

  if (input.entries.length > 0) {
    if (decimalToScale4(input.entries[0].running_balance) !== closingBalance) {
      throw new Error("الرصيد الجاري لأحدث حركة لا يطابق الرصيد الختامي المعتمد.");
    }
  } else if (closingBalance !== 0n) {
    throw new Error("كشف ERP بلا حركات لكنه يعرض رصيدًا ختاميًا غير صفري.");
  }

  // The totals and closing balance always cover the full server-side account,
  // even when only the newest 500 detail rows are returned to the browser.
  if (totalDebit - totalCredit !== closingBalance) {
    throw new Error("إجمالي المدين والدائن لا يطابق الرصيد الختامي المعتمد.");
  }

  if (!input.detailsPartial) {
    const entriesDebit = input.entries.reduce((sum, entry) => sum + decimalToScale4(entry.debit_amount), 0n);
    const entriesCredit = input.entries.reduce((sum, entry) => sum + decimalToScale4(entry.credit_amount), 0n);
    if (entriesDebit !== totalDebit || entriesCredit !== totalCredit ||
        totalDebit - totalCredit !== closingBalance ||
        input.entries.length !== input.entryCount) {
      throw new Error("إجماليات كشف ERP لا تتطابق حسابيًا مع تفاصيل الحركات والرصيد الختامي.");
    }
  }
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
  if (!expectedSourceAsOf ||
      timestampMicroseconds(sourceAsOf, "source_as_of") !== timestampMicroseconds(expectedSourceAsOf, "expected_source_as_of")) {
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
    const currencyWatermark = timestampMicroseconds(currencySourceAsOf, "currency.source_as_of");
    const bindingWatermark = timestampMicroseconds(sourceAsOf, "source_as_of");
    const nowMicroseconds = BigInt(Date.now()) * 1_000n;
    const maxAgeMicroseconds = 24n * 60n * 60n * 1_000_000n;
    if (currencyWatermark < bindingWatermark ||
        currencyWatermark > nowMicroseconds ||
        nowMicroseconds - currencyWatermark > maxAgeMicroseconds) {
      throw new Error("نطاق عملة ERP قديم أو أسبق من إثبات المزامنة المعتمد.");
    }
    const entryCount = parseCount(row.entry_count, "entry_count");
    const entries = row.entries.map((entry, index) => parseEntry(entry, index + 1));
    if (entryCount < entries.length ||
        row.details_partial !== (entryCount > entries.length) ||
        (row.details_partial && entries.length !== 500)) {
      throw new Error("عدد حركات ERP لا يطابق حدود التفاصيل المعلنة.");
    }
    const totalDebit = parseDecimal(row.total_debit, false, "total_debit");
    const totalCredit = parseDecimal(row.total_credit, false, "total_credit");
    const closingBalance = parseDecimal(row.closing_balance, true, "closing_balance");
    validateCurrencyLedger({
      entryCount,
      totalDebit,
      totalCredit,
      closingBalance,
      detailsPartial: row.details_partial,
      entries,
    });
    return {
      currency_code: row.currency_code,
      source_as_of: currencySourceAsOf,
      entry_count: entryCount,
      total_debit: totalDebit,
      total_credit: totalCredit,
      closing_balance: closingBalance,
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
