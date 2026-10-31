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

type ProductRow = {
  id: string;
  name: string;
  item_code: string;
  barcode: string | null;
  unit: string;
  status: string;
};

type QueryResult = { data: unknown[] | null; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  from: vi.fn(),
  rpc: vi.fn(),
  getCurrentTenantScope: vi.fn(),
  failProductReads: 0,
  priceRows: [] as Array<{ product_id: string; unit_price: number }>,
  quoteRows: [] as Array<Record<string, unknown>>,
  quoteItemRows: [] as Array<Record<string, unknown>>,
  requestFailures: 0,
  requestCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
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
  supabase: { from: mocks.from, rpc: mocks.rpc, auth: { getSession: vi.fn() } },
  getCurrentTenantScope: mocks.getCurrentTenantScope,
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "quotes-route@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT: ProductRow = {
  id: PRODUCT_ID,
  name: "صنف اختبار",
  item_code: "SKU-QUOTE-01",
  barcode: "000012345678",
  unit: "كرتون",
  status: "active",
};

function makeQuery(table: string) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    in: vi.fn(() => query),
    then: (
      resolve?: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      let result: QueryResult;
      if (table === "products" && mocks.failProductReads > 0) {
        mocks.failProductReads -= 1;
        result = { data: null, error: { message: "synthetic product read failure" } };
      } else if (table === "products") {
        result = { data: [PRODUCT], error: null };
      } else if (table === "sales_quotes") {
        result = { data: mocks.quoteRows, error: null };
      } else if (table === "sales_quote_items") {
        result = { data: mocks.quoteItemRows, error: null };
      } else {
        result = { data: null, error: { message: "Unexpected query table: " + table } };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

describe("customer quotes real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.failProductReads = 0;
    mocks.priceRows = [{ product_id: PRODUCT_ID, unit_price: 125 }];
    mocks.quoteRows = [];
    mocks.quoteItemRows = [];
    mocks.requestFailures = 0;
    mocks.requestCalls = [];
    mocks.getCurrentTenantScope.mockReset().mockResolvedValue({
      profileId: CUSTOMER.profileId,
      organizationId: ORGANIZATION_ID,
      warehouseId: null,
      isStaff: false,
      canManageCustomers: false,
    });
    mocks.from.mockReset().mockImplementation((table: string) => makeQuery(table));
    mocks.rpc.mockReset().mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name === "get_storefront_product_prices") {
        return { data: mocks.priceRows, error: null };
      }
      if (name === "request_sales_quote") {
        mocks.requestCalls.push({ name, args });
        if (mocks.requestFailures > 0) {
          mocks.requestFailures -= 1;
          return { data: null, error: { message: "synthetic quote request refusal" } };
        }
        return { data: { quote_id: "33333333-3333-4333-8333-333333333333" }, error: null };
      }
      return { data: null, error: { message: "Unexpected RPC: " + name } };
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

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  async function mountQuotesRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/quotes"] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
    expect(router.state.location.pathname).toBe("/quotes");
  }

  async function setFieldValue(selector: string, value: string) {
    const element = host?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    expect(element).toBeTruthy();
    await act(async () => {
      fireEvent.change(element!, { target: { value } });
    });
  }

  async function submitRequest() {
    const button = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((item) =>
      item.textContent?.includes("إرسال طلب عرض سعر"),
    );
    expect(button).toBeTruthy();
    await act(async () => {
      fireEvent.click(button!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
  }

  it("prints a customer-owned saved quote without exposing target prices or internal identifiers", async () => {
    mocks.user = CUSTOMER;
    mocks.quoteRows = [{
      id: "PRIVATE-QUOTE-ID",
      quote_number: "QT-CUSTOMER-PRINT-01",
      status: "quoted",
      notes: "توريد شهري",
      response_note: "الأسعار صالحة حتى التاريخ المحدد.",
      created_at: "2026-10-30T10:00:00.000Z",
      quoted_at: "2026-10-31T09:00:00.000Z",
      valid_until: "2026-11-15T23:59:59.000Z",
      organization_id: "PRIVATE-TENANT-ID",
      customer_id: "PRIVATE-CUSTOMER-ID",
      created_by: "PRIVATE-ACTOR-ID",
    }];
    mocks.quoteItemRows = [{
      id: "PRIVATE-QUOTE-LINE-ID",
      quote_id: "PRIVATE-QUOTE-ID",
      product_id: "PRIVATE-PRODUCT-ID",
      item_code: "000041",
      product_name_snapshot: "سكر",
      unit_snapshot: "كرتون",
      requested_quantity: 3,
      target_unit_price: 9999,
      quoted_unit_price: 125,
      cost_price: "PRIVATE-COST-SENTINEL",
      margin: "PRIVATE-MARGIN-SENTINEL",
    }];
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await mountQuotesRoute();
    const quoteCard = Array.from(host?.querySelectorAll<HTMLElement>("article") ?? [])
      .find((element) => element.textContent?.includes("QT-CUSTOMER-PRINT-01"));
    expect(quoteCard).toBeTruthy();
    const printButton = Array.from(quoteCard?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("طباعة العرض"));
    expect(printButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(printButton!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
    expect(printSpy).toHaveBeenCalledTimes(1);
    const printable = host?.querySelector<HTMLElement>('[data-testid="customer-quote-print-document"]');
    expect(printable).not.toBeNull();
    expect(printable?.textContent).toContain("QT-CUSTOMER-PRINT-01");
    expect(printable?.textContent).toContain("سكر");
    expect(printable?.textContent).toContain("١٢٥");
    for (const privateValue of [
      "PRIVATE-QUOTE-ID", "PRIVATE-TENANT-ID", "PRIVATE-CUSTOMER-ID",
      "PRIVATE-ACTOR-ID", "PRIVATE-QUOTE-LINE-ID", "PRIVATE-PRODUCT-ID",
      "PRIVATE-COST-SENTINEL", "PRIVATE-MARGIN-SENTINEL", "9999", "target_unit_price",
    ]) expect(printable?.innerHTML).not.toContain(privateValue);
  });

  it("gates guests before resolving tenant scope, querying products, or calling RPCs", async () => {
    await mountQuotesRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain(
      "تسجيل الدخول مطلوب",
    );
    expect(mocks.getCurrentTenantScope).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("recovers from a product-source failure through the visible retry action", async () => {
    mocks.user = CUSTOMER;
    mocks.failProductReads = 1;

    await mountQuotesRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر تحميل المنتجات أو عروض الأسعار",
    );
    expect(host?.textContent).not.toContain("SKU-QUOTE-01");

    const retry = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((item) =>
      item.textContent?.includes("إعادة المحاولة"),
    );
    expect(retry).toBeTruthy();
    await act(async () => {
      fireEvent.click(retry!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("SKU-QUOTE-01");
    expect(host?.textContent).toContain("السعر الحالي");
    expect(mocks.getCurrentTenantScope).toHaveBeenCalledTimes(2);
  });

  it("fails closed when the server does not provide a valid price for each product", async () => {
    mocks.user = CUSTOMER;
    mocks.priceRows = [];

    await mountQuotesRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "لم يرجع الخادم سعرًا موثقًا لكل صنف متاح",
    );
    expect(host?.textContent).not.toContain("SKU-QUOTE-01");
    expect(host?.textContent).not.toContain("125");
    expect(mocks.rpc).toHaveBeenCalledWith("get_storefront_product_prices", {
      p_product_ids: [PRODUCT_ID],
      p_quantity: 1,
    });
  });

  it("does not show quote-request success on RPC failure and only confirms after server acceptance", async () => {
    mocks.user = CUSTOMER;
    mocks.requestFailures = 1;

    await mountQuotesRoute();
    await setFieldValue('input[aria-label="كمية صنف اختبار"]', "3");
    await setFieldValue("textarea", "  توريد شهري  ");

    await submitRequest();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر إرسال الطلب: synthetic quote request refusal",
    );
    expect(host?.textContent).not.toContain("تم إرسال طلب عرض السعر");
    expect(mocks.requestCalls).toHaveLength(1);
    expect(mocks.requestCalls[0].args).toEqual({
      p_lines: [{ product_id: PRODUCT_ID, quantity: 3 }],
      p_notes: "توريد شهري",
    });

    await submitRequest();

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.querySelector('[role="status"]')?.textContent).toContain(
      "تم إرسال طلب عرض السعر. لم يتم إنشاء طلب بيع أو فرض سعر.",
    );
    expect(mocks.requestCalls).toHaveLength(2);
    expect(mocks.requestCalls[1].args).toEqual(mocks.requestCalls[0].args);
  });
});
