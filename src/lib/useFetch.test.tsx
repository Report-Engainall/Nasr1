// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useFetch, type ScopedReadCacheOptions } from "./useFetch";

const mountedRoots: Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
});

function mountUseFetch<T>(
  fetcher: () => Promise<T>,
  options: ScopedReadCacheOptions,
) {
  let current!: ReturnType<typeof useFetch<T>>;
  const container = document.createElement("div");
  const root = createRoot(container);
  mountedRoots.push(root);

  function Probe() {
    current = useFetch(fetcher, [], options);
    return null;
  }

  async function render() {
    await act(async () => {
      root.render(createElement(Probe));
      await Promise.resolve();
      await Promise.resolve();
    });
  }

  return {
    render,
    get current() {
      return current;
    },
  };
}

describe("useFetch scoped read cache", () => {
  it("shows scoped cached reference data while a stale read refreshes in the background", async () => {
    const cacheKey = "use-fetch-stale-reference-refresh-regression";
    const initialFetcher = vi.fn(async () => ["category-a"]);
    const first = mountUseFetch(initialFetcher, {
      cacheKey,
      staleTimeMs: 0,
      maxAgeMs: 120_000,
    });
    await first.render();

    expect(first.current.data).toEqual(["category-a"]);
    expect(first.current.loading).toBe(false);

    await act(async () => {
      // Invalidate freshness without expiring the cache entry.
      await new Promise((resolve) => setTimeout(resolve, 5));
    });

    let resolveRefresh!: (value: string[]) => void;
    const refreshFetcher = vi.fn(
      () => new Promise<string[]>((resolve) => { resolveRefresh = resolve; }),
    );
    const second = mountUseFetch(refreshFetcher, {
      cacheKey,
      staleTimeMs: 1,
      maxAgeMs: 120_000,
    });
    await second.render();

    expect(second.current.data).toEqual(["category-a"]);
    expect(second.current.loading).toBe(false);
    expect(refreshFetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRefresh(["category-a", "category-b"]);
      await Promise.resolve();
    });
    expect(second.current.data).toEqual(["category-a", "category-b"]);
    expect(second.current.refreshError).toBeNull();
  });

  it("deduplicates concurrent reads for the same explicit account-scoped key", async () => {
    const cacheKey = "use-fetch-concurrent-read-dedup-regression";
    let resolveRequest!: (value: { count: number }) => void;
    const fetcher = vi.fn(
      () => new Promise<{ count: number }>((resolve) => { resolveRequest = resolve; }),
    );
    const options = { cacheKey, staleTimeMs: 0, maxAgeMs: 120_000 };

    const first = mountUseFetch(fetcher, options);
    await first.render();
    const second = mountUseFetch(fetcher, options);
    await second.render();

    expect(fetcher).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveRequest({ count: 7 });
      await Promise.resolve();
    });

    expect(first.current.data).toEqual({ count: 7 });
    expect(second.current.data).toEqual({ count: 7 });
    expect(first.current.loading).toBe(false);
    expect(second.current.loading).toBe(false);
  });
});
