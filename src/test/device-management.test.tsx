import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  signOut: vi.fn(),
  rpc: vi.fn(),
  useAuth: vi.fn(),
  onNotice: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getSession: mocks.getSession, signOut: mocks.signOut },
    rpc: mocks.rpc,
  },
}));
vi.mock('@/lib/auth', () => ({ useAuth: mocks.useAuth }));

import { DeviceManagement } from '@/components/DeviceManagement';

const CURRENT_SESSION_ID = 'aabbccdd-1111-2222-3333-444455556666';
const OTHER_SESSION_ID = 'b1111111-1111-4111-8111-111111111111';

function accessToken(sessionId = CURRENT_SESSION_ID) {
  const payload = window.btoa(JSON.stringify({ session_id: sessionId, exp: 1893456000 }))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  return 'header.' + payload + '.signature';
}

function makeSession(id: string, displayName: string, current: boolean) {
  return {
    session_id: id,
    profile_id: current ? 'admin-profile' : 'staff-profile',
    display_name: displayName,
    email: current ? 'admin@example.test' : 'staff@example.test',
    created_at: '2026-10-20T10:00:00.000Z',
    last_activity_at: '2026-10-23T10:15:00.000Z',
    expires_at: null,
    user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36',
    ip_address: '192.0.2.10',
    is_current_session: current,
  };
}

describe('central device and session management', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let sessions: ReturnType<typeof makeSession>[];

  const authSession = {
    access_token: accessToken(),
    expires_at: 1893456000,
    user: { email: 'admin@example.test' },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    sessions = [
      makeSession(CURRENT_SESSION_ID, 'مدير النظام', true),
      makeSession(OTHER_SESSION_ID, 'موظف الاختبار', false),
    ];
    mocks.getSession.mockResolvedValue({ data: { session: authSession }, error: null });
    mocks.signOut.mockResolvedValue({ error: null });
    mocks.useAuth.mockReturnValue({ user: { profileId: 'admin-profile', roles: ['admin'] } });
    mocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'list_organization_sessions') return { data: sessions, error: null };
      if (name === 'revoke_organization_session') {
        const id = args?.p_session_id;
        if (typeof id !== 'string' || !sessions.some((row) => row.session_id === id)) {
          return { data: null, error: { message: 'session not found' } };
        }
        sessions = sessions.filter((row) => row.session_id !== id);
        return { data: { session_id: id, revoked: true, revoked_at: '2026-10-23T10:16:00.000Z' }, error: null };
      }
      return { data: null, error: { message: 'unexpected RPC' } };
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
    vi.restoreAllMocks();
  });

  async function mount() {
    await act(async () => {
      root?.render(<DeviceManagement onNotice={mocks.onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it('loads server-backed tenant sessions and revokes one selected non-current session only after exact acknowledgement', async () => {
    const onNotice = vi.fn();
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).toContain('جلسات المؤسسة المسجلة خادميًا');
    expect(host?.textContent).toContain('مدير النظام');
    expect(host?.textContent).toContain('موظف الاختبار');
    expect(host?.textContent).toContain('عنوان الشبكة');
    expect(mocks.rpc).toHaveBeenCalledWith('list_organization_sessions', { p_limit: 100 });

    const currentRevoke = host?.querySelector<HTMLButtonElement>(
      'button[aria-label="إبطال جلسة مدير النظام"]',
    );
    expect(currentRevoke?.disabled).toBe(true);

    await act(async () => {
      host?.querySelector<HTMLButtonElement>(
        'button[aria-label="إبطال جلسة موظف الاختبار"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledWith('revoke_organization_session', {
      p_session_id: OTHER_SESSION_ID,
    });
    expect(host?.textContent).not.toContain('موظف الاختبار');
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('أكد الخادم إبطال الجلسة المحددة'));
  });

  it('fails closed when the server session-list contract is missing or malformed', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: { sessions: [sessions[0]] },
      error: null,
    });
    await mount();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      'تعذر تحميل قائمة الجلسات المركزية من الخادم',
    );
    expect(host?.textContent).not.toContain('مدير النظام');
    expect(host?.textContent).not.toContain('موظف الاختبار');
  });

  it('does not show a success notice when the revocation RPC fails', async () => {
    const onNotice = vi.fn();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_sessions') return { data: sessions, error: null };
      return { data: null, error: { message: 'permission denied' } };
    });
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await act(async () => {
      host?.querySelector<HTMLButtonElement>(
        'button[aria-label="إبطال جلسة موظف الاختبار"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(onNotice).not.toHaveBeenCalled();
    expect(host?.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0);
    expect(host?.textContent).toContain('تعذر تأكيد إبطال الجلسة المحددة');
    expect(host?.textContent).toContain('موظف الاختبار');
  });

  it('does not call organization session RPCs for a non-admin role or permit organization revocation', async () => {
    mocks.useAuth.mockReturnValue({ user: { profileId: 'manager-profile', roles: ['manager'] } });
    const onNotice = vi.fn();
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(host?.textContent).toContain('لا تملك صلاحية إدارة جلسات بقية مستخدمي المؤسسة');
    expect(host?.querySelector('button[aria-label="إبطال جلسة موظف الاختبار"]')).toBeNull();
  });

  it('keeps account-level sign-out actions separate from organization session management', async () => {
    const onNotice = vi.fn();
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      host?.querySelector<HTMLButtonElement>(
        'button[aria-label="تسجيل الخروج من الأجهزة الأخرى"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'others' });
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('لا يخص بقية مستخدمي المؤسسة'));
  });

  it('uses local scope for current-device logout', async () => {
    const onNotice = vi.fn();
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      host?.querySelector<HTMLButtonElement>(
        'button[aria-label="تسجيل الخروج من هذا الجهاز"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(onNotice).toHaveBeenCalledWith('تم تسجيل الخروج من هذا الجهاز.');
  });
});
