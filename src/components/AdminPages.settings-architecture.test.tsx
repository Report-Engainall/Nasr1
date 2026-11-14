// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./AdminPages";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/useFetch";
import { ADMIN_NAV_PATHS, roleCanAccessView } from "@/lib/admin-access-matrix";

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

describe("observability architecture route is not duplicated in general settings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["admin", "manager"])("%s retains the canonical architecture route", (role) => {
    expect(ADMIN_NAV_PATHS.architecture).toBe("/admin/architecture");
    expect(roleCanAccessView(role, "architecture")).toBe(true);

    renderForRoles([role]);
    expect(screen.queryByRole("button", { name: "معمارية النظام" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "معمارية النظام" })).not.toBeInTheDocument();
  });

  it.each(["customer", "customer_manager", "staff", "accountant"])(
    "%s cannot access the architecture route or see an observability settings panel",
    (role) => {
      expect(roleCanAccessView(role, "architecture")).toBe(false);

      renderForRoles([role]);
      expect(screen.queryByRole("button", { name: "معمارية النظام" })).not.toBeInTheDocument();
      expect(screen.queryByRole("region", { name: "معمارية النظام" })).not.toBeInTheDocument();
    },
  );
});
