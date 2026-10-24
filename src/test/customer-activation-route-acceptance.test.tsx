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
  acceptActivation: vi.fn(),
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
  Login: () => <div data-testid="login-required">تسجيل الدخول أو إنشاء الحساب</div>,
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

vi.mock("@/lib/customer-activation-invitations", () => ({
  acceptCustomerActivationInvitation: mocks.acceptActivation,
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

describe("customer activation real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = CUSTOMER;
    mocks.acceptActivation.mockReset();
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

  async function mountActivationRoute(initialPath: string) {
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

    expect(router.state.location.pathname).toBe(initialPath);
  }

  function activationButton(): HTMLButtonElement {
    const button = Array.from(host!.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes("التحقق من الدعوة وتفعيل الحساب"),
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Expected the customer activation action on the actual route.");
    }
    return button;
  }

  it("passes the actual route token, strips it before the RPC, preserves retry, and confirms only server success", async () => {
    mocks.acceptActivation
      .mockImplementationOnce(async (token: string) => {
        expect(token).toBe(TOKEN);
        expect(window.location.pathname).toBe("/");
        expect(window.location.pathname).not.toContain(TOKEN);
        expect(window.location.search).toBe("");
        throw new Error("تعذر الاتصال مؤقتًا");
      })
      .mockResolvedValueOnce({
        customer_id: "11111111-1111-4111-8111-111111111111",
        business_name: "متجر العميل",
        email: CUSTOMER.email,
        status: "active",
      });

    await mountActivationRoute(`/customer/activate/${TOKEN}`);

    await act(async () => {
      fireEvent.click(activationButton());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.acceptActivation).toHaveBeenCalledTimes(1);
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر الاتصال مؤقتًا");
    expect(host?.textContent).not.toContain("تم تفعيل حساب العميل");
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");

    await act(async () => {
      fireEvent.click(activationButton());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.acceptActivation).toHaveBeenNthCalledWith(1, TOKEN);
    expect(mocks.acceptActivation).toHaveBeenNthCalledWith(2, TOKEN);
    expect(host?.querySelector('[role="status"]')?.textContent).toContain(
      "تم تفعيل حساب العميل",
    );
    expect(host?.textContent).toContain("متجر العميل");
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });

  it("rejects a malformed route token before rendering an acceptance action", async () => {
    await mountActivationRoute("/customer/activate/not-a-valid-token");

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "رابط تفعيل غير صالح",
    );
    expect(host?.querySelector("button")).toBeNull();
    expect(mocks.acceptActivation).not.toHaveBeenCalled();
  });

  it("keeps the acceptance RPC unreachable to signed-out visitors", async () => {
    mocks.user = null;

    await mountActivationRoute(`/customer/activate/${TOKEN}`);

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain(
      "تسجيل الدخول أو إنشاء الحساب",
    );
    expect(mocks.acceptActivation).not.toHaveBeenCalled();
  });

  it("rejects staff accounts before invoking the customer activation RPC", async () => {
    mocks.user = STAFF;

    await mountActivationRoute(`/customer/activate/${TOKEN}`);

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "الدعوة مخصصة لحساب عميل",
    );
    expect(mocks.acceptActivation).not.toHaveBeenCalled();
  });
});
