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

const TOKEN = "a".repeat(64);

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  acceptInvitation: vi.fn(),
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

vi.mock("@/components/FinanceDocumentPrintActions", () => ({
  FinanceDocumentPrintActions: () => null,
}));

vi.mock("@/components/CashExpenseLedger", () => ({
  CashExpenseLedger: () => null,
}));

vi.mock("@/components/GeneralLedgerWorkspace", () => ({
  GeneralLedgerWorkspace: () => null,
}));

vi.mock("@/lib/customer-company-members", () => ({
  acceptCompanyInvitation: mocks.acceptInvitation,
  createCompanyInvitation: vi.fn(),
  fetchCompanyMembershipWorkspace: vi.fn(),
  revokeCompanyMember: vi.fn(),
  revokeCompanyInvitation: vi.fn(),
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "customer@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const STAFF: TestUser = {
  ...CUSTOMER,
  id: "22222222-2222-4222-8222-222222222222",
  profileId: "f2222222-2222-4222-8222-222222222222",
  email: "staff@example.test",
  roles: ["admin"],
  isStaff: true,
};

describe("company invitation real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = CUSTOMER;
    mocks.acceptInvitation.mockReset();
    window.history.replaceState(null, "", "/");
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
    window.history.replaceState(null, "", "/");
  });

  async function mountInvitationRoute(initialPath: string) {
    window.history.replaceState(null, "", initialPath);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [initialPath] }),
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

    expect(router.state.location.pathname).toBe(initialPath.split("?")[0]);
  }

  function acceptanceButton(): HTMLButtonElement {
    const button = Array.from(host!.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("قبول الدعوة والانضمام للشركة"),
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Expected the customer invitation acceptance action.");
    }
    return button;
  }

  it.each([
    ["path-token route", `/invite/${TOKEN}`],
    ["query-token route", `/company/accept-invitation?token=${TOKEN}`],
  ])(
    "%s strips the bearer token, preserves retry after server rejection, and reports only server-confirmed success",
    async (_routeName, initialPath) => {
      mocks.acceptInvitation
        .mockImplementationOnce(async (token: string) => {
          expect(token).toBe(TOKEN);
          expect(window.location.pathname).toBe("/company/accept-invitation");
          expect(window.location.search).toBe("");
          throw new Error("تعذر الاتصال مؤقتًا");
        })
        .mockResolvedValueOnce({
          company_name: "شركة الأغبري",
          member_role: "buyer",
          status: "active",
        });

      await mountInvitationRoute(initialPath);

      await act(async () => {
        fireEvent.click(acceptanceButton());
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mocks.acceptInvitation).toHaveBeenCalledTimes(1);
      expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر الاتصال مؤقتًا");
      expect(host?.textContent).not.toContain("تم تفعيل العضوية");
      expect(window.location.pathname).toBe("/company/accept-invitation");
      expect(window.location.search).toBe("");

      await act(async () => {
        fireEvent.click(acceptanceButton());
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(mocks.acceptInvitation).toHaveBeenNthCalledWith(1, TOKEN);
      expect(mocks.acceptInvitation).toHaveBeenNthCalledWith(2, TOKEN);
      expect(host?.querySelector('[role="status"]')?.textContent).toContain("تم تفعيل العضوية");
      expect(host?.textContent).toContain("شركة الأغبري");
      expect(window.location.pathname).toBe("/company/accept-invitation");
      expect(window.location.search).toBe("");
    },
  );

  it("surfaces a malformed route token as a clear rejection without claiming success", async () => {
    const malformedToken = "not-a-valid-token";
    mocks.acceptInvitation.mockRejectedValueOnce(new Error("رابط الدعوة غير صالح."));

    await mountInvitationRoute(`/invite/${malformedToken}`);

    await act(async () => {
      fireEvent.click(acceptanceButton());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.acceptInvitation).toHaveBeenCalledWith(malformedToken);
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("رابط الدعوة غير صالح");
    expect(host?.textContent).not.toContain("تم تفعيل العضوية");
    expect(window.location.pathname).toBe("/company/accept-invitation");
    expect(window.location.search).toBe("");
  });

  it("denies guests before invoking the customer invitation RPC", async () => {
    mocks.user = null;

    await mountInvitationRoute(`/invite/${TOKEN}`);

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain(
      "تسجيل الدخول مطلوب",
    );
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it("rejects staff accounts before invoking the customer invitation RPC", async () => {
    mocks.user = STAFF;

    await mountInvitationRoute(`/invite/${TOKEN}`);

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "الدعوة مخصصة لحساب عميل",
    );
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });
});
