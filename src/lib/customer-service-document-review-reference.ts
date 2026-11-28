type CustomerDocumentReviewEntryType =
  | "invoice"
  | "payment"
  | "credit_note"
  | "debit_note"
  | "opening_balance"
  | "adjustment";

type CustomerDocumentReviewSource = "ONYX" | "MUTAKAMEL";

export type CustomerDocumentReviewReference = {
  customerMessage: string;
  documentNumber: string;
  entryReference: string;
  currencyCode: string;
  sourceMode: CustomerDocumentReviewSource;
  sourceLabel: string;
  sourceAsOf: string;
  entryType: CustomerDocumentReviewEntryType;
  entryTypeLabel: string;
};

const sourceModes = {
  "Onyx Pro": "ONYX",
  "المتكامل": "MUTAKAMEL",
} as const;

const entryTypes = {
  "فاتورة": "invoice",
  "دفعة": "payment",
  "إشعار دائن": "credit_note",
  "إشعار مدين": "debit_note",
  "رصيد افتتاحي": "opening_balance",
  "تسوية": "adjustment",
} as const;

const reviewOnlyNote =
  "مراجعة فقط؛ لا يغيّر هذا الطلب الرصيد ولا ينشئ دفعة أو يرحّل قيدًا محاسبيًا.";

function readField(line: string, prefix: string): string | null {
  if (!line.startsWith(prefix)) return null;
  const value = line.slice(prefix.length).trim();
  return value.length > 0 ? value : null;
}

function isSafeReference(value: string | null): value is string {
  return Boolean(value && value.length <= 100 && !/[\u0000-\u001f\u007f]/.test(value));
}

function isValidSourceTimestamp(value: string): boolean {
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/,
  );
  if (!match || !Number.isFinite(Date.parse(value))) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day < 1 || day > daysByMonth[month - 1]) return false;

  const offset = match[7];
  if (offset !== "Z") {
    const offsetParts = offset.slice(1).split(":").map(Number);
    if (offsetParts[0] > 14 || offsetParts[1] > 59 ||
        (offsetParts[0] === 14 && offsetParts[1] !== 0)) return false;
  }
  return true;
}

/**
 * Reads only the exact, read-only reference block appended by the customer
 * financial document-review workflow. Unrecognized descriptions remain plain text.
 */
export function parseCustomerDocumentReviewReference(
  description: string,
): CustomerDocumentReviewReference | null {
  if (typeof description !== "string" || description.length > 4000) return null;

  const normalized = description.replace(/\r\n/g, "\n");
  const marker = "\n\nالمستند المحدد: ";
  if (normalized.split(marker).length !== 2) return null;
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return null;

  const customerMessage = normalized.slice(0, markerIndex).trim();
  const lines = normalized.slice(markerIndex + 2).split("\n");
  if (!customerMessage || lines.length !== 7) return null;

  const documentNumber = readField(lines[0] ?? "", "المستند المحدد: ");
  const entryReference = readField(lines[1] ?? "", "مرجع الحركة: ");
  const currencyCode = readField(lines[2] ?? "", "العملة: ");
  const sourceLabel = readField(lines[3] ?? "", "المصدر الظاهر في الكشف: ");
  const sourceAsOf = readField(lines[4] ?? "", "توقيت لقطة الكشف الظاهرة: ");
  const entryTypeLabel = readField(lines[5] ?? "", "نوع الحركة: ")?.replace(/\.$/, "");
  const sourceMode = sourceLabel ? sourceModes[sourceLabel as keyof typeof sourceModes] : undefined;
  const entryType = entryTypeLabel ? entryTypes[entryTypeLabel as keyof typeof entryTypes] : undefined;

  if (
    !isSafeReference(documentNumber) ||
    !isSafeReference(entryReference) ||
    !currencyCode ||
    !/^[A-Z]{3}$/.test(currencyCode) ||
    !sourceLabel ||
    !sourceMode ||
    !sourceAsOf ||
    !isValidSourceTimestamp(sourceAsOf) ||
    !entryTypeLabel ||
    !entryType ||
    (lines[6] ?? "").trim() !== reviewOnlyNote
  ) return null;

  return {
    customerMessage,
    documentNumber,
    entryReference,
    currencyCode,
    sourceMode,
    sourceLabel,
    sourceAsOf,
    entryType,
    entryTypeLabel,
  };
}

export function formatSourceTimestampUtc(value: string): string {
  return new Intl.DateTimeFormat("ar-YE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

