import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";

type TestUser = {
  id: string;
  profileId: string;
  email: string;
  name: string;
  roles: string[];
  isStaff: boolean;
};

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  fetchWorkspace: vi.fn(),
  createInvite: vi.fn(),
  acceptInvite: vi.fn(),
  revokeMember: vi.fn(),
  revokeInvitation: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    loading: false,
    configurationError: null,
    signOut: mocks.signOut,
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/Login", () => ({
  Login: () => <div data-testid="login-required">تسجيل الدخول مطلوب</div>,
}));

vi.mock("@/lib/customer-company-members", () => ({
  fetchCompanyMembershipWorkspace: mocks.fetchWorkspace,
  createCompanyInvitation: mocks.createInvite,
  acceptCompanyInvitation: mocks.acceptInvite,
  revokeCompanyMember: mocks.revokeMember,
  revokeCompanyInvitation: mocks.revokeInvitation,
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "members-customer@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const STAFF: TestUser = {
  ...CUSTOMER,
  id: "22222222-2222-4222-8222-222222222222",
  profileId: "f2222222-2222-4222-8222-222222222222",
  email: "members-staff@example.test",
  roles: ["admin"],
  isStaff: true,
};

const WORKSPACE = {
  company_name: "شركة الأغبري",
  members: [{
    profile_id: "f4444444-4444-4444-8444-444444444444",
    full_name: "سارة الأغبري",
    email: "sara@example.test",
    member_role: "buyer",
    status: "active",
    accepted_at: "2026-10-19T10:00:00Z",
    created_at: "2026-10-19T10:00:00Z",
    updated_at: "2026-10-19T10:00:00Z",
  }],
  invitations: [{
    invitation_id: "d1111111-1111-4111-8111-111111111111",
    invited_email: "finance@example.test",
    member_role: "finance",
    status: "pending",
    expires_at: "2026-10-27T10:00:00Z",
    created_at: "2026-10-20T10:00:00Z",
  }],
};

describe("customer company members real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.fetchWorkspace.mockReset().mockResolvedValue(WORKSPACE);
    mocks.createInvite.mockReset().mockResolvedValue({
      invitation_id: "d1111111-1111-4111-8111-111111111111",
      invited_email: "finance@example.test",
      member_role: "finance",
      invitation_token: "a".repeat(64),
      expires_at: "2026-10-27T10:00:00Z",
    });
    mocks.acceptInvite.mockReset();
    mocks.revokeMember.mockReset();
    mocks.revokeInvitation.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function mountMembersRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/company/members"] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(router.state.location.pathname).toBe("/company/members");
  }

  function pageText() {
    return host?.textContent ?? "";
  }

  function inputForLabel(labelText: string): HTMLInputElement {
    const label = Array.from(host!.querySelectorAll("form label")).find((node) =>
      node.textContent?.trim().startsWith(labelText),
    );
    const input = label?.querySelector("input");
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("Expected a visible form field labelled: " + labelText);
    }
    return input;
  }

  it("keeps the membership workspace behind the guest sign-in gate", async () => {
    await mountMembersRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain("تسجيل الدخول مطلوب");
    expect(mocks.fetchWorkspace).not.toHaveBeenCalled();
    expect(mocks.createInvite).not.toHaveBeenCalled();
  });

  it("rejects staff before reading or changing customer company memberships", async () => {
    mocks.user = STAFF;
    await mountMembersRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("هذه الشاشة لمالك حساب العميل فقط");
    expect(mocks.fetchWorkspace).not.toHaveBeenCalled();
    expect(mocks.createInvite).not.toHaveBeenCalled();
    expect(mocks.revokeMember).not.toHaveBeenCalled();
    expect(mocks.revokeInvitation).not.toHaveBeenCalled();
  });

  it("shows a failed workspace read and unlocks invitation creation only after retry succeeds", async () => {
    mocks.user = CUSTOMER;
    mocks.fetchWorkspace
      .mockRejectedValueOnce(new Error("تعذر تحميل أعضاء الشركة"))
      .mockResolvedValueOnce(WORKSPACE);

    await mountMembersRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل أعضاء الشركة");
    const createButton = Array.from(host!.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("إنشاء رابط دعوة"),
    );
    expect(createButton).toBeDefined();
    expect(createButton).toBeDisabled();
    expect(mocks.createInvite).not.toHaveBeenCalled();

    const retry = Array.from(host!.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("تحديث"),
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.fetchWorkspace).toHaveBeenCalledTimes(2);
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(pageText()).toContain("سارة الأغبري");
    expect(createButton).toBeDefined();
    expect(Array.from(host!.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("إنشاء رابط دعوة"),
    )).toBeEnabled();
    expect(mocks.createInvite).not.toHaveBeenCalled();
  });

  it("does not claim invitation creation succeeded when the server rejects it and preserves the email draft", async () => {
    mocks.user = CUSTOMER;
    mocks.createInvite.mockRejectedValue(new Error("رفض الخادم التجريبي"));

    await mountMembersRoute();

    act(() => {
      fireEvent.change(inputForLabel("بريد العضو"), {
        target: { value: "finance@example.test" },
      });
    });
    const emailInput = inputForLabel("بريد العضو");
    const submit = Array.from(host!.querySelectorAll('button[type="submit"]')).find((button) =>
      button.textContent?.includes("إنشاء رابط دعوة"),
    );
    expect(submit).toBeDefined();

    await act(async () => {
      fireEvent.click(submit!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.createInvite).toHaveBeenCalledTimes(1);
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("رفض الخادم التجريبي");
    expect(pageText()).not.toContain("أنشأ الخادم رابط دعوة صالحًا");
    expect(host?.querySelector('input[readonly]')).toBeNull();
    expect(emailInput.value).toBe("finance@example.test");
  });
});
