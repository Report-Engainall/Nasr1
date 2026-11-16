// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./AdminPages";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/useFetch";
import { ADMIN_NAV_PATHS, roleCanAccessView } from "@/lib/admin-access-matrix";
import { fireEvent, within } from "@testing-library/react";

const supabaseRpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: supabaseRpc },
  getCurrentTenantScope: vi.fn(),
}));

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
  it("unifies roles, warehouse scopes and explicit denials in one member card", async () => {
    supabaseRpc.mockResolvedValue({
      data: [
        {
          profile_id: "manager-profile",
          full_name: "موظف المخزن",
          email: "warehouse@example.invalid",
          is_active: true,
          roles: ["manager"],
        },
        {
          profile_id: "customer-profile",
          full_name: "عميل منفصل",
          email: "customer@example.invalid",
          is_active: true,
          roles: ["customer"],
        },
      ],
      error: null,
    });

    renderForRoles(["admin"]);
    fireEvent.click(screen.getByRole("button", { name: "المستخدمون والصلاحيات", exact: true }));

    expect(await screen.findByRole("heading", { name: "المستخدمون والأدوار", exact: true })).toBeInTheDocument();
    expect(await screen.findByText("موظف المخزن")).toBeInTheDocument();

    const managerCard = screen.getByText("موظف المخزن").closest("article");
    expect(managerCard).not.toBeNull();
    const managerControls = within(managerCard as HTMLElement);
    expect(managerControls.getByRole("checkbox", { name: "مسؤول العملاء" })).toBeInTheDocument();
    expect(managerControls.getByRole("button", { name: "إدارة نطاقات الوصول" })).toBeEnabled();
    expect(managerControls.getByRole("button", { name: "إدارة المنع الصريح للقدرات" })).toBeEnabled();

    const customerCard = screen.getByText("عميل منفصل").closest("article");
    expect(customerCard).not.toBeNull();
    const customerControls = within(customerCard as HTMLElement);
    expect(customerControls.getByRole("checkbox", { name: "مسؤول العملاء" })).toBeDisabled();
    expect(customerControls.getByRole("button", { name: "إدارة نطاقات الوصول" })).toBeDisabled();
    expect(customerControls.getByRole("button", { name: "إدارة المنع الصريح للقدرات" })).toBeDisabled();

    expect(screen.queryByRole("heading", { name: "إدارة مسؤول العملاء ونطاقات المستودعات" })).not.toBeInTheDocument();
    expect(supabaseRpc).toHaveBeenCalledWith("list_organization_user_roles");
  });

});
