import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function createAdminSessionResponse(payload: string) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  return {
    data: {
      session: {
        access_token: `header.${payload}.signature`,
        expires_at: expiresAt,
        user: { email: "admin@example.test" },
      },
    },
    error: null,
  };
}

function makeSessions(count: number, startIndex = 0) {
  return Array.from({ length: count }, (_, offset) => {
    const index = startIndex + offset;
    return {
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
    };
  });
}

describe("device-session inventory result limit", () => {
  beforeEach(() => {
    const payload = window.btoa(JSON.stringify({
      session_id: CURRENT_SESSION_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
    }));
    authMocks.getSession.mockReset().mockResolvedValue(createAdminSessionResponse(payload));
    authMocks.rpc.mockReset().mockResolvedValue({
      data: makeSessions(2),
      error: null,
    });
  });

  afterEach(() => cleanup());

  it("uses an extra row to expose a load-more cursor instead of truncating at 200", async () => {
    authMocks.rpc.mockResolvedValue({ data: makeSessions(201), error: null });
    render(<DeviceManagement onNotice={vi.fn()} />);

    await waitFor(() => expect(authMocks.rpc).toHaveBeenCalledWith("list_organization_sessions", {
      p_limit: 201,
      p_after_activity_at: null,
      p_after_created_at: null,
      p_after_session_id: null,
    }));
    expect(await screen.findByText("مستخدم اختبار 200")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تحميل المزيد من الجلسات" })).toBeInTheDocument();
    expect(screen.queryByText(/لا تعتبر هذه القائمة جردًا كاملًا عند بلوغ الحد/)).not.toBeInTheDocument();
  });

  it("loads the next server page from the last visible row without truncating the inventory", async () => {
    authMocks.rpc
      .mockResolvedValueOnce({ data: makeSessions(201), error: null })
      .mockResolvedValueOnce({ data: makeSessions(3, 200), error: null });
    render(<DeviceManagement onNotice={vi.fn()} />);

    fireEvent.click(await screen.findByRole("button", { name: "تحميل المزيد من الجلسات" }));
    await waitFor(() => expect(authMocks.rpc).toHaveBeenNthCalledWith(2, "list_organization_sessions", {
      p_limit: 201,
      p_after_activity_at: "2026-10-30T00:30:00.000Z",
      p_after_created_at: "2026-10-30T00:00:00.000Z",
      p_after_session_id: "30000000-0000-4000-8000-000000000200",
    }));
    expect(await screen.findByText("مستخدم اختبار 203")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تحميل المزيد من الجلسات" })).not.toBeInTheDocument();
  });

  it("marks a short initial page as complete without a load-more action", async () => {
    render(<DeviceManagement onNotice={vi.fn()} />);
    await screen.findByText("جلسات المؤسسة المسجلة خادميًا");
    await waitFor(() => expect(authMocks.rpc).toHaveBeenCalledWith("list_organization_sessions", {
      p_limit: 201,
      p_after_activity_at: null,
      p_after_created_at: null,
      p_after_session_id: null,
    }));
    expect(screen.getByText(/اكتمل تحميل جميع الجلسات التي أعادها الخادم/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تحميل المزيد من الجلسات" })).not.toBeInTheDocument();
  });
});
