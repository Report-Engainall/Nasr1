import { useCallback, useEffect, useRef, useState } from 'react';

type Fetcher<T> = () => Promise<T>;

export type ScopedReadCacheOptions = {
  /**
   * Explicit account/session-scoped key. Never use an unscoped key for private
   * tenant data. Caching is disabled unless both a key and positive maxAge exist.
   */
  cacheKey?: string;
  /** Skip the network on mount while an entry is this fresh. Manual refetch always refreshes. */
  staleTimeMs?: number;
  /** Maximum age for showing an old value while a background refresh runs. */
  maxAgeMs?: number;
};

type ReadCacheEntry = { value: unknown; updatedAt: number };

const scopedReadCache = new Map<string, ReadCacheEntry>();
const inFlightReads = new Map<string, Promise<unknown>>();
const MAX_SCOPED_READ_CACHE_ENTRIES = 100;

function getScopedReadCacheEntry(
  cacheKey: string | undefined,
  maxAgeMs: number,
): ReadCacheEntry | undefined {
  if (!cacheKey || maxAgeMs <= 0) return undefined;
  const entry = scopedReadCache.get(cacheKey);
  if (!entry) return undefined;
  if (Date.now() - entry.updatedAt > maxAgeMs) {
    scopedReadCache.delete(cacheKey);
    return undefined;
  }
  return entry;
}

function setScopedReadCacheEntry(cacheKey: string, value: unknown): void {
  if (!scopedReadCache.has(cacheKey) && scopedReadCache.size >= MAX_SCOPED_READ_CACHE_ENTRIES) {
    const oldestKey = scopedReadCache.keys().next().value;
    if (oldestKey) scopedReadCache.delete(oldestKey);
  }
  scopedReadCache.set(cacheKey, { value, updatedAt: Date.now() });
}

export function useFetch<T>(
  fetcher: Fetcher<T>,
  deps: unknown[] = [],
  cacheOptions: ScopedReadCacheOptions = {},
) {
  const cacheKey = cacheOptions.cacheKey;
  const staleTimeMs = Math.max(0, cacheOptions.staleTimeMs ?? 0);
  const maxAgeMs = Math.max(staleTimeMs, cacheOptions.maxAgeMs ?? 0);
  const initialCacheEntry = getScopedReadCacheEntry(cacheKey, maxAgeMs);
  const [data, setData] = useState<T | null>(() =>
    initialCacheEntry ? initialCacheEntry.value as T : null,
  );
  const [hasData, setHasData] = useState(Boolean(initialCacheEntry));
  const hasDataRef = useRef(Boolean(initialCacheEntry));
  const [loading, setLoading] = useState(!initialCacheEntry);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const requestGeneration = useRef(0);

  useEffect(() => {
    hasDataRef.current = hasData;
  }, [hasData]);

  const refetch = useCallback(async () => {
    const generation = ++requestGeneration.current;
    if (!hasDataRef.current) setLoading(true);
    setError(null);
    setRefreshError(null);

    let request = cacheKey ? inFlightReads.get(cacheKey) : undefined;
    const ownsRequest = !request;
    if (!request) {
      request = Promise.resolve().then(fetcher);
      if (cacheKey) inFlightReads.set(cacheKey, request);
    }

    try {
      const result = await request as T;
      if (generation === requestGeneration.current) {
        setData(result);
        setHasData(true);
        hasDataRef.current = true;
        if (cacheKey) setScopedReadCacheEntry(cacheKey, result);
      }
    } catch (err) {
      if (generation === requestGeneration.current) {
        const message = err instanceof Error ? err.message : 'حدث خطأ غير متوقع';
        // Keep previously verified read-only metadata visible during a failed refresh.
        // Callers can render refreshError without replacing usable cached data with a blank state.
        if (hasDataRef.current) setRefreshError(message);
        else setError(message);
      }
    } finally {
      if (ownsRequest && cacheKey && inFlightReads.get(cacheKey) === request) {
        inFlightReads.delete(cacheKey);
      }
      // An older request must never clear the loading state of a newer request.
      if (generation === requestGeneration.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, ...deps]);

  useEffect(() => {
    const cached = getScopedReadCacheEntry(cacheKey, maxAgeMs);
    const cachedAge = cached ? Date.now() - cached.updatedAt : Number.POSITIVE_INFINITY;
    if (cached) {
      setData(cached.value as T);
      setHasData(true);
      hasDataRef.current = true;
      setLoading(false);
      // Fresh cache is immediately reusable. Stale-but-usable cache is displayed
      // while the read is refreshed in the background.
      if (cachedAge <= staleTimeMs) return;
    } else {
      setData(null);
      setHasData(false);
      hasDataRef.current = false;
      setLoading(true);
    }

    void refetch();
    return () => {
      // Invalidate pending work when dependencies change or the hook unmounts.
      requestGeneration.current += 1;
    };
  }, [cacheKey, maxAgeMs, refetch, staleTimeMs]);

  return { data, loading, error, refreshError, refetch };
}
