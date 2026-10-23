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
  saveFailures: 0,
  saveCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
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
  email: "reorder-route@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const ORGANIZATION_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT: ProductRow = {
  id: PRODUCT_ID,
  name: "صنف اختبار",
  item_code: "SKU-REORDER-01",
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
      } else if (table === "reorder_templates" || table === "reorder_template_items") {
        result = { data: [], error: null };
      } else {
        result = { data: null, error: { message: "Unexpected query table: " + table } };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

describe("customer reorder real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.failProductReads = 0;
    mocks.priceRows = [{ product_id: PRODUCT_ID, unit_price: 150 }];
    mocks.saveFailures = 0;
    mocks.saveCalls = [];
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
      if (name === "save_reorder_template") {
        mocks.saveCalls.push({ name, args });
        if (mocks.saveFailures > 0) {
          mocks.saveFailures -= 1;
          return { data: null, error: { message: "synthetic template-save refusal" } };
        }
        return { data: { template_id: "33333333-3333-4333-8333-333333333333" }, error: null };
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

  async function mountReorderRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/reorder"] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
    expect(router.state.location.pathname).toBe("/reorder");
  }

  async function fillField(element: HTMLInputElement, value: string) {
    await act(async () => {
      fireEvent.change(element, { target: { value } });
    });
  }

  async function saveTemplate() {
    const button = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((item) =>
      item.textContent?.includes("حفظ القالب"),
    );
    expect(button).toBeTruthy();
    await act(async () => {
      fireEvent.click(button!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
  }

  it("gates guests before resolving tenant scope, querying reorder data or calling RPCs", async () => {
    await mountReorderRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain(
      "تسجيل الدخول مطلوب",
    );
    expect(mocks.getCurrentTenantScope).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows product source failure and recovers through the visible retry action", async () => {
    mocks.user = CUSTOMER;
    mocks.failProductReads = 1;

    await mountReorderRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر تحميل المنتجات أو قوالب إعادة الطلب",
    );
    expect(host?.textContent).not.toContain("SKU-REORDER-01");

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
    expect(host?.textContent).toContain("SKU-REORDER-01");
    expect(mocks.getCurrentTenantScope).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a product has no server-authoritative customer price", async () => {
    mocks.user = CUSTOMER;
    mocks.priceRows = [];

    await mountReorderRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "لم يرجع الخادم سعرًا موثقًا لكل صنف متاح",
    );
    expect(host?.textContent).not.toContain("SKU-REORDER-01");
    expect(host?.textContent).not.toContain("150");
    expect(mocks.rpc).toHaveBeenCalledWith("get_storefront_product_prices", {
      p_product_ids: [PRODUCT_ID],
      p_quantity: 1,
    });
  });

  it("never confirms a failed save and only confirms after the RPC accepts the template", async () => {
    mocks.user = CUSTOMER;
    mocks.saveFailures = 1;

    await mountReorderRoute();
    const name = host?.querySelector<HTMLInputElement>('input[value="طلب متكرر"]');
    const quantity = host?.querySelector<HTMLInputElement>('input[aria-label="كمية صنف اختبار"]');
    expect(name).toBeTruthy();
    expect(quantity).toBeTruthy();
    await fillField(name!, "  قالب التوريد  ");
    await fillField(quantity!, "4");

    await saveTemplate();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر حفظ القالب: synthetic template-save refusal",
    );
    expect(host?.textContent).not.toContain("تم حفظ قالب إعادة الطلب");
    expect(mocks.saveCalls).toHaveLength(1);
    expect(mocks.saveCalls[0].args).toEqual({
      p_name: "قالب التوريد",
      p_lines: [{ product_id: PRODUCT_ID, quantity: 4 }],
      p_source_order_id: null,
    });

    await saveTemplate();

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.querySelector('[role="status"]')?.textContent).toContain(
      "تم حفظ قالب إعادة الطلب",
    );
    expect(mocks.saveCalls).toHaveLength(2);
    expect(mocks.saveCalls[1].args).toEqual(mocks.saveCalls[0].args);
  });
});
