import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useFetch } from '@/lib/useFetch';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('useFetch overlapping requests', () => {
  it('keeps the newest dependency result and loading state when requests finish out of order', async () => {
    const older = deferred<string>();
    const newer = deferred<string>();
    const fetcher = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const { result, rerender } = renderHook(
      ({ revision }: { revision: number }) => useFetch<string>(fetcher, [revision]),
      { initialProps: { revision: 1 } },
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ revision: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    await act(async () => {
      older.resolve('stale response');
    });

    expect(result.current.data).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();

    await act(async () => {
      newer.resolve('current response');
    });

    expect(result.current.data).toBe('current response');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('does not let an older rejected request overwrite a newer successful request', async () => {
    const older = deferred<string>();
    const newer = deferred<string>();
    const fetcher = vi.fn()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise);

    const { result, rerender } = renderHook(
      ({ revision }: { revision: number }) => useFetch<string>(fetcher, [revision]),
      { initialProps: { revision: 1 } },
    );

    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    rerender({ revision: 2 });
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));

    await act(async () => {
      newer.resolve('current response');
    });
    await act(async () => {
      older.reject(new Error('stale network failure'));
    });

    expect(result.current.data).toBe('current response');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });
});
