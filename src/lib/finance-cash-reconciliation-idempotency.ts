export type FinanceAmountInput = string;

export type PendingBankStatementLine = Readonly<{
  fingerprint: string;
  lineNumber: number;
  idempotencyKey: string;
}>;

export type BankStatementLineRetryPayload = Readonly<{
  actorUserId?: string;

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
  const actorUserId = input.actorUserId?.trim() || "legacy-actor-scope";
  const statementId = input.statementId.trim();
  const transactionDate = input.transactionDate.trim();
  const externalReference = input.externalReference.trim() || null;
  const description = input.description.trim();
  const signedAmount = input.signedAmount.trim();

  if (!statementId || !transactionDate || !description || !signedAmount) {
    throw new Error("بيانات حركة كشف البنك غير مكتملة لمنع التكرار.");
  }

  return JSON.stringify({
    actorUserId,
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


export type FinanceRetryStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PersistentFinanceRetry = Readonly<{
  fingerprintHash: string;
  storageKey: string;
  idempotencyKey: string;
}>;
export type PersistentBankStatementLineRetry = PersistentFinanceRetry & Readonly<{
  lineNumber: number;
}>;

type StoredFinanceRetry = {
  version: 1;
  fingerprintHash: string;
  idempotencyKey: string;
  lineNumber?: number;
};
type FinanceFingerprintHasher = (fingerprint: string) => Promise<string>;

const FINANCE_RETRY_STORAGE_PREFIX = "aghbari.finance.retry.v1";
const FINANCE_RETRY_STORAGE_ERROR = "تعذر حفظ هوية إعادة المحاولة في تخزين المتصفح؛ لم تُرسل العملية المالية. فعّل التخزين المحلي ثم أعد المحاولة.";

async function sha256FinanceFingerprint(fingerprint: string): Promise<string> {
  if (!fingerprint.trim()) throw new Error("بصمة العملية المالية مطلوبة لمنع التكرار.");
  if (!globalThis.crypto?.subtle || typeof TextEncoder === "undefined") {
    throw new Error("هذا المتصفح لا يدعم إنشاء بصمة آمنة لإعادة المحاولة؛ لم تُرسل العملية المالية.");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fingerprint),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function financeRetryStorageKey(kind: "opening-balance" | "bank-statement-line", hash: string): string {
  return FINANCE_RETRY_STORAGE_PREFIX + "." + kind + "." + hash;
}

function readStoredFinanceRetry(
  storage: FinanceRetryStorage,
  storageKey: string,
  fingerprintHash: string,
  requireLineNumber: boolean,
): StoredFinanceRetry | null {
  let serialized: string | null;
  try {
    serialized = storage.getItem(storageKey);
  } catch {
    throw new Error(FINANCE_RETRY_STORAGE_ERROR);
  }
  if (serialized === null) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error("سجل إعادة المحاولة المالية تالف؛ أوقفنا الإرسال لمنع إنشاء عملية مكررة.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("سجل إعادة المحاولة المالية غير صالح؛ أوقفنا الإرسال لمنع التكرار.");
  }

  const record = parsed as Record<string, unknown>;
  const validLineNumber = Number.isInteger(record.lineNumber) &&
    Number(record.lineNumber) >= 1 && Number(record.lineNumber) <= 10000;
  if (record.version !== 1 || record.fingerprintHash !== fingerprintHash ||
      typeof record.idempotencyKey !== "string" || !UUID_PATTERN.test(record.idempotencyKey) ||
      (requireLineNumber && !validLineNumber) ||
      (!requireLineNumber && record.lineNumber !== undefined)) {
    throw new Error("تعارضت هوية إعادة المحاولة المحفوظة؛ لم نُنشئ مفتاحاً جديداً ولم نرسل العملية.");
  }
  return record as StoredFinanceRetry;
}

function writeStoredFinanceRetry(
  storage: FinanceRetryStorage,
  storageKey: string,
  record: StoredFinanceRetry,
): void {
  try {
    storage.setItem(storageKey, JSON.stringify(record));
  } catch {
    throw new Error(FINANCE_RETRY_STORAGE_ERROR);
  }
}

/**
 * Persist only a SHA-256 fingerprint and opaque idempotency token. The financial
 * payload itself is never written to localStorage. The record survives reloads
 * and browser restarts, and is removed only after the server write and refresh
 * have both been confirmed by the caller.
 */
export async function getOrCreatePersistentOpeningBalanceRetry(
  storage: FinanceRetryStorage,
  fingerprint: string,
  createKey: () => string,
  hashFingerprint: FinanceFingerprintHasher = sha256FinanceFingerprint,
): Promise<PersistentFinanceRetry> {
  const fingerprintHash = await hashFingerprint(fingerprint);
  if (!/^[0-9a-f]{64}$/i.test(fingerprintHash)) {
    throw new Error("تعذر إنشاء بصمة آمنة لإعادة محاولة الرصيد الافتتاحي.");
  }
  const storageKey = financeRetryStorageKey("opening-balance", fingerprintHash);
  const existing = readStoredFinanceRetry(storage, storageKey, fingerprintHash, false);
  if (existing) return { fingerprintHash, storageKey, idempotencyKey: existing.idempotencyKey };

  const idempotencyKey = createKey();
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new Error("تعذر إنشاء مفتاح صالح لمنع تكرار الرصيد الافتتاحي.");
  }
  writeStoredFinanceRetry(storage, storageKey, {
    version: 1, fingerprintHash, idempotencyKey,
  });
  return { fingerprintHash, storageKey, idempotencyKey };
}

/**
 * A bank-line retry retains both its original line number and key after a reload.
 * Storage failure/corruption fails closed before any RPC can be sent.
 */
export async function getOrCreatePersistentBankStatementLineRetry(
  storage: FinanceRetryStorage,
  input: BankStatementLineRetryPayload,
  nextLineNumber: number,
  createKey: () => string,
  hashFingerprint: FinanceFingerprintHasher = sha256FinanceFingerprint,
): Promise<PersistentBankStatementLineRetry> {
  const fingerprint = fingerprintFor(input);
  const fingerprintHash = await hashFingerprint(fingerprint);
  if (!/^[0-9a-f]{64}$/i.test(fingerprintHash)) {
    throw new Error("تعذر إنشاء بصمة آمنة لإعادة محاولة سطر كشف البنك.");
  }
  const storageKey = financeRetryStorageKey("bank-statement-line", fingerprintHash);
  const existing = readStoredFinanceRetry(storage, storageKey, fingerprintHash, true);
  if (existing) {
    return {
      fingerprintHash, storageKey, idempotencyKey: existing.idempotencyKey,
      lineNumber: existing.lineNumber as number,
    };
  }

  if (!Number.isInteger(nextLineNumber) || nextLineNumber < 1 || nextLineNumber > 10000) {
    throw new Error("رقم سطر كشف البنك خارج النطاق المسموح.");
  }
  const idempotencyKey = createKey();
  if (!UUID_PATTERN.test(idempotencyKey)) {
    throw new Error("تعذر إنشاء مفتاح صالح لمنع تكرار حركة كشف البنك.");
  }
  writeStoredFinanceRetry(storage, storageKey, {
    version: 1, fingerprintHash, idempotencyKey, lineNumber: nextLineNumber,
  });
  return { fingerprintHash, storageKey, idempotencyKey, lineNumber: nextLineNumber };
}

/** Clear a pending key only after the write and its follow-up read are confirmed. */
export function clearPersistentFinanceRetry(
  storage: FinanceRetryStorage,
  retry: Pick<PersistentFinanceRetry, "storageKey">,
): boolean {
  try {
    storage.removeItem(retry.storageKey);
    return true;
  } catch {
    // Leaving an already-confirmed key behind is safe: the next exact request replays it.
    return false;
  }
}