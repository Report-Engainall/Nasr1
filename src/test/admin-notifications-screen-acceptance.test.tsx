import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Notification } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  fetchNotifications: vi.fn(),
  markAllNotificationsRead: vi.fn(),
  markNotificationRead: vi.fn(),
  refetch: vi.fn(),
  useFetch: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchNotifications: mocks.fetchNotifications,
    markAllNotificationsRead: mocks.markAllNotificationsRead,
    markNotificationRead: mocks.markNotificationRead,
  };
});

vi.mock("@/lib/useFetch", () => ({ useFetch: mocks.useFetch }));

import { Notifications } from "@/components/AdminPages";

const unreadNotice: Notification = {
  id: "notice-001",
  organization_id: "org-001",
  profile_id: "profile-001",
  title: "طلب يحتاج متابعة",
  body: "تم إنشاء طلب يحتاج مراجعة.",
  type: "order",
  is_read: false,
  created_at: "2026-10-24T10:00:00.000Z",
};
const readNotice: Notification = {
  ...unreadNotice,
  id: "notice-002",
  title: "تحديث إعدادات",
  body: null,
  is_read: true,
};

function showState(data: Notification[] | null, options?: { loading?: boolean; error?: string | null }) {
  mocks.useFetch.mockReturnValue({
    data,
    loading: options?.loading ?? false,
    error: options?.error ?? null,
    refetch: mocks.refetch,
  });
}

describe("admin notifications live screen acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.refetch.mockResolvedValue(undefined);
    mocks.markAllNotificationsRead.mockResolvedValue(undefined);
    mocks.markNotificationRead.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not report an unknown notification count as zero during loading or error", () => {
    showState(null, { loading: true });
    const { rerender } = render(<Notifications onNotice={vi.fn()} />);
    expect(screen.getByText("جار تحميل البيانات...")).toBeInTheDocument();
    expect(screen.getByText("عدد التنبيهات غير متاح")).toBeInTheDocument();
    expect(screen.queryByText(/0 تنبيه/)).not.toBeInTheDocument();

    showState(null, { error: "تعذر الوصول إلى الخدمة" });
    rerender(<Notifications onNotice={vi.fn()} />);
    expect(screen.getByText(/تعذر تحميل البيانات\. تعذر الوصول إلى الخدمة/)).toBeInTheDocument();
    expect(screen.getByText("عدد التنبيهات غير متاح")).toBeInTheDocument();
    expect(screen.queryByText(/0 تنبيه/)).not.toBeInTheDocument();
  });

  it("renders a first-class empty state when the server confirms there are no notifications", () => {
    showState([]);
    render(<Notifications onNotice={vi.fn()} />);
    expect(screen.getByText("لا توجد تنبيهات حالياً.")).toBeInTheDocument();
    expect(screen.getByText("0 تنبيه — 0 غير مقروء")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تعليم الكل كمقروء" })).not.toBeInTheDocument();
  });

  it("marks a single unread notification as read with mouse or keyboard and reports failures", async () => {
    showState([unreadNotice, readNotice]);
    const onNotice = vi.fn();
    render(<Notifications onNotice={onNotice} />);

    const unread = screen.getByRole("button", { name: "تعليم التنبيه كمقروء: طلب يحتاج متابعة" });
    fireEvent.keyDown(unread, { key: "Enter" });
    await waitFor(() => expect(mocks.markNotificationRead).toHaveBeenCalledWith("notice-001"));
    expect(mocks.refetch).toHaveBeenCalled();
    expect(screen.getByText("تحديث إعدادات")).toBeInTheDocument();

    mocks.markNotificationRead.mockRejectedValueOnce(new Error("تعذر حفظ حالة القراءة"));
    fireEvent.click(unread);
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("تعذر حفظ حالة القراءة"));
  });

  it("marks all notifications read only after the mutation succeeds and reports server errors", async () => {
    showState([unreadNotice, readNotice]);
    const onNotice = vi.fn();
    render(<Notifications onNotice={onNotice} />);

    fireEvent.click(screen.getByRole("button", { name: "تعليم الكل كمقروء" }));
    await waitFor(() => expect(mocks.markAllNotificationsRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("تم تعليم الكل كمقروء"));
    expect(mocks.refetch).toHaveBeenCalled();

    mocks.markAllNotificationsRead.mockRejectedValueOnce(new Error("رفض الخادم العملية"));
    fireEvent.click(screen.getByRole("button", { name: "تعليم الكل كمقروء" }));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("رفض الخادم العملية"));
  });
});
