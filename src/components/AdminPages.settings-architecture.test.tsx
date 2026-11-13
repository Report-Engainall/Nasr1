// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./AdminPages";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/useFetch";

vi.mock("@/lib/auth", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/useFetch", () => ({ useFetch: vi.fn() }));

afterEach(() => cleanup());

function renderForRoles(roles: string[]) {
  vi.mocked(useAuth).mockReturnValue({
    user: {
      id: "test-auth-user",
      profileId: "test-profile",
      email: "test@example.invalid",
      name: "اختبار الصلاحيات",
      roles,
      isStaff: roles.some((role) => ["admin", "manager", "staff", "accountant"].includes(role)),
    },
  } as ReturnType<typeof useAuth>);

  vi.mocked(useFetch).mockReturnValue({
    data: [{ key: "store_name", value: "متجر الأغبري" }],
    loading: false,
    error: null,
    refetch: vi.fn(),
  } as never);

  return render(<SettingsPage onNotice={vi.fn()} />);
}

describe("protected architecture registry settings tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["admin", "manager"])("%s can open the existing settings tab", async (role) => {
    renderForRoles([role]);

    fireEvent.click(screen.getByRole("button", { name: "معمارية النظام" }));

    expect(await screen.findByRole("region", { name: "معمارية النظام" })).toBeInTheDocument();
    expect(await screen.findByRole("table", { name: "المسارات المسجلة في TanStack Router" })).toBeInTheDocument();
  });

  it.each(["customer", "customer_manager", "staff", "accountant"])(
    "%s cannot see the internal architecture registry",
    (role) => {
      renderForRoles([role]);
      expect(screen.queryByRole("button", { name: "معمارية النظام" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "معمارية النظام" })).not.toBeInTheDocument();
    },
  );
});
