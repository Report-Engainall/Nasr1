/**
 * Bounds read-only admin observation requests so one stalled source cannot
 * keep the whole monitoring view in a loading state.
 *
 * The underlying request may continue if its client does not support aborting;
 * callers must continue to treat a timeout as unavailable evidence, never success.
 */
export const ADMIN_OBSERVABILITY_PROBE_TIMEOUT_MS = 12_000;

export class AdminObservabilityTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super("Admin observability probe timed out.");
    this.name = "AdminObservabilityTimeoutError";
  }
}

export async function withAdminObservabilityTimeout<T>(
  operation: () => Promise<T>,
  timeoutMs = ADMIN_OBSERVABILITY_PROBE_TIMEOUT_MS,
): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
    throw new RangeError("timeoutMs must be a positive safe integer.");
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AdminObservabilityTimeoutError(timeoutMs)), timeoutMs);
  });

  try {
    return await Promise.race([Promise.resolve().then(operation), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
