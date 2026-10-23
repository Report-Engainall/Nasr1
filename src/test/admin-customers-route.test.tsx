import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  renderCustomerDirectory: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/components/AghbariApp', () => ({
  Customers: (props: { onNotice: (message: string) => void }) => {
    mocks.renderCustomerDirectory(props);
    return null;
  },
}));

import AdminCustomers from '@/pages/admin/AdminCustomers';

describe('routed admin customer page', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mocks.renderCustomerDirectory.mockReset();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });

  it('mounts the tenant-scoped customer directory and renders its operation notice accessibly', async () => {
    await act(async () => {
      root.render(<AdminCustomers />);
    });

    expect(mocks.renderCustomerDirectory).toHaveBeenCalledTimes(1);
    const props = mocks.renderCustomerDirectory.mock.calls[0][0] as {
      onNotice: (message: string) => void;
    };
    expect(typeof props.onNotice).toBe('function');
    expect(host.querySelector('[role="status"]')).toBeNull();

    await act(async () => {
      props.onNotice('تم تحديث شريحة العميل وتسجيل السبب في سجل التدقيق.');
    });

    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      'تم تحديث شريحة العميل وتسجيل السبب في سجل التدقيق.',
    );
    const close = host.querySelector<HTMLButtonElement>('button[ type="button"]');
    expect(close).toBeTruthy();
    await act(async () => close?.click());
    expect(host.querySelector('[role="status"]')).toBeNull();
  });
});
