// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsPage } from "./AdminPages";
import { useAuth } from "@/lib/auth";
import { useFetch } from "@/lib/useFetch";
import { ADMIN_NAV_PATHS, roleCanAccessView } from "@/lib/admin-access-matrix";


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
    supabaseRpc.mockImplementation(async (functionName: string) => {
      if (functionName === "list_organization_user_roles") {
        return {
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
        };
      }
      if (functionName === "list_authorization_scope_resources") {
        return {
          data: {
            warehouses: [{ id: "warehouse-1", name: "مستودع صنعاء", code: "WH-01" }],
            customers: [{ id: "customer-1", name: "عميل تجريبي", code: "CUS-001" }],
          },
          error: null,
        };
      }
      if (functionName === "list_authorization_profile_scopes") {
        return { data: [], error: null };
      }
      return { data: null, error: { message: "Unexpected RPC: " + functionName } };
    });

    renderForRoles(["admin"]);
    fireEvent.click(screen.getByRole("button", { name: "المستخدمون والصلاحيات" }));

    expect(await screen.findByRole("heading", { name: "المستخدمون والأدوار" })).toBeInTheDocument();
    expect(await screen.findByText("موظف المخزن")).toBeInTheDocument();

    const managerCard = screen.getByText("موظف المخزن").closest("article");
    expect(managerCard).not.toBeNull();
    const managerControls = within(managerCard as HTMLElement);
    expect(managerControls.getByRole("checkbox", { name: "مسؤول العملاء" })).toBeInTheDocument();
    const scopeButton = managerControls.getByRole("button", { name: "إدارة نطاقات الوصول" });
    expect(scopeButton).toBeEnabled();
    expect(managerControls.getByRole("button", { name: "إدارة المنع الصريح للقدرات" })).toBeEnabled();
    fireEvent.click(scopeButton);
    const scopeType = await screen.findByRole("combobox", { name: "نوع نطاق الوصول لـ موظف المخزن" });
    expect(within(scopeType).getByRole("option", { name: "عميل مسند" })).toBeInTheDocument();
    fireEvent.change(scopeType, { target: { value: "assigned_customer" } });
    expect(await screen.findByRole("combobox", { name: "العميل لإسناده إلى موظف المخزن" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "عميل تجريبي — CUS-001" })).toBeInTheDocument();

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
