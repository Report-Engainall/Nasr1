// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
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
  min_order_quantity: number;
  order_quantity_multiple: number;
};

type ReorderTemplateRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  source_order_id: string | null;
};
type ReorderTemplateItemRow = { product_id: string | null; quantity: number | string };

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
  productRows: [] as ProductRow[],
  templateRows: [] as ReorderTemplateRow[],
  templateItemRows: [] as ReorderTemplateItemRow[],
  offlineCartLines: [] as Array<{ product_id: string; quantity: number }>,
  mergeOfflineCartDraft: vi.fn(),
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

vi.mock("@/lib/offline-cart", () => ({
  loadOfflineCartDraft: vi.fn(() => mocks.offlineCartLines),
  mergeOfflineCartDraft: mocks.mergeOfflineCartDraft,
  saveOfflineCartDraft: vi.fn(),
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
  min_order_quantity: 1,
  order_quantity_multiple: 1,
};

function resolveReorderQueryResult(table: string): QueryResult {
  if (table === "products" && mocks.failProductReads > 0) {
    mocks.failProductReads -= 1;
    return PRODUCT_READ_FAILURE;
  }
  if (table === "products") return { data: mocks.productRows, error: null };
  if (table === "reorder_templates") return { data: mocks.templateRows, error: null };
  if (table === "reorder_template_items") return { data: mocks.templateItemRows, error: null };
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
    ) => Promise.resolve(resolveReorderQueryResult(table)).then(resolve, reject),
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
    mocks.productRows = [{ ...PRODUCT }];
    mocks.templateRows = [];
    mocks.templateItemRows = [];
    mocks.offlineCartLines = [];
    mocks.mergeOfflineCartDraft.mockReset().mockImplementation(
      (_storage: Storage, _profileId: string | null | undefined, additions: unknown) => {
        const quantities = new Map<string, number>(
          mocks.offlineCartLines.map((line) => [line.product_id, line.quantity]),
        );
        if (Array.isArray(additions)) {
          for (const candidate of additions) {
            if (!candidate || typeof candidate !== "object") continue;
            const line = candidate as { product_id?: unknown; quantity?: unknown };
            if (typeof line.product_id !== "string" || typeof line.quantity !== "number") continue;
            quantities.set(
              line.product_id,
              Math.min(10000, (quantities.get(line.product_id) ?? 0) + line.quantity),
            );
          }
        }
        return [...quantities.entries()].map(([product_id, quantity]) => ({ product_id, quantity }));
      },
    );
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
        return { data: "33333333-3333-4333-8333-333333333333", error: null };
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
    return router;
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

  async function applyTemplate() {
    const button = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? []).find((item) =>
      item.textContent?.includes("تحميل إلى السلة"),
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
      "تعذر حفظ القالب. تحقق من الاتصال والصلاحيات ثم حاول مجددًا.",
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
  it("enforces the current product minimum and pack multiple before saving, including Arabic digits", async () => {
    mocks.user = CUSTOMER;
    mocks.productRows = [{
      ...PRODUCT,
      min_order_quantity: 5,
      order_quantity_multiple: 5,
    }];

    await mountReorderRoute();
    const name = host?.querySelector<HTMLInputElement>('input[value="طلب متكرر"]');
    const quantity = host?.querySelector<HTMLInputElement>('input[aria-label="كمية صنف اختبار"]');
    expect(name).toBeTruthy();
    expect(quantity).toBeTruthy();
    expect(host?.textContent).toContain("الحد الأدنى: 5 كرتون");
    await fillField(name!, "قالب التعبئة");
    await fillField(quantity!, "٦");
    await saveTemplate();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تبدأ من 5 وتزيد بمضاعف 5");
    expect(mocks.saveCalls).toHaveLength(0);

    await fillField(quantity!, "١٠");
    await saveTemplate();

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.saveCalls).toHaveLength(1);
    expect(mocks.saveCalls[0].args).toEqual({
      p_name: "قالب التعبئة",
      p_lines: [{ product_id: PRODUCT_ID, quantity: 10 }],
      p_source_order_id: null,
    });
  });

  it("rejects a previously saved template when its product quantity policy has changed", async () => {
    mocks.user = CUSTOMER;
    mocks.productRows = [{
      ...PRODUCT,
      min_order_quantity: 5,
      order_quantity_multiple: 5,
    }];
    mocks.templateRows = [{
      id: "33333333-3333-4333-8333-333333333333",
      name: "قالب قديم",
      created_at: "2026-11-16T10:00:00.000Z",
      updated_at: "2026-11-16T10:00:00.000Z",
      source_order_id: null,
    }];
    mocks.templateItemRows = [{ product_id: PRODUCT_ID, quantity: "6" }];

    await mountReorderRoute();
    await applyTemplate();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تبدأ من 5 وتزيد بمضاعف 5");
    expect(mocks.mergeOfflineCartDraft).not.toHaveBeenCalled();
  });

  it("validates the combined cart quantity before applying a valid reorder template", async () => {
    mocks.user = CUSTOMER;
    mocks.productRows = [{
      ...PRODUCT,
      min_order_quantity: 5,
      order_quantity_multiple: 5,
    }];
    mocks.templateRows = [{
      id: "33333333-3333-4333-8333-333333333333",
      name: "قالب توريد",
      created_at: "2026-11-16T10:00:00.000Z",
      updated_at: "2026-11-16T10:00:00.000Z",
      source_order_id: null,
    }];
    mocks.templateItemRows = [{ product_id: PRODUCT_ID, quantity: 5 }];
    mocks.offlineCartLines = [{ product_id: PRODUCT_ID, quantity: 4 }];

    await mountReorderRoute();
    await applyTemplate();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تبدأ من 5 وتزيد بمضاعف 5");
    expect(mocks.mergeOfflineCartDraft).not.toHaveBeenCalled();
  });

});
