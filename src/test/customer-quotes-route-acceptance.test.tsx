import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { formatCurrency } from "@/lib/format";
import { StaffQuotesPage } from "@/components/CustomerWorkflows";
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

const PRODUCT_READ_FAILURE: QueryResult = {
  data: null,
  error: { message: "synthetic product read failure" },
};

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  from: vi.fn(),
  rpc: vi.fn(),
  getCurrentTenantScope: vi.fn(),
  failProductReads: 0,
  priceRows: [] as Array<{ product_id: string; unit_price: number }>,
  requestFailures: 0,
  requestCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
  quoteRows: [] as Array<Record<string, unknown>>,
  quoteItemRows: [] as Array<Record<string, unknown>>,
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

function resolveQuoteQueryResult(table: string): QueryResult {
  if (table === "products" && mocks.failProductReads > 0) {
    mocks.failProductReads -= 1;
    return PRODUCT_READ_FAILURE;
  }
  if (table === "products") return { data: [PRODUCT], error: null };
  if (table === "sales_quotes") return { data: mocks.quoteRows, error: null };
  if (table === "sales_quote_items") return { data: mocks.quoteItemRows, error: null };
  return { data: null, error: { message: "Unexpected query table: " + table } };
}

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
    ) => Promise.resolve(resolveQuoteQueryResult(table)).then(resolve, reject),
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
    mocks.requestFailures = 0;
    mocks.requestCalls = [];
    mocks.quoteRows = [];
    mocks.quoteItemRows = [];
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

  async function mountStaffQuotesPage() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<StaffQuotesPage />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
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


  it("prints only a fully priced customer quote and excludes target prices and internal identifiers", async () => {
    mocks.user = CUSTOMER;
    mocks.quoteRows = [{
      id: "33333333-3333-4333-8333-333333333333",
      quote_number: "QT-PRINT-001",
      status: "quoted",
      notes: "ملاحظة العميل",
      response_note: "العرض صالح حتى الموعد المحدد.",
      created_at: "2026-10-31T09:00:00.000Z",
      quoted_at: "2026-10-31T09:15:00.000Z",
      valid_until: "2026-11-07T23:59:59.000Z",
      organization_id: "PRIVATE-TENANT-ID",
      created_by: "PRIVATE-ACTOR-ID",
      internal_notes: "PRIVATE-INTERNAL-NOTE",
    }];
    mocks.quoteItemRows = [{
      id: "PRIVATE-LINE-ID",
      quote_id: "33333333-3333-4333-8333-333333333333",
      product_id: "PRIVATE-PRODUCT-ID",
      item_code: "000041",
      product_name_snapshot: "سكر",
      unit_snapshot: "كرتون",
      requested_quantity: 5,
      target_unit_price: 987654,
      quoted_unit_price: 125.5,
      cost_price: 12345,
      margin: 7654321,
    }];
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);

    await mountQuotesRoute();

    const printButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("طباعة عرض السعر"));
    expect(printButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(printButton!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();

    expect(printSpy).toHaveBeenCalledTimes(1);
    const printDocument = host?.querySelector<HTMLElement>('[data-testid="customer-quote-print-document"]');
    expect(printDocument).not.toBeNull();
    expect(printDocument?.textContent).toContain("QT-PRINT-001");
    expect(printDocument?.textContent).toContain("سكر");
    expect(printDocument?.textContent).toContain("ملاحظة العميل");
    expect(printDocument?.textContent).toContain("العرض صالح حتى الموعد المحدد");
    expect(printDocument?.textContent).toContain(formatCurrency(125.5));
    for (const privateValue of [
      "PRIVATE-TENANT-ID", "PRIVATE-ACTOR-ID", "PRIVATE-INTERNAL-NOTE",
      "PRIVATE-LINE-ID", "PRIVATE-PRODUCT-ID", "987654", "12345", "7654321",
      "target_unit_price", "cost_price", "profit_margin",
    ]) expect(printDocument?.innerHTML).not.toContain(privateValue);
    const forbiddenAttributeNames = new Set([
      "organization_id", "customer_id", "product_id", "quote_id", "created_by",
      "internal_notes", "target_unit_price", "cost_price", "margin", "profit_margin",
    ]);
    const renderedAttributeNames = Array.from(printDocument?.querySelectorAll("*") ?? [])
      .flatMap((element) => Array.from(element.attributes, (attribute) => attribute.name));
    expect(renderedAttributeNames.some((name) => forbiddenAttributeNames.has(name))).toBe(false);
    printSpy.mockRestore();
  });

  it("does not offer customer printing before the quote has a server-issued price", async () => {
    mocks.user = CUSTOMER;
    mocks.quoteRows = [{
      id: "33333333-3333-4333-8333-333333333333",
      quote_number: "QT-PENDING-001",
      status: "requested",
      notes: null, response_note: null,
      created_at: "2026-10-31T09:00:00.000Z",
      quoted_at: null, valid_until: null,
    }];
    mocks.quoteItemRows = [{
      id: "PRIVATE-LINE-ID", quote_id: "33333333-3333-4333-8333-333333333333",
      product_id: PRODUCT_ID, item_code: "000041", product_name_snapshot: "سكر",
      unit_snapshot: "كرتون", requested_quantity: 5, target_unit_price: 500,
      quoted_unit_price: null,
    }];
    await mountQuotesRoute();
    expect(host?.textContent).toContain("بانتظار التسعير");
    expect(Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .some((button) => button.textContent?.includes("طباعة عرض السعر"))).toBe(false);
  });

  it("staff quote print uses persisted server pricing, never unsaved review drafts", async () => {
    mocks.user = { ...CUSTOMER, roles: ["admin"], isStaff: true, name: "مدير الاختبار" };
    mocks.quoteRows = [{
      id: "33333333-3333-4333-8333-333333333333",
      quote_number: "QT-STAFF-PRINT-001",
      status: "quoted",
      notes: "ملاحظة العميل",
      response_note: "تم اعتماد السعر.",
      created_at: "2026-10-31T09:00:00.000Z",
      quoted_at: "2026-10-31T09:15:00.000Z",
      valid_until: "2026-11-07T23:59:59.000Z",
      organization_id: "PRIVATE-TENANT-ID",
      created_by: "PRIVATE-ACTOR-ID",
      internal_notes: "PRIVATE-INTERNAL-NOTE",
    }];
    mocks.quoteItemRows = [{
      id: "PRIVATE-LINE-ID",
      quote_id: "33333333-3333-4333-8333-333333333333",
      product_id: "PRIVATE-PRODUCT-ID",
      item_code: "000041",
      product_name_snapshot: "سكر",
      unit_snapshot: "كرتون",
      requested_quantity: 5,
      target_unit_price: 987654,
      quoted_unit_price: 125.5,
      cost_price: 12345,
      margin: 7654321,
    }];
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    await mountStaffQuotesPage();

    const openButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("فتح / تسعير"));
    expect(openButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(openButton!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();

    const draftPrice = host?.querySelector<HTMLInputElement>('input[type="number"]');
    expect(draftPrice).toBeTruthy();
    await act(async () => fireEvent.change(draftPrice!, { target: { value: "777" } }));

    const printButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("طباعة الأسعار المحفوظة"));
    expect(printButton).toBeTruthy();
    await act(async () => fireEvent.click(printButton!));
    await flush();

    expect(printSpy).toHaveBeenCalledTimes(1);
    const document = host?.querySelector<HTMLElement>('[data-testid="staff-quote-print-document"]');
    expect(document).not.toBeNull();
    expect(document?.textContent).toContain("QT-STAFF-PRINT-001");
    expect(document?.textContent).toContain(formatCurrency(125.5));
    expect(document?.textContent).not.toContain("777");
    for (const value of [
      "PRIVATE-TENANT-ID", "PRIVATE-ACTOR-ID", "PRIVATE-INTERNAL-NOTE",
      "PRIVATE-LINE-ID", "PRIVATE-PRODUCT-ID", "987654", "12345", "7654321",
    ]) expect(document?.innerHTML).not.toContain(value);
    const forbidden = new Set([
      "organization_id", "customer_id", "product_id", "quote_id", "created_by",
      "internal_notes", "target_unit_price", "cost_price", "margin", "profit_margin",
    ]);
    const attributeNames = Array.from(document?.querySelectorAll("*") ?? [])
      .flatMap((element) => Array.from(element.attributes, (attribute) => attribute.name));
    expect(attributeNames.some((name) => forbidden.has(name))).toBe(false);
    printSpy.mockRestore();
  });

  it("staff cannot print a requested quote or a quote with incomplete server prices", async () => {
    mocks.user = { ...CUSTOMER, roles: ["admin"], isStaff: true };
    mocks.quoteRows = [{
      id: "33333333-3333-4333-8333-333333333333",
      quote_number: "QT-STAFF-PENDING-001",
      status: "requested",
      notes: null, response_note: null,
      created_at: "2026-10-31T09:00:00.000Z",
      quoted_at: null, valid_until: null,
    }];
    mocks.quoteItemRows = [{
      id: "PRIVATE-LINE-ID", quote_id: "33333333-3333-4333-8333-333333333333",
      product_id: PRODUCT_ID, item_code: "000041", product_name_snapshot: "سكر",
      unit_snapshot: "كرتون", requested_quantity: 5, target_unit_price: 500,
      quoted_unit_price: null,
    }];
    await mountStaffQuotesPage();
    const openButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("فتح / تسعير"));
    expect(openButton).toBeTruthy();
    await act(async () => {
      fireEvent.click(openButton!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
    expect(Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .some((button) => button.textContent?.includes("طباعة الأسعار المحفوظة"))).toBe(false);
  });

});
