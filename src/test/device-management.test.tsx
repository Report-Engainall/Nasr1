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

function revokeOrganizationSession(
  currentSessions: ReturnType<typeof makeSession>[],
  requestedSessionId: unknown,
) {
  if (
    typeof requestedSessionId !== "string"
    || !currentSessions.some((row) => row.session_id === requestedSessionId)
  ) {
    return {
      sessions: currentSessions,
      response: { data: null, error: { message: "session not found" } },
    };
  }

  return {
    sessions: currentSessions.filter((row) => row.session_id !== requestedSessionId),
    response: {
      data: { session_id: requestedSessionId, revoked: true, revoked_at: "2026-10-23T10:16:00.000Z" },
      error: null,
    },
  };
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

  async function resolveDeviceManagementRpc(name: string, args?: Record<string, unknown>) {
    if (name === 'list_organization_sessions') return { data: sessions, error: null };
    if (name !== 'revoke_organization_session') {
      return { data: null, error: { message: 'unexpected RPC' } };
    }
    const outcome = revokeOrganizationSession(sessions, args?.p_session_id);
    sessions = outcome.sessions;
    return outcome.response;
  }

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
    mocks.rpc.mockImplementation(resolveDeviceManagementRpc);
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
    expect(mocks.rpc).toHaveBeenCalledWith('list_organization_sessions', { p_limit: 200 });

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

  it('routes sibling sessions of the current account through self-scoped bulk revocation only', async () => {
    sessions = [
      makeSession(CURRENT_SESSION_ID, 'مدير النظام', true),
      {
        ...makeSession(OTHER_SESSION_ID, 'جهاز المدير الثاني', false),
        profile_id: 'admin-profile',
        email: 'admin@example.test',
      },
    ];
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_sessions') return { data: sessions, error: null };
      if (name === 'revoke_other_auth_sessions') {
        const revokedIds = sessions
          .filter((row) => row.session_id !== CURRENT_SESSION_ID)
          .map((row) => row.session_id);
        sessions = sessions.filter((row) => row.session_id === CURRENT_SESSION_ID);
        return {
          data: {
            current_session_id: CURRENT_SESSION_ID,
            revoked_count: revokedIds.length,
            revoked_session_ids: revokedIds,
            revoked_at: '2026-10-23T10:16:00.000Z',
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'unexpected or prohibited organization-level RPC' } };
    });
    await mount();

    const siblingButton = host?.querySelector<HTMLButtonElement>(
      'button[aria-label="إبطال جلسة جهاز المدير الثاني"]',
    );
    expect(host?.textContent).toContain('جلسة أخرى لحسابك');
    expect(siblingButton?.disabled).toBe(true);
    await act(async () => {
      siblingButton?.click();
      await Promise.resolve();
    });
    expect(mocks.rpc).not.toHaveBeenCalledWith('revoke_organization_session', {
      p_session_id: OTHER_SESSION_ID,
    });

    await act(async () => {
      host?.querySelector<HTMLButtonElement>(
        'button[aria-label="تسجيل الخروج من الأجهزة الأخرى"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledWith('revoke_other_auth_sessions', undefined);
    expect(mocks.rpc).not.toHaveBeenCalledWith('revoke_organization_session', {
      p_session_id: OTHER_SESSION_ID,
    });
    expect(host?.textContent).toContain('مدير النظام');
    expect(host?.textContent).not.toContain('جهاز المدير الثاني');
    expect(mocks.onNotice).toHaveBeenCalledWith(expect.stringContaining('1 جلسة أخرى لهذا الحساب'));
  });

  it('does not let a slow pre-revocation session read restore rows removed by a newer read', async () => {
    const preRevocationRows = [...sessions];
    let resolveInitialList: ((value: { data: unknown; error: null }) => void) | undefined;
    let listCalls = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_sessions') {
        listCalls += 1;
        if (listCalls === 1) {
          return await new Promise<{ data: unknown; error: null }>((resolve) => {
            resolveInitialList = resolve;
          });
        }
        return { data: sessions.filter((row) => row.session_id === CURRENT_SESSION_ID), error: null };
      }
      if (name === 'revoke_other_auth_sessions') {
        sessions = sessions.filter((row) => row.session_id === CURRENT_SESSION_ID);
        return {
          data: {
            current_session_id: CURRENT_SESSION_ID,
            revoked_count: 1,
            revoked_session_ids: [OTHER_SESSION_ID],
            revoked_at: '2026-10-23T10:16:00.000Z',
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'unexpected RPC' } };
    });

    await mount();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'list_organization_sessions')).toHaveLength(1);

    await act(async () => {
      host?.querySelector<HTMLButtonElement>(
        'button[aria-label="تسجيل الخروج من الأجهزة الأخرى"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).not.toContain('موظف الاختبار');
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'list_organization_sessions')).toHaveLength(2);

    await act(async () => {
      resolveInitialList?.({ data: preRevocationRows, error: null });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).not.toContain('موظف الاختبار');
    expect(host?.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not issue duplicate revocation RPCs for rapid repeated clicks', async () => {
    let finishRevocation: ((value: { data: unknown; error: null }) => void) | undefined;
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'list_organization_sessions') return Promise.resolve({ data: sessions, error: null });
      if (name === 'revoke_organization_session') {
        return new Promise((resolve) => { finishRevocation = resolve; });
      }
      return Promise.resolve({ data: null, error: { message: 'unexpected RPC' } });
    });

    await mount();
    const revoke = host?.querySelector<HTMLButtonElement>(
      'button[aria-label="إبطال جلسة موظف الاختبار"]',
    );
    expect(revoke).not.toBeNull();

    await act(async () => {
      revoke?.click();
      revoke?.click();
    });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'revoke_organization_session')).toHaveLength(1);

    await act(async () => {
      finishRevocation?.({
        data: { session_id: OTHER_SESSION_ID, revoked: true, revoked_at: '2026-10-23T10:16:00.000Z' },
        error: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'revoke_organization_session')).toHaveLength(1);
  });

  it('recovers from a network failure when the administrator retries the session list', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('network interrupted'));
    await mount();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      'تعذر تحميل قائمة الجلسات المركزية من الخادم',
    );
    expect(host?.textContent).not.toContain('موظف الاختبار');

    const retry = Array.from(host?.querySelectorAll<HTMLButtonElement>('button') ?? [])
      .find((button) => button.textContent?.includes('إعادة المحاولة'));
    expect(retry).toBeDefined();
    await act(async () => {
      retry?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).toContain('موظف الاختبار');
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'list_organization_sessions')).toHaveLength(2);
  });

  it('fails closed when the server returns duplicate session identifiers', async () => {
    sessions = [
      makeSession(CURRENT_SESSION_ID, 'مدير النظام', true),
      makeSession(CURRENT_SESSION_ID, 'موظف مكرر', false),
    ];
    await mount();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      'تعذر تحميل قائمة الجلسات المركزية من الخادم',
    );
    expect(host?.textContent).not.toContain('مدير النظام');
    expect(host?.textContent).not.toContain('موظف مكرر');
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
    // A failed refresh clears the list instead of retaining potentially stale session data.
    expect(host?.textContent).not.toContain('موظف الاختبار');
  });

  it('rejects a success-shaped acknowledgement for a different session id', async () => {
    const onNotice = vi.fn();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_sessions') return { data: sessions, error: null };
      if (name === 'revoke_organization_session') {
        return {
          data: { session_id: CURRENT_SESSION_ID, revoked: true, revoked_at: '2026-10-23T10:16:00.000Z' },
          error: null,
        };
      }
      return { data: null, error: { message: 'unexpected RPC' } };
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
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      'تعذر تأكيد إبطال الجلسة المحددة',
    );
    expect(host?.textContent).not.toContain('موظف الاختبار');
  });

  it('rejects a session-revocation acknowledgement without a valid server timestamp', async () => {
    const onNotice = vi.fn();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_sessions') return { data: sessions, error: null };
      if (name === 'revoke_organization_session') {
        return {
          data: { session_id: OTHER_SESSION_ID, revoked: true, revoked_at: 'not-a-timestamp' },
          error: null,
        };
      }
      return { data: null, error: { message: 'unexpected RPC' } };
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

    expect(mocks.rpc).toHaveBeenCalledWith('revoke_organization_session', {
      p_session_id: OTHER_SESSION_ID,
    });
    expect(onNotice).not.toHaveBeenCalled();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      'تعذر تأكيد إبطال الجلسة المحددة',
    );
    expect(host?.textContent).not.toContain('موظف الاختبار');
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

  it('prevents duplicate self-session revocation requests on rapid repeated clicks', async () => {
    const onNotice = mocks.onNotice;
    const revokedIds = [OTHER_SESSION_ID];
    let resolveRevocation: (value: { data: unknown; error: null }) => void = () => {
      throw new Error('bulk revocation RPC was not started');
    };
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_sessions') return { data: sessions, error: null };
      if (name === 'revoke_other_auth_sessions') {
        sessions = sessions.filter((row) => row.session_id === CURRENT_SESSION_ID);
        return await new Promise<{ data: unknown; error: null }>((resolve) => {
          resolveRevocation = resolve;
        });
      }
      return { data: null, error: { message: 'unexpected RPC' } };
    });
    await mount();

    await act(async () => {
      const button = host?.querySelector<HTMLButtonElement>(
        'button[aria-label="تسجيل الخروج من الأجهزة الأخرى"]',
      );
      button?.click();
      button?.click();
      await Promise.resolve();
    });

    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'revoke_other_auth_sessions')).toHaveLength(1);

    await act(async () => {
      resolveRevocation({
        data: {
          current_session_id: CURRENT_SESSION_ID,
          revoked_count: revokedIds.length,
          revoked_session_ids: revokedIds,
          revoked_at: '2026-10-23T10:16:00.000Z',
        },
        error: null,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc.mock.calls.filter(([name]) => name === 'revoke_other_auth_sessions')).toHaveLength(1);
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('1 جلسة أخرى لهذا الحساب'));
  });

  it('uses the server-owned self-scoped RPC to revoke other sessions and preserves the current session', async () => {
    const onNotice = mocks.onNotice;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_sessions') return { data: sessions, error: null };
      if (name === 'revoke_other_auth_sessions') {
        const revokedIds = sessions
          .filter((row) => row.session_id !== CURRENT_SESSION_ID)
          .map((row) => row.session_id);
        sessions = sessions.filter((row) => row.session_id === CURRENT_SESSION_ID);
        return {
          data: {
            current_session_id: CURRENT_SESSION_ID,
            revoked_count: revokedIds.length,
            revoked_session_ids: revokedIds,
            revoked_at: '2026-10-23T10:16:00.000Z',
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'unexpected RPC' } };
    });
    await mount();

    await act(async () => {
      host?.querySelector<HTMLButtonElement>(
        'button[aria-label="تسجيل الخروج من الأجهزة الأخرى"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledWith('revoke_other_auth_sessions', undefined);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining('1 جلسة أخرى لهذا الحساب'));
    expect(host?.textContent).toContain('مدير النظام');
    expect(host?.textContent).not.toContain('موظف الاختبار');
  });

  it('does not report bulk revocation success when the server acknowledgement is malformed', async () => {
    const onNotice = mocks.onNotice;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === 'list_organization_sessions') return { data: sessions, error: null };
      if (name === 'revoke_other_auth_sessions') {
        return {
          data: {
            current_session_id: OTHER_SESSION_ID,
            revoked_count: 1,
            revoked_session_ids: [OTHER_SESSION_ID, OTHER_SESSION_ID],
            revoked_at: 'not-a-timestamp',
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'unexpected RPC' } };
    });
    await mount();

    await act(async () => {
      host?.querySelector<HTMLButtonElement>(
        'button[aria-label="تسجيل الخروج من الأجهزة الأخرى"]',
      )?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledWith('revoke_other_auth_sessions', undefined);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(onNotice).not.toHaveBeenCalled();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      'تعذر تأكيد إبطال الجلسات الأخرى لهذا الحساب عبر الخادم',
    );
  });

  it('prevents duplicate local sign-out requests and clears the session after acknowledgement', async () => {
    let finishSignOut: ((value: { error: null }) => void) | undefined;
    mocks.signOut.mockImplementation(() => new Promise((resolve) => {
      finishSignOut = resolve;
    }));
    await mount();

    const button = host?.querySelector<HTMLButtonElement>(
      'button[aria-label="تسجيل الخروج من هذا الجهاز"]',
    );
    expect(button?.disabled).toBe(false);
    await act(async () => {
      button?.click();
      button?.click();
      await Promise.resolve();
    });

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(host?.textContent).toContain('admin@example.test');

    await act(async () => {
      finishSignOut?.({ error: null });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mocks.onNotice).toHaveBeenCalledTimes(1);
    expect(host?.textContent).not.toContain('admin@example.test');
    expect(button?.disabled).toBe(true);
  });

  it('retains the session after local sign-out failure and permits a retry', async () => {
    mocks.signOut
      .mockRejectedValueOnce(new Error('network interrupted'))
      .mockResolvedValueOnce({ error: null });
    const onNotice = vi.fn();
    await act(async () => {
      root?.render(<DeviceManagement onNotice={onNotice} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const button = host?.querySelector<HTMLButtonElement>(
      'button[aria-label="تسجيل الخروج من هذا الجهاز"]',
    );
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      'تعذر تسجيل الخروج من هذا الجهاز',
    );
    expect(host?.textContent).toContain('admin@example.test');
    expect(onNotice).not.toHaveBeenCalled();
    expect(button?.disabled).toBe(false);

    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.signOut).toHaveBeenCalledTimes(2);
    expect(mocks.signOut).toHaveBeenNthCalledWith(2, { scope: 'local' });
    expect(onNotice).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith('تم تسجيل الخروج من هذا الجهاز.');
    expect(host?.textContent).not.toContain('admin@example.test');
    expect(button?.disabled).toBe(true);
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
