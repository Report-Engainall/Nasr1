// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Notification } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  user: null as null | { id: string; profileId: string; isStaff: boolean },
  notifications: [] as Notification[],
  navigate: vi.fn(),
  useFetch: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user, ready: true, sessionRevision: 1 }),
}));
vi.mock("@/lib/useFetch", () => ({ useFetch: mocks.useFetch }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode; [key: string]: unknown }) =>
    <a href={to} {...props}>{children}</a>,
  useNavigate: () => mocks.navigate,
}));
vi.mock("@/lib/api", () => ({
  fetchNotifications: vi.fn(),
  fetchOlderNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: mocks.markNotificationRead,
}));
vi.mock("@/components/Login", () => ({
  Login: () => <div>تسجيل الدخول مطلوب</div>,
}));

import { CustomerNotificationCenter } from "@/components/CustomerNotificationCenter";

const CASE_ID = "11111111-1111-4111-8111-111111111111";
const CASE_CODE = "CASE-A1B2C3D4E5";

function serviceCaseNotification(title: string): Notification {
  return {
    id: "notice-001",
    organization_id: "org-001",
    profile_id: "profile-001",
    title,
    body: "تفاصيل متابعة الحالة",
    type: "info",
    is_read: true,
    created_at: "2026-11-17T00:00:00.000Z",
    entity_type: "customer_service_case",
    entity_id: CASE_ID,
  };
}

describe("customer service notification navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "user-001", profileId: "profile-001", isStaff: false };
    mocks.notifications = [serviceCaseNotification("تحديث حالة الخدمة: " + CASE_CODE)];
    mocks.navigate.mockResolvedValue(undefined);
    mocks.markNotificationRead.mockResolvedValue(undefined);
    mocks.useFetch.mockImplementation(() => ({
      data: mocks.notifications,
      loading: false,
      error: null,
      refetch: vi.fn().mockResolvedValue(undefined),
    }));
  });

  afterEach(() => cleanup());

  it.each([
    { isStaff: true, button: "فتح مكتب خدمة العملاء", route: "/admin/service-desk" },
    { isStaff: false, button: "فتح مركز خدمة العملاء", route: "/service-cases" },
  ])("opens the matching case for staff and customers", async ({ isStaff, button, route }) => {
    mocks.user = { id: "user-001", profileId: "profile-001", isStaff };
    render(<CustomerNotificationCenter />);

    fireEvent.click(screen.getByRole("button", { name: button }));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith({
      to: route,
      search: { caseCode: CASE_CODE },
    }));
  });

  it("does not offer a misleading generic destination when the case code is absent", () => {
    mocks.notifications = [serviceCaseNotification("تحديث خدمة العملاء")];
    render(<CustomerNotificationCenter />);
    expect(screen.queryByRole("button", { name: /فتح .*خدمة العملاء/ })).not.toBeInTheDocument();
  });
});
