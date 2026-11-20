export type BoundIdempotencyKey = Readonly<{
  fingerprint: string;
  key: string;
}>;

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Retain a server idempotency key only while the exact logical request is unchanged.
 * This lets an ambiguous network retry replay safely without poisoning a corrected payload.
 */
export function getOrCreateBoundIdempotencyKey(
  current: BoundIdempotencyKey | null,
  fingerprint: string,
  createKey: () => string,
): BoundIdempotencyKey {
  if (!fingerprint.trim()) {
    throw new Error("A non-empty request fingerprint is required.");
  }

  if (current?.fingerprint === fingerprint && IDEMPOTENCY_KEY_PATTERN.test(current.key)) {
    return current;
  }

  const key = createKey();
  if (!IDEMPOTENCY_KEY_PATTERN.test(key)) {
    throw new Error("The generated idempotency key is invalid.");
  }

  return { fingerprint, key };
}
