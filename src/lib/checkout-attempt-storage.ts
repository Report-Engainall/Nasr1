export type StoredCheckoutAttempt = Readonly<{ signature: string; key: string }>;

export type CheckoutAttemptStorage = Pick<Storage, "getItem" | "setItem">;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Persist and read back the exact request key before its first network submission.
 * Existing, malformed, conflicting, or inaccessible storage is never overwritten.
 */
export function persistCheckoutAttempt(
  storage: CheckoutAttemptStorage,
  storageKey: string,
  attempt: StoredCheckoutAttempt,
): boolean {
  if (!storageKey.trim() || !attempt.signature.trim() || !IDEMPOTENCY_KEY_PATTERN.test(attempt.key)) {
    return false;
  }

  try {
    const current = storage.getItem(storageKey);
    if (current !== null) {
      const saved = JSON.parse(current) as Partial<StoredCheckoutAttempt> | null;
      return saved?.signature === attempt.signature && saved?.key === attempt.key;
    }

    storage.setItem(storageKey, JSON.stringify(attempt));
    const persisted = storage.getItem(storageKey);
    if (persisted === null) return false;
    const saved = JSON.parse(persisted) as Partial<StoredCheckoutAttempt> | null;
    return saved?.signature === attempt.signature && saved?.key === attempt.key;
  } catch {
    return false;
  }
}
