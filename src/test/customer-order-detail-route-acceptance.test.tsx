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

type QueryResult = { data: unknown[]; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  from: vi.fn(),
  results: {} as Record<string, QueryResult>,
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

vi.mock("@/components/CustomerReturnRequest", () => ({
  CustomerReturnRequest: () => null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "order-detail@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    maybeSingle: () => {
      const result = mocks.results[table] ?? { data: [], error: null };
      return Promise.resolve({ data: result.data[0] ?? null, error: result.error });
    },
    then: (
      resolve?: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(
      mocks.results[table] ?? { data: [], error: null },
    ).then(resolve, reject),
  };
  return query;
}

describe("customer order detail real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.results = {};
    mocks.from.mockReset().mockImplementation((table: string) => makeQuery(table));
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function mountOrderRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/orders/33333333-3333-4333-8333-333333333333"] }),
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
    expect(router.state.location.pathname).toBe("/orders/33333333-3333-4333-8333-333333333333");
  }

  it("gates a guest before reading any order, item, history or customer record", async () => {
    await mountOrderRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain(
      "تسجيل الدخول مطلوب",
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(host?.textContent).not.toContain("تأكيد طلب");
  });

  it("shows a source-read failure and recovers through the actual retry action", async () => {
    mocks.user = CUSTOMER;
    mocks.results = {
      orders: { data: [], error: { message: "synthetic read failure" } },
      order_items: { data: [], error: null },
      order_status_history: { data: [], error: null },
      customers: { data: [], error: null },
    };

    await mountOrderRoute();

    expect(mocks.from).toHaveBeenCalled();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل الطلب");
    expect(host?.textContent).not.toContain("تأكيد طلب");
    expect(host?.textContent).not.toContain("0.00");
    const retry = host?.querySelector<HTMLButtonElement>(
      'button[aria-label="إعادة تحميل تفاصيل الطلب"]',
    );
    expect(retry).toBeDefined();

    mocks.results.orders = { data: [], error: null };
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("الطلب غير موجود أو لا تملك صلاحية عرضه.");
    expect(host?.textContent).not.toContain("تأكيد طلب");
  });
});
