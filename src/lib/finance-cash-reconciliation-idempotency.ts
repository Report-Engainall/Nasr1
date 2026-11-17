export type FinanceAmountInput = string;

export type PendingBankStatementLine = Readonly<{
  fingerprint: string;
  lineNumber: number;
  idempotencyKey: string;
}>;

export type BankStatementLineRetryPayload = Readonly<{
  statementId: string;
  transactionDate: string;
  externalReference: string;
  description: string;
  signedAmount: FinanceAmountInput;
}>;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Convert Arabic/Latin decimal input to an exact numeric(18,2) string.
 * No floating-point conversion or silent rounding is performed.
 */
export function normalizeFinanceAmountInput(value: string): string | null {
  const normalized = value
    .trim()
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/٬/g, "")
    .replace(/−/g, "-")
    .replace(/^\+/, "");

  const match = /^(-?)(\d{1,16})(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return null;

  const whole = match[2].replace(/^0+(?=\d)/, "");
  const fraction = (match[3] ?? "").padEnd(2, "0");
  const isZero = whole === "0" && fraction === "00";
  const sign = match[1] === "-" && !isZero ? "-" : "";
  return sign + whole + "." + fraction;
}

function fingerprintFor(input: BankStatementLineRetryPayload): string {
  const statementId = input.statementId.trim();
  const transactionDate = input.transactionDate.trim();
  const externalReference = input.externalReference.trim() || null;
  const description = input.description.trim();
  const signedAmount = input.signedAmount.trim();

  if (!statementId || !transactionDate || !description || !signedAmount) {
    throw new Error("بيانات حركة كشف البنك غير مكتملة لمنع التكرار.");
  }

  return JSON.stringify({
    statementId,
    transactionDate,
    externalReference,
    description,
    signedAmount,
  });
}

/**
 * Keep the original line number and idempotency key for a request whose server
 * outcome may be unknown. A refreshed line count must not turn its retry into a
 * second line with a new key.
 */
export function getOrCreatePendingBankStatementLine(
  pendingByFingerprint: ReadonlyMap<string, PendingBankStatementLine>,
  input: BankStatementLineRetryPayload,
  nextLineNumber: number,
  createKey: () => string,
): PendingBankStatementLine {
  const fingerprint = fingerprintFor(input);
  const existing = pendingByFingerprint.get(fingerprint);
  if (existing) return existing;

  if (!Number.isInteger(nextLineNumber) || nextLineNumber < 1 || nextLineNumber > 10000) {
    throw new Error("رقم سطر كشف البنك خارج النطاق المسموح.");
  }

  const idempotencyKey = createKey();
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new Error("تعذر إنشاء مفتاح صالح لمنع تكرار حركة كشف البنك.");
  }

  return { fingerprint, lineNumber: nextLineNumber, idempotencyKey };
}
