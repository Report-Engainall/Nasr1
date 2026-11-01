import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "auth-admin",
      profileId: "10000000-0000-4000-8000-000000000001",
      email: "admin@example.test",
      name: "مدير الاختبار",
      roles: ["admin"],
      isStaff: true,
    },
  }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: authMocks.getSession },
    rpc: authMocks.rpc,
  },
}));

import { DeviceManagement } from "@/components/DeviceManagement";

const CURRENT_SESSION_ID = "30000000-0000-4000-8000-000000000001";
const CURRENT_PROFILE_ID = "10000000-0000-4000-8000-000000000001";
const OTHER_PROFILE_ID = "10000000-0000-4000-8000-000000000002";

function makeSessions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    session_id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    profile_id: index === 0 ? CURRENT_PROFILE_ID : OTHER_PROFILE_ID,
    display_name: index === 0 ? "مدير الاختبار" : `مستخدم اختبار ${index + 1}`,
    email: index === 0 ? "admin@example.test" : `user${index + 1}@example.test`,
    created_at: "2026-10-30T00:00:00.000Z",
    last_activity_at: "2026-10-30T00:30:00.000Z",
    expires_at: "2026-10-30T01:00:00.000Z",
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/156.0.0.0",
    ip_address: null,
    is_current_session: index === 0,
  }));
}

function sessionResult(accessToken: string) {
  return {
    data: {
      session: {
        access_token: accessToken,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { email: "admin@example.test" },
      },
    },
    error: null,
  };
}

describe("device-session inventory result limit", () => {
  beforeEach(() => {
    const payload = window.btoa(JSON.stringify({
      session_id: CURRENT_SESSION_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }));
    authMocks.getSession.mockReset().mockResolvedValue(sessionResult(`header.${payload}.signature`));
    authMocks.rpc.mockReset().mockResolvedValue({
      data: makeSessions(2),
      error: null,
    });
  });

  afterEach(() => cleanup());

  it("requests the server maximum and warns when the result reaches the non-paginated cap", async () => {
    authMocks.rpc.mockResolvedValue({
      data: makeSessions(200),
      error: null,
    });
    render(<DeviceManagement onNotice={vi.fn()} />);

    await waitFor(() => {
      expect(authMocks.rpc).toHaveBeenCalledWith("list_organization_sessions", { p_limit: 200 });
    });
    const warning = await screen.findByText(/يعرض الخادم حتى 200 جلسة نشطة في هذا الطلب/);
    expect(warning.closest('[role="status"]')).not.toBeNull();
    expect(warning).toHaveTextContent("لا تعتبر هذه القائمة جردًا كاملًا عند بلوغ الحد");
  });

  it("does not show a truncation warning when the returned list is below the cap", async () => {
    render(<DeviceManagement onNotice={vi.fn()} />);

    await screen.findByText("جلسات المؤسسة المسجلة خادميًا");
    await waitFor(() => expect(authMocks.rpc).toHaveBeenCalledWith(
      "list_organization_sessions",
      { p_limit: 200 },
    ));
    expect(screen.queryByText(/لا تعتبر هذه القائمة جردًا كاملًا/)).not.toBeInTheDocument();
  });
});
