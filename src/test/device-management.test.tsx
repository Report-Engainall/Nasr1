import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getSession: vi.fn(), signOut: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession, signOut: mocks.signOut } },
}));
import { DeviceManagement } from '@/components/DeviceManagement';

function token() {
  const payload = window.btoa(JSON.stringify({ session_id: 'aabbccdd-1111-2222-3333-444455556666', exp: 1893456000 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return 'header.' + payload + '.signature';
}
describe('device and session management', () => {
  let root: Root | undefined; let host: HTMLDivElement | undefined;
  const session = { access_token: token(), expires_at: 1893456000, user: { email: 'staff@example.test' } };
  beforeEach(() => {
    mocks.getSession.mockReset(); mocks.signOut.mockReset();
    mocks.getSession.mockResolvedValue({ data: { session }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host);
  });
  afterEach(async () => {
    if (root) { await act(async () => root?.unmount()); root = undefined; }
    host?.remove(); host = undefined;
  });
  it('shows current session and invokes actual other-session revocation', async () => {
    const onNotice = vi.fn();
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain('الجلسة الحالية');
    expect(host?.textContent).toContain('staff@example.test');
    expect(host?.textContent).toContain('aabbccdd…');
    expect(host?.textContent).toContain('لا تدّعي وجود قائمة');
    await act(async () => {
      host?.querySelector<HTMLButtonElement>('button[aria-label="تسجيل الخروج من الأجهزة الأخرى"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('أكدت خدمة المصادقة'));
  });
  it('does not show success when the auth service rejects revocation', async () => {
    mocks.signOut.mockResolvedValueOnce({ error: new Error('network failure') });
    const onNotice = vi.fn();
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      host?.querySelector<HTMLButtonElement>('button[aria-label="تسجيل الخروج من الأجهزة الأخرى"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(onNotice).not.toHaveBeenCalled();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain('تعذر إبطال جلسات');
  });
  it('uses local scope for current-device logout', async () => {
    const onNotice = vi.fn();
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      host?.querySelector<HTMLButtonElement>('button[aria-label="تسجيل الخروج من هذا الجهاز"]')?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(onNotice).toHaveBeenCalledWith('تم تسجيل الخروج من هذا الجهاز.');
  });
});
