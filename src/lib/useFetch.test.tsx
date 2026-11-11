// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFetch } from "./useFetch";

afterEach(() => {
  cleanup();
});

describe("useFetch scoped read cache", () => {
  it("shows scoped cached reference data while a stale read refreshes in the background", async () => {
    const cacheKey = "use-fetch-stale-reference-refresh-regression";
    const initialFetcher = vi.fn(async () => ["category-a"]);
    const first = renderHook(() =>
      useFetch(initialFetcher, [], {
        cacheKey,
        staleTimeMs: 0,
        maxAgeMs: 120_000,
      }),
    );

    await waitFor(() => {
      expect(first.result.current.data).toEqual(["category-a"]);
      expect(first.result.current.loading).toBe(false);
    });
    first.unmount();

    await new Promise((resolve) => setTimeout(resolve, 5));

    let resolveRefresh!: (value: string[]) => void;
    const refreshFetcher = vi.fn(
      () => new Promise<string[]>((resolve) => { resolveRefresh = resolve; }),
    );
    const second = renderHook(() =>
      useFetch(refreshFetcher, [], {
        cacheKey,
        staleTimeMs: 1,
        maxAgeMs: 120_000,
      }),
    );

    expect(second.result.current.data).toEqual(["category-a"]);
    expect(second.result.current.loading).toBe(false);
    await waitFor(() => expect(refreshFetcher).toHaveBeenCalledTimes(1));
    expect(second.result.current.data).toEqual(["category-a"]);

    await act(async () => {
      resolveRefresh(["category-a", "category-b"]);
    });
    await waitFor(() => {
      expect(second.result.current.data).toEqual(["category-a", "category-b"]);
      expect(second.result.current.refreshError).toBeNull();
    });
  });

  it("deduplicates concurrent reads for the same explicit account-scoped key", async () => {
    const cacheKey = "use-fetch-concurrent-read-dedup-regression";
    let resolveRequest!: (value: { count: number }) => void;
    const fetcher = vi.fn(
      () => new Promise<{ count: number }>((resolve) => { resolveRequest = resolve; }),
    );

    const first = renderHook(() =>
      useFetch(fetcher, [], { cacheKey, staleTimeMs: 0, maxAgeMs: 120_000 }),
    );
    const second = renderHook(() =>
      useFetch(fetcher, [], { cacheKey, staleTimeMs: 0, maxAgeMs: 120_000 }),
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveRequest({ count: 7 });
    });

    await waitFor(() => {
      expect(first.result.current.data).toEqual({ count: 7 });
      expect(second.result.current.data).toEqual({ count: 7 });
      expect(first.result.current.loading).toBe(false);
      expect(second.result.current.loading).toBe(false);
    });
  });
});
