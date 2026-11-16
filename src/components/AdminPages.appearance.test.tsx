// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "./AdminPages";
import { ADMIN_THEME_UPDATE_EVENT, DEFAULT_ADMIN_THEME_PALETTE } from "@/lib/admin-theme";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  useFetch: vi.fn(),
  updateSetting: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/useFetch", () => ({ useFetch: mocks.useFetch }));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal()),
  updateSetting: mocks.updateSetting,
}));

const initialSettings = [
  { key: "store_name", value: "متجر الأغبري" },
  { key: "theme_palette", value: DEFAULT_ADMIN_THEME_PALETTE },
];

function renderForRoles(roles: string[], onNotice = vi.fn()) {
  mocks.useAuth.mockReturnValue({
    user: {
      id: "appearance-test-user",
      profileId: "appearance-test-profile",
      email: "appearance@example.invalid",
      name: "اختبار المظهر",
      roles,
      isStaff: roles.some((role) => ["admin", "manager", "staff", "accountant"].includes(role)),
    },
  });
  mocks.useFetch.mockReturnValue({
    data: initialSettings,
    loading: false,
    error: null,
    refetch: mocks.refetch,
  });
  return { ...render(<SettingsPage onNotice={onNotice} />), onNotice };
}

function openAppearance(container: HTMLElement) {
  fireEvent.click(screen.getByRole("button", { name: "المظهر" }));
  expect(container.querySelector('[aria-label="إعداد مظهر المؤسسة"]')).toBeInTheDocument();
}

describe("organization appearance settings integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateSetting.mockResolvedValue(undefined);
    mocks.refetch.mockResolvedValue(initialSettings);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("previews a selected preset without writing until save, then persists and emits the application event", async () => {
    const listener = vi.fn();
    window.addEventListener(ADMIN_THEME_UPDATE_EVENT, listener);
    const { container, onNotice } = renderForRoles(["manager"]);
    openAppearance(container);

    const turquoise = screen.getByRole("button", { name: /تركواز مشرق/ });
    fireEvent.click(turquoise);

    expect(turquoise).toHaveAttribute("aria-pressed", "true");
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(container.querySelector('[aria-label="معاينة المظهر قبل الحفظ"]')).toHaveTextContent("معاينة هوية المؤسسة");

    fireEvent.click(screen.getByRole("button", { name: "حفظ وتطبيق المظهر" }));
    await waitFor(() => {
      expect(mocks.updateSetting).toHaveBeenCalledWith(
        "theme_palette",
        { id: "turquoise", primary: "#0b929f", accent: "#27b69f" },
        "appearance",
      );
    });
    await waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
    expect(onNotice).toHaveBeenCalledWith("تم حفظ لوحة المظهر وتطبيقها على صفحات المؤسسة.");

    window.removeEventListener(ADMIN_THEME_UPDATE_EVENT, listener);
  });

  it("restores the canonical Aghbari palette through the same organization setting writer", async () => {
    const { container } = renderForRoles(["admin"]);
    openAppearance(container);
    fireEvent.click(screen.getByRole("button", { name: "استعادة الافتراضي" }));

    await waitFor(() => {
      expect(mocks.updateSetting).toHaveBeenCalledWith(
        "theme_palette",
        DEFAULT_ADMIN_THEME_PALETTE,
        "appearance",
      );
    });
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the palette read-only for staff and disables every mutation control", () => {
    const { container } = renderForRoles(["staff"]);
    openAppearance(container);

    expect(screen.getByRole("status")).toHaveTextContent("المظهر للقراءة فقط");
    expect(screen.getByRole("button", { name: /تركواز مشرق/ })).toBeDisabled();
    expect(screen.getByLabelText("اللون الأساسي")).toBeDisabled();
    expect(screen.getByLabelText("لون التمييز")).toBeDisabled();
    expect(screen.getByRole("button", { name: "استعادة الافتراضي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "حفظ وتطبيق المظهر" })).toBeDisabled();
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it("does not broadcast a new appearance when persistence fails", async () => {
    const listener = vi.fn();
    const { container, onNotice } = renderForRoles(["manager"], onNoticeSpy());
    mocks.updateSetting.mockRejectedValueOnce(new Error("فشل حفظ لوحة المظهر"));
    window.addEventListener(ADMIN_THEME_UPDATE_EVENT, listener);
    openAppearance(container);

    fireEvent.click(screen.getByRole("button", { name: "حفظ وتطبيق المظهر" }));
    await waitFor(() => expect(onNotice).toHaveBeenCalledWith("فشل حفظ لوحة المظهر"));
    expect(listener).not.toHaveBeenCalled();
    expect(mocks.refetch).not.toHaveBeenCalled();
    window.removeEventListener(ADMIN_THEME_UPDATE_EVENT, listener);
  });
});

function onNoticeSpy() {
  return vi.fn();
}
