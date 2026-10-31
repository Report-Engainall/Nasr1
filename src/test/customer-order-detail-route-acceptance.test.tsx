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
    expect(host?.textContent).not.toContain("0.00");

    expect(host?.textContent).not.toContain("تأكيد طلب");
  });

  it("prints the order through an explicit customer-visible projection", async () => {
    mocks.user = CUSTOMER;
    const orderId = "33333333-3333-4333-8333-333333333333";
    mocks.results = {
      orders: { data: [{
        id: orderId, order_number: "SO-PRINT-001", customer_id: CUSTOMER.profileId,
        organization_id: "PRIVATE-TENANT-ID", status: "confirmed", total_items: 1,
        notes: "ملاحظة العميل الظاهرة", admin_notes: "PRIVATE-ADMIN-NOTE",
        created_at: "2026-10-31T09:00:00.000Z", quantity_review_required: true,
        customer_adjustment_note: "تم تعديل الكمية.",
        customer_payment_requested_at: "2026-10-31T09:10:00.000Z",
        customer_confirmed_at: "2026-10-31T09:00:00.000Z", payment_request_status: "requested",
        delivery_address_snapshot: {
          label: "عنوان العميل", recipient_name: "مستلم الطلب", phone: "777000111",
          address_line1: "شارع التجارة", address_line2: null, city: "صنعاء",
          region: "الأمانة", postal_code: null, country: "اليمن",
          delivery_instructions: "الاتصال قبل الوصول",
        },
      }], error: null },
      order_items: { data: [{
        id: "PRIVATE-LINE-ID", product_id: "PRIVATE-PRODUCT-ID", item_code: "000041",
        product_name_snapshot: "سكر", unit_snapshot: "كرتون", quantity: 3,
        requested_quantity: 5, approved_quantity: 3, unit_price: 987654,
        line_total: 2962962, cost_price: 12345, margin: 99,
      }], error: null },
      order_status_history: { data: [{
        id: "PRIVATE-HISTORY-ID", to_status: "confirmed", created_at: "2026-10-31T09:00:00.000Z",
        notes: "PRIVATE-HISTORY-NOTE", actor_id: "PRIVATE-HISTORY-ACTOR",
      }], error: null },
      customers: { data: [{
        id: "PRIVATE-CUSTOMER-ROW-ID", customer_code: "C-PRINT-001",
        business_name: "شركة العميل", contact_name: "مسؤول الحساب",
        phone: "PRIVATE-ACCOUNT-PHONE", notes: "PRIVATE-CUSTOMER-NOTE",
      }], error: null },
    };
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await mountOrderRoute();
    const printButton = host?.querySelector<HTMLButtonElement>('button.sf-btn-primary');
    expect(printButton?.textContent).toContain("طباعة / حفظ PDF");
    await act(async () => { printButton?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(printSpy).toHaveBeenCalledTimes(1);
    const printable = host?.querySelector<HTMLElement>('[data-testid="customer-order-print-document"]');
    expect(printable).not.toBeNull();
    expect(printable?.textContent).toContain("SO-PRINT-001");
    expect(printable?.textContent).toContain("شركة العميل");
    expect(printable?.textContent).toContain("تم تعديل الكمية.");
    expect(printable?.textContent).toContain("ملاحظة العميل الظاهرة");
    expect(printable?.textContent).toContain("000041");
    expect(printable?.textContent).not.toContain(orderId);
    for (const privateValue of [
      "PRIVATE-TENANT-ID", "PRIVATE-ADMIN-NOTE", "PRIVATE-LINE-ID", "PRIVATE-PRODUCT-ID",
      "PRIVATE-HISTORY-ID", "PRIVATE-HISTORY-NOTE", "PRIVATE-HISTORY-ACTOR",
      "PRIVATE-CUSTOMER-ROW-ID", "PRIVATE-ACCOUNT-PHONE", "PRIVATE-CUSTOMER-NOTE",
      "987654", "2962962", "12345",
    ]) expect(printable?.textContent).not.toContain(privateValue);
  });

  it("re-reads persisted order status when the customer refreshes order details", async () => {
    mocks.user = CUSTOMER;
    const orderId = "33333333-3333-4333-8333-333333333333";
    mocks.results = {
      orders: {
        data: [{
          id: orderId,
          order_number: "SO-TEST-001",
          customer_id: CUSTOMER.profileId,
          status: "pending",
          total_items: 1,
          notes: null,
          created_at: "2026-10-28T00:00:00.000Z",
          quantity_review_required: false,
          customer_adjustment_note: null,
          customer_payment_requested_at: null,
          customer_confirmed_at: null,
          payment_request_status: "none",
          delivery_address_snapshot: null,
        }],
        error: null,
      },
      order_items: {
        data: [{
          id: "44444444-4444-4444-8444-444444444444",
          product_id: "55555555-5555-4555-8555-555555555555",
          item_code: "SKU-TEST-001",
          product_name_snapshot: "صنف الاختبار",
          unit_snapshot: "علبة",
          quantity: 1,
          requested_quantity: 1,
          approved_quantity: 1,
        }],
        error: null,
      },
      order_status_history: {
        data: [{ id: "hist-1", to_status: "pending", created_at: "2026-10-28T00:00:00.000Z", notes: null }],
        error: null,
      },
      customers: {
        data: [{ customer_code: "C-TEST-01", business_name: "شركة الاختبار", contact_name: null }],
        error: null,
      },
    };

    await mountOrderRoute();
    expect(host?.textContent).toContain("الحالة: بانتظار المراجعة");

    const refresh = host?.querySelector<HTMLButtonElement>(
      'button[aria-label="تحديث حالة الطلب من الخادم"]',
    );
    expect(refresh).toBeDefined();

    const existingOrder = mocks.results.orders.data[0] as Record<string, unknown>;
    mocks.results.orders.data[0] = { ...existingOrder, status: "confirmed" };
    mocks.results.order_status_history = {
      data: [
        { id: "hist-1", to_status: "pending", created_at: "2026-10-28T00:00:00.000Z", notes: null },
        { id: "hist-2", to_status: "confirmed", created_at: "2026-10-28T00:01:00.000Z", notes: null },
      ],
      error: null,
    };

    await act(async () => {
      refresh?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).toContain("الحالة: مؤكد");
    expect(mocks.from.mock.calls.filter(([table]) => table === "orders")).toHaveLength(2);
  });
});
