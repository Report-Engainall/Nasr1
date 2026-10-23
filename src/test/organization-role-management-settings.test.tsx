import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  useAuth: vi.fn(),
  fetchSettings: vi.fn(),
  updateSetting: vi.fn(),
  refetch: vi.fn(),
  settings: [] as Array<{ key: string; value: unknown }>,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, fetchSettings: mocks.fetchSettings, updateSetting: mocks.updateSetting };
});

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, useAuth: mocks.useAuth };
});

vi.mock("@/lib/useFetch", () => ({
  useFetch: () => ({ data: mocks.settings, loading: false, error: null, refetch: mocks.refetch }),
}));

vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return { ...actual, supabase: { ...actual.supabase, rpc: mocks.rpc } };
});

import { SettingsPage } from "@/components/AdminPages";

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const STAFF_ID = "22222222-2222-4222-8222-222222222222";
const userRow = (profileId: string, fullName: string, roles: string[]) => ({
  profile_id: profileId,
  full_name: fullName,
  email: fullName.toLowerCase().replace(/\s+/g, ".") + "@example.test",
  is_active: true,
  roles,
});

const cardForEmail = async (email: string) => {
  const emailNode = await screen.findByText(email, { exact: true });
  const card = emailNode.closest("article");
  expect(card).not.toBeNull();
  return card!;
};

describe("organization role management through admin settings", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.useAuth.mockReset().mockReturnValue({
      user: { profileId: ADMIN_ID, roles: ["admin"], name: "مدير الاختبار", isStaff: true },
    });
    mocks.settings = [];
    mocks.fetchSettings.mockReset().mockResolvedValue([]);
    mocks.updateSetting.mockReset().mockResolvedValue(undefined);
    mocks.refetch.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not expose the role-management entry or call its RPCs to ordinary staff", () => {
    mocks.useAuth.mockReturnValue({
      user: { profileId: STAFF_ID, roles: ["staff"], name: "موظف الاختبار", isStaff: true },
    });
    render(<SettingsPage onNotice={vi.fn()} />);

    expect(screen.queryByRole("button", { name: "المستخدمون والصلاحيات" })).toBeNull();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("loads tenant-scoped accounts and submits only the changed role set through the protected RPC", async () => {
    const rows = [userRow(STAFF_ID, "موظف اختبار", ["staff"])];
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_organization_user_roles") return { data: rows, error: null };
      if (name === "set_organization_user_roles") return { data: { profile_id: STAFF_ID, roles: ["accountant", "staff"] }, error: null };
      return { data: null, error: { message: "unexpected RPC" } };
    });

    const onNotice = vi.fn();
    render(<SettingsPage onNotice={onNotice} />);
    fireEvent.click(screen.getByRole("button", { name: "المستخدمون والصلاحيات" }));

    const card = await cardForEmail("موظف.اختبار@example.test");
    fireEvent.click(within(card!).getByLabelText("محاسب"));
    fireEvent.click(within(card!).getByRole("button", { name: "حفظ الأدوار" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("set_organization_user_roles", {
      p_profile_id: STAFF_ID,
      p_roles: ["accountant", "staff"],
    }));
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("تم حفظ أدوار موظف اختبار"));
    expect(mocks.rpc).toHaveBeenCalledWith("list_organization_user_roles");
  });

  it("disables self-role controls and gives no save action for the current administrator", async () => {
    mocks.rpc.mockResolvedValue({ data: [userRow(ADMIN_ID, "مدير الاختبار", ["admin"])], error: null });
    render(<SettingsPage onNotice={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "المستخدمون والصلاحيات" }));

    const card = await cardForEmail("مدير.الاختبار@example.test");
    expect(within(card!).getByText("حسابك الحالي محمي من التعديل المباشر.")).toBeInTheDocument();
    expect(within(card!).getByLabelText("مدير النظام")).toBeDisabled();
    expect(within(card!).queryByRole("button", { name: "حفظ الأدوار" })).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("surfaces server rejection when a change would remove the last active administrator", async () => {
    const rows = [userRow(STAFF_ID, "مدير آخر", ["admin"])];
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_organization_user_roles") return { data: rows, error: null };
      if (name === "set_organization_user_roles") return { data: null, error: { message: "cannot remove last active administrator" } };
      return { data: null, error: { message: "unexpected RPC" } };
    });

    render(<SettingsPage onNotice={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "المستخدمون والصلاحيات" }));
    const card = await cardForEmail("مدير.آخر@example.test");

    fireEvent.click(within(card!).getByLabelText("مدير النظام"));
    fireEvent.click(within(card!).getByLabelText("مدير"));
    fireEvent.click(within(card!).getByRole("button", { name: "حفظ الأدوار" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("لا يمكن إزالة آخر مدير نظام نشط في المؤسسة.");
    expect(mocks.rpc).toHaveBeenCalledWith("set_organization_user_roles", {
      p_profile_id: STAFF_ID,
      p_roles: ["manager"],
    });
  });
});
