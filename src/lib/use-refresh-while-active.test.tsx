// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useRefreshWhileActive } from './use-refresh-while-active';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type ProbeProps = {
  refresh: () => Promise<unknown> | unknown;
  busy?: boolean;
  enabled?: boolean;
  intervalMs?: number;
};

function Probe({ refresh, busy, enabled, intervalMs }: ProbeProps) {
  useRefreshWhileActive({ refresh, busy, enabled, intervalMs });
  return null;
}

describe('useRefreshWhileActive', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let intervalCallback: (() => void) | null = null;
  let restoreVisibility: PropertyDescriptor | undefined;
  let restoreOnline: PropertyDescriptor | undefined;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn> | undefined;

  const nativeSetInterval = window.setInterval.bind(window);

  function setBrowserState(visibility: DocumentVisibilityState, online: boolean) {
    if (!restoreVisibility) restoreVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    if (!restoreOnline) restoreOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: visibility });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
  }

  async function mount(props: ProbeProps) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    intervalCallback = null;
    vi.spyOn(window, 'setInterval').mockImplementation((handler, timeout, ...args) => {
      if (timeout === (props.intervalMs ?? 45_000) && typeof handler === 'function') {
        intervalCallback = handler as () => void;
        return 79;
      }
      return nativeSetInterval(handler, timeout, ...args);
    });
    clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    await act(async () => {
      root?.render(createElement(Probe, props));
      await Promise.resolve();
    });
  }

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
    intervalCallback = null;
    vi.restoreAllMocks();
    clearIntervalSpy = undefined;
    if (restoreVisibility) Object.defineProperty(document, 'visibilityState', restoreVisibility);
    else Reflect.deleteProperty(document, 'visibilityState');
    if (restoreOnline) Object.defineProperty(navigator, 'onLine', restoreOnline);
    else Reflect.deleteProperty(navigator, 'onLine');
    restoreVisibility = undefined;
    restoreOnline = undefined;
  });

  it('refreshes on its interval, tab return, and network recovery', async () => {
    setBrowserState('visible', true);
    const refresh = vi.fn(async () => undefined);
    await mount({ refresh });

    expect(intervalCallback).toBeTypeOf('function');
    await act(async () => {
      intervalCallback?.();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);

    setBrowserState('visible', false);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      intervalCallback?.();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(2);

    setBrowserState('visible', true);
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('does not refresh while hidden, offline, busy, or disabled', async () => {
    const refresh = vi.fn(async () => undefined);
    setBrowserState('hidden', true);
    await mount({ refresh });
    await act(async () => {
      intervalCallback?.();
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(refresh).not.toHaveBeenCalled();

    setBrowserState('visible', false);
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      intervalCallback?.();
      await Promise.resolve();
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(createElement(Probe, { refresh, busy: true }));
      await Promise.resolve();
      intervalCallback?.();
      await Promise.resolve();
    });
    expect(refresh).not.toHaveBeenCalled();

    await act(async () => {
      root?.render(createElement(Probe, { refresh, enabled: false }));
      await Promise.resolve();
    });
    expect(intervalCallback).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('serializes overlapping automatic refreshes', async () => {
    setBrowserState('visible', true);
    let release!: () => void;
    const wait = new Promise<void>((resolve) => { release = resolve; });
    const refresh = vi.fn(() => wait);
    await mount({ refresh });

    await act(async () => {
      intervalCallback?.();
      intervalCallback?.();
      intervalCallback?.();
      await Promise.resolve();
    });
    expect(refresh).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await wait;
      await Promise.resolve();
    });
  });

  it('cleans its interval and browser listeners when unmounted', async () => {
    setBrowserState('visible', true);
    const refresh = vi.fn(async () => undefined);
    await mount({ refresh });
    const callback = intervalCallback;
    await act(async () => root?.unmount());
    root = undefined;

    expect(clearIntervalSpy).toHaveBeenCalledWith(79);
    await act(async () => {
      callback?.();
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    expect(refresh).not.toHaveBeenCalled();
  });
});
