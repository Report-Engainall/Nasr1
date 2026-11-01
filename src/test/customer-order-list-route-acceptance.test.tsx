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

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  total_items: number;
  created_at: string;
  quantity_review_required?: boolean;
  customer_adjustment_note?: string | null;
  customer_payment_requested_at?: string | null;
  payment_request_status?: string;
  // Deliberately present in the fixture to catch accidental rendering of financial data.
  total_amount?: number;
};

type QueryResult = {
  data: OrderRow[] | null;
  error: { message: string } | null;
  count: number | null;
};

const ORDER_READ_FAILURE: QueryResult = {
  data: null,
  error: { message: "synthetic read failure" },
  count: null,
};

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  from: vi.fn(),
  rows: [] as OrderRow[],
  failReads: 0,
  countOverride: undefined as number | null | undefined,
  rangeCalls: [] as Array<[number, number]>,
  selectCalls: [] as Array<{ columns: string; options: unknown }>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    loading: false,
    configurationError: null,
    signOut: vi.fn(),
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
  email: "order-list@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

function makeOrder(index: number): OrderRow {
  return {
    id: `22222222-2222-4222-8222-${String(index).padStart(12, "0")}`,
    order_number: `PO-TEST-${String(index).padStart(3, "0")}`,
    status: index === 1 ? "pending" : "confirmed",
    total_items: index + 1,
    created_at: `2026-10-${String(Math.min(index, 28)).padStart(2, "0")}T10:00:00.000Z`,
    total_amount: 777777,
  };
}

function makeQuery() {
  let start = 0;
  let end = 24;
  const query = {
    select: vi.fn((columns: string, options?: unknown) => {
      mocks.selectCalls.push({ columns, options });
      return query;
    }),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    range: vi.fn((from: number, to: number) => {
      start = from;
      end = to;
      mocks.rangeCalls.push([from, to]);
      return query;
    }),
    then: (
      resolve?: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      let result: QueryResult;
      if (mocks.failReads > 0) {
        mocks.failReads -= 1;
        result = ORDER_READ_FAILURE;
      } else {
        const count = mocks.countOverride === undefined ? mocks.rows.length : mocks.countOverride;
        result = {
          data: mocks.rows.slice(start, end + 1),
          error: null,
          count,
        };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

describe("customer order-list real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.rows = [];
    mocks.failReads = 0;
    mocks.countOverride = undefined;
    mocks.rangeCalls = [];
    mocks.selectCalls = [];
    mocks.from.mockReset().mockImplementation((table: string) => {
      if (table !== "orders") throw new Error(`Unexpected table read: ${table}`);
      return makeQuery();
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function mountOrdersRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/orders/"] }),
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
    expect(router.state.location.pathname).toBe("/orders/");
  }

  it("gates a guest before querying customer orders", async () => {
    await mountOrdersRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain(
      "تسجيل الدخول مطلوب",
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(host?.textContent).not.toContain("PO-TEST-001");
  });

  it("fails closed on an order query error and retries through the real action", async () => {
    mocks.user = CUSTOMER;
    mocks.rows = [makeOrder(1)];
    mocks.failReads = 1;

    await mountOrdersRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل الطلبات");
    expect(host?.textContent).not.toContain("لا توجد طلبات بعد.");
    expect(host?.textContent).not.toContain("777777");

    const retry = host?.querySelector<HTMLButtonElement>('button');
    expect(retry?.textContent).toContain("إعادة المحاولة");
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("PO-TEST-001");
    expect(host?.textContent).not.toContain("777777");
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it("does not misreport unknown exact counts as an empty list", async () => {
    mocks.user = CUSTOMER;
    mocks.rows = [];
    mocks.countOverride = null;

    await mountOrdersRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر تأكيد إجمالي الطلبات",
    );
    expect(host?.textContent).not.toContain("لا توجد طلبات بعد.");

    mocks.countOverride = 0;
    const retry = host?.querySelector<HTMLButtonElement>('button');
    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("لا توجد طلبات بعد.");
    expect(host?.querySelector('a.sf-btn-primary[href="/"]')?.textContent).toContain("ابدأ التسوق");
  });

  it("uses exact counts, stable ranged pagination, and never renders financial fields", async () => {
    mocks.user = CUSTOMER;
    mocks.rows = Array.from({ length: 26 }, (_, index) => makeOrder(index + 1));

    await mountOrdersRoute();

    expect(host?.textContent).toContain("PO-TEST-001");
    expect(host?.textContent).toContain("إجمالي النتائج:");
    expect(host?.textContent).not.toContain("777777");
    expect(mocks.selectCalls[0]?.options).toEqual({ count: "exact" });
    expect(mocks.selectCalls[0]?.columns).not.toMatch(/total_amount|unit_price|margin|cost/i);
    expect(mocks.rangeCalls[0]).toEqual([0, 24]);
    expect(host?.querySelector('button[aria-label="صفحة الطلبات التالية"]')?.disabled).toBe(false);

    const next = host?.querySelector<HTMLButtonElement>('button[aria-label="صفحة الطلبات التالية"]');
    await act(async () => {
      next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rangeCalls).toContainEqual([25, 49]);
    expect(host?.textContent).toContain("PO-TEST-026");
    expect(host?.textContent).not.toContain("777777");
    expect(host?.querySelector('button[aria-label="صفحة الطلبات السابقة"]')?.disabled).toBe(false);
  });
});
