// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CustomerManagerRoleAssignment } from "./CustomerManagerRoleAssignment";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
}));

const staff = {
  profile_id: "profile-staff-01",
  full_name: "موظف اختبار",
  email: "staff@example.test",
  is_active: true,
  roles: ["staff"],
};

describe("CustomerManagerRoleAssignment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it("sends the exact reviewed role snapshot and confirms the new assignment from the server", async () => {
    const onNotice = vi.fn();
    let current = [staff];
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_organization_user_roles") return { data: current, error: null };
      if (name === "set_organization_user_roles_v2") {
        current = [{ ...staff, roles: ["customer_manager", "staff"] }];
        return {
          data: {
            profile_id: staff.profile_id,
            previous_roles: ["staff"],
            roles: ["customer_manager", "staff"],
            changed: true,
          },
          error: null,
        };
      }
      return { data: null, error: new Error("unexpected RPC: " + name) };
    });

    render(<CustomerManagerRoleAssignment currentProfileId="profile-admin" onNotice={onNotice} />);
    fireEvent.click(await screen.findByRole("button", { name: "إسناد مسؤول العملاء إلى موظف اختبار" }));

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("set_organization_user_roles_v2", {
      p_profile_id: staff.profile_id,
      p_expected_roles: ["staff"],
      p_roles: ["customer_manager", "staff"],
    }));
    expect(await screen.findByText("مسؤول العملاء")).toBeInTheDocument();
    expect(onNotice).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("list_organization_user_roles");
  });

  it("hides a stale role list when the conflict refresh fails and allows a clean retry", async () => {
    const onNotice = vi.fn();
    let listCalls = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_organization_user_roles") {
        listCalls += 1;
        if (listCalls === 1) return { data: [staff], error: null };
        if (listCalls === 2) return { data: null, error: new Error("temporary network failure") };
        return { data: [{ ...staff, roles: ["accountant", "staff"] }], error: null };
      }
      if (name === "set_organization_user_roles_v2") {
        return {
          data: null,
          error: { code: "40001", message: "role assignment changed since it was loaded; reload the member list and retry" },
        };
      }
      return { data: null, error: new Error("unexpected RPC: " + name) };
    });

    render(<CustomerManagerRoleAssignment currentProfileId="profile-admin" onNotice={onNotice} />);
    fireEvent.click(await screen.findByRole("button", { name: "إسناد مسؤول العملاء إلى موظف اختبار" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل النسخة الأحدث");
    expect(screen.queryByText("موظف اختبار")).not.toBeInTheDocument();
    expect(onNotice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(await screen.findByText("محاسب")).toBeInTheDocument();
    expect(listCalls).toBe(3);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("reloads a member after a stale-role conflict and never reports the rejected change as successful", async () => {
    const onNotice = vi.fn();
    let listCalls = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_organization_user_roles") {
        listCalls += 1;
        return {
          data: listCalls === 1 ? [staff] : [{ ...staff, roles: ["accountant", "staff"] }],
          error: null,
        };
      }
      if (name === "set_organization_user_roles_v2") {
        return {
          data: null,
          error: { code: "40001", message: "role assignment changed since it was loaded; reload the member list and retry" },
        };
      }
      return { data: null, error: new Error("unexpected RPC: " + name) };
    });

    render(<CustomerManagerRoleAssignment currentProfileId="profile-admin" onNotice={onNotice} />);
    fireEvent.click(await screen.findByRole("button", { name: "إسناد مسؤول العملاء إلى موظف اختبار" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تغيرت أدوار هذا الحساب بعد تحميل القائمة");
    expect(await screen.findByText("محاسب")).toBeInTheDocument();
    expect(onNotice).not.toHaveBeenCalled();
    expect(listCalls).toBe(2);
  });
});
