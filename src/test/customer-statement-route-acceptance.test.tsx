import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  rpc: vi.fn(),
  from: vi.fn(),
  getSession: vi.fn(),
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

vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: vi.fn(),
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    auth: { getSession: mocks.getSession },
  },
}));

vi.mock("@/lib/api", () => ({
  fetchProducts: vi.fn(),
  fetchResolvedProductPrices: vi.fn(),
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "statement-customer@example.test",
  name: "عميل كشف الحساب",
  roles: ["customer"],
  isStaff: false,
};

describe("customer statement real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.rpc.mockReset().mockResolvedValue({
      data: { invoices: [], payments: [], credits: [], summary: [] },
      error: null,
    });
    mocks.from.mockReset();
    mocks.getSession.mockReset();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function mountStatementRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/statement"] }),
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

    expect(router.state.location.pathname).toBe("/statement");
  }

  function pageText() {
    return host?.textContent ?? "";
  }

  it("gates guests before the financial statement RPC is called", async () => {
    await mountStatementRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain(
      "تسجيل الدخول مطلوب",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(pageText()).not.toContain("إجمالي الفواتير");
    expect(pageText()).not.toContain("المتبقي المستحق");
  });

  it("exposes an RPC failure, then recovers only after the actual retry succeeds", async () => {
    mocks.user = CUSTOMER;
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "temporary network failure" } })
      .mockResolvedValueOnce({
        data: { invoices: [], payments: [], credits: [], summary: [] },
        error: null,
      });

    await mountStatementRoute();

    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_account_statement");
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر قراءة كشف الحساب. تحقق من نشر مخطط المالية.",
    );
    expect(pageText()).not.toContain("0.00 YER");
    expect(pageText()).not.toContain("تم تحميل كشف الحساب بنجاح");

    const retry = Array.from(host!.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("إعادة المحاولة"),
    );
    expect(retry).toBeDefined();

    await act(async () => {
      retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(pageText()).toContain("لا توجد أرصدة مالية مسجلة.");
    expect(pageText()).toContain("لا توجد حركات مالية مسجلة.");
  });

  it("fails closed when the authoritative financial summary has the wrong shape", async () => {
    mocks.user = CUSTOMER;
    mocks.rpc.mockResolvedValue({
      data: { invoices: [], payments: [], credits: [], summary: { currency: "YER", total: 0 } },
      error: null,
    });

    await mountStatementRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "لم تُعرض كصفر",
    );
    expect(pageText()).not.toContain("ملخص الرصيد بعملة YER");
    expect(pageText()).not.toContain("0 YER");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
});
