import { useCallback, useEffect, useRef } from 'react';

type ActiveRefreshOptions = {
  refresh: () => Promise<unknown> | unknown;
  busy?: boolean;
  enabled?: boolean;
  intervalMs?: number;
};

/**
 * Refreshes a read-only workspace while it is visible and online.
 * Concurrent automatic reads are serialized; callers retain ownership of
 * loading/error state and of any unsaved user drafts.
 */
export function useRefreshWhileActive({
  refresh,
  busy = false,
  enabled = true,
  intervalMs = 45_000,
}: ActiveRefreshOptions): void {
  const inFlight = useRef(false);

  const refreshIfActive = useCallback(async () => {
    if (
      !enabled ||
      busy ||
      inFlight.current ||
      typeof document === 'undefined' ||
      document.visibilityState !== 'visible' ||
      (typeof navigator !== 'undefined' && !navigator.onLine)
    ) return;

    inFlight.current = true;
    try {
      await refresh();
    } finally {
      inFlight.current = false;
    }
  }, [busy, enabled, refresh]);

  useEffect(() => {
    if (!enabled || !Number.isSafeInteger(intervalMs) || intervalMs < 1_000) return;

    const run = () => {
      // Workspace callbacks surface their own read errors. Do not create an
      // unhandled rejection from a timer or browser lifecycle event.
      void refreshIfActive().catch(() => undefined);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') run();
    };
    const interval = window.setInterval(run, intervalMs);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', run);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', run);
    };
  }, [enabled, intervalMs, refreshIfActive]);
}
