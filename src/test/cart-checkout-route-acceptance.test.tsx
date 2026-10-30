import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";
import { saveCustomerCart } from "@/lib/customer-cart";

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
  organization_id: string;
  category_id: string | null;
  name: string;
  name_en: string | null;
  item_code: string;
  sku: string | null;
  barcode: string | null;
  brand_id: string | null;
  unit: string;
  description: string | null;
  image_url: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  price_wholesale_of_wholesale: number;
  price_wholesale: number;
  price_retail: number;
  base_price: number;
  stock_quantity: number;
  reserved_quantity: number;
  min_stock_level: number;
  status: string;
  display_price: number;
  inventory: { id: string; product_id: string; warehouse_id: string; quantity_on_hand: number; quantity_reserved: number; quantity_available: number };
};

type RpcResult = { data: unknown; error: { message: string; status?: number } | null };

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchPromotions: vi.fn(),
  fetchSettings: vi.fn(),
  fetchAnnouncements: vi.fn(),
  fetchCatalogPage: vi.fn(),
  cartLines: [] as Array<{ product_id: string; quantity: number }>,
  saveCartFailures: 0 as number,
  productReadFailures: 0,
  validationFailures: 0,
  submitFailures: 0,
  rpc: vi.fn(),
  getSession: vi.fn(),
  submitCalls: [] as Array<{ name: string; args: Record<string, unknown> }>,
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

vi.mock("@/lib/api", () => ({
  fetchProducts: mocks.fetchProducts,
  fetchCategories: mocks.fetchCategories,
  fetchStorefrontPromotions: mocks.fetchPromotions,
  fetchSettingsMap: mocks.fetchSettings,
  fetchStorefrontAnnouncements: mocks.fetchAnnouncements,
}));

vi.mock("@/lib/storefront-catalog", () => ({
  fetchStorefrontCatalogPage: mocks.fetchCatalogPage,
}));

vi.mock("@/lib/customer-cart", () => ({
  fetchCustomerCart: vi.fn(async () => ({ items: mocks.cartLines, updated_at: null })),
  saveCustomerCart: vi.fn(async (lines: Array<{ product_id: string; quantity: number }>) => {
    if (mocks.saveCartFailures > 0) {
      mocks.saveCartFailures -= 1;
      throw new Error("synthetic persistent cart refusal");
    }
    return { items: lines, updated_at: null };
  }),
}));

vi.mock("@/lib/offline-cart", () => ({
  loadOfflineCartDraft: vi.fn(() => mocks.cartLines),
  offlineCartStorageKey: vi.fn((profileId?: string) => `test-cart:${profileId ?? "guest"}`),
  saveOfflineCartDraft: vi.fn(() => true),
}));

vi.mock("@/lib/customer-addresses", () => ({
  fetchCustomerAddresses: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/saved-products", () => ({
  readPendingSavedProductChanges: vi.fn().mockReturnValue([]),
  savedProductCacheKey: vi.fn((profileId: string) => `test-saved:${profileId}`),
  setStorefrontSavedProduct: vi.fn(),
  syncStorefrontSavedProducts: vi.fn().mockResolvedValue({ productIds: [], pendingCount: 0 }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    from: vi.fn(),
    auth: { getSession: mocks.getSession },
  },
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "checkout-route@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const ORDER_ID = "33333333-3333-4333-8333-333333333333";
const PRODUCT: ProductRow = {
  id: PRODUCT_ID,
  organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  category_id: null,
  name: "صنف السلة",
  name_en: "Cart product",
  item_code: "SKU-CART-01",
  sku: "CART-01",
  barcode: "000012345678",
  brand_id: null,
  unit: "كرتون",
  description: "صنف اختباري",
  image_url: null,
  is_active: true,
  is_featured: false,
  sort_order: 1,
  price_wholesale_of_wholesale: 0,
  price_wholesale: 0,
  price_retail: 0,
  base_price: 0,
  stock_quantity: 8,
  reserved_quantity: 1,
  min_stock_level: 2,
  status: "active",
  // Sentinel catches accidental rendering of cached/catalog financial data.
  display_price: 777777,
  inventory: {
    id: "44444444-4444-4444-8444-444444444444",
    product_id: PRODUCT_ID,
    warehouse_id: "55555555-5555-4555-8555-555555555555",
    quantity_on_hand: 8,
    quantity_reserved: 1,
    quantity_available: 7,
  },
};

const VERIFIED_CHECKOUT = {
  valid: true,
  pricing_verified: true,
  item_count: 1,
  currency: "YER",
  items: [{
    product_id: PRODUCT_ID,
    name: "صنف السلة",
    item_code: "SKU-CART-01",
    unit: "كرتون",
    quantity: 2,
  }],
};

describe("customer cart and checkout real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.getSession.mockReset().mockImplementation(async () => ({
      data: { session: mocks.user ? { user: { id: mocks.user.id } } : null },
      error: null,
    }));
    mocks.cartLines = [];
    mocks.saveCartFailures = 0;
    mocks.productReadFailures = 0;
    mocks.validationFailures = 0;
    mocks.submitFailures = 0;
    mocks.submitCalls = [];
    mocks.fetchProducts.mockReset().mockImplementation(async () => {
      if (mocks.productReadFailures > 0) {
        mocks.productReadFailures -= 1;
        throw new Error("synthetic catalog read failure");
      }
      return [PRODUCT];
    });
    mocks.fetchCategories.mockReset().mockResolvedValue([]);
    mocks.fetchPromotions.mockReset().mockResolvedValue([]);
    mocks.fetchSettings.mockReset().mockResolvedValue({
      show_price_on_cards: false,
      show_price_in_cart: false,
      show_price_in_orders: false,
    });
    mocks.fetchAnnouncements.mockReset().mockResolvedValue([]);
    mocks.fetchCatalogPage.mockReset().mockResolvedValue({
      items: [PRODUCT],
      totalCount: 1,
      totalPages: 1,
      page: 1,
      pageSize: 24,
    });
    mocks.rpc.mockReset().mockImplementation(async (name: string, args: Record<string, unknown>): Promise<RpcResult> => {
      if (name === "validate_checkout_cart") {
        if (mocks.validationFailures > 0) {
          mocks.validationFailures -= 1;
          return { data: null, error: { message: "synthetic cart validation refusal" } };
        }
        return { data: VERIFIED_CHECKOUT, error: null };
      }
      if (name === "submit_customer_order") {
        mocks.submitCalls.push({ name, args });
        if (mocks.submitFailures > 0) {
          mocks.submitFailures -= 1;
          return { data: null, error: { message: "synthetic order submission refusal" } };
        }
        return { data: { id: ORDER_ID, order_number: "SO-TEST-001", status: "pending" }, error: null };
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
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  async function flush() {
    await act(async () => {
      // Cart restoration and checkout server validation cross multiple async effects.
      for (let i = 0; i < 10; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
  }

  async function mountRoute(path: "/cart" | "/checkout") {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
    expect(router.state.location.pathname).toBe(path);
    return router;
  }

  async function unmountRoute() {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  }

  async function clickButtonContaining(label: string) {
    const button = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((candidate) => candidate.textContent?.includes(label));
    expect(button).toBeTruthy();
    await act(async () => {
      fireEvent.click(button!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
  }

  it("renders a real empty cart without financial fallback values", async () => {
    await mountRoute("/cart");

    expect(host?.textContent).toContain("سلتك فارغة");
    expect(host?.textContent).toContain("تصفح المنتجات");
    expect(host?.textContent).not.toContain("777777");
    expect(host?.textContent).not.toContain("0.00");
  });

  it("keeps cached/catalog price sentinels out of the cart when price visibility is disabled", async () => {
    mocks.cartLines = [{ product_id: PRODUCT_ID, quantity: 2 }];
    await mountRoute("/cart");

    expect(host?.textContent).toContain("سلة المشتريات");
    expect(host?.textContent).toContain("صنف السلة");
    expect(host?.textContent).toContain("سيُراجع الطلب ويُعتمد من جهة الإدارة");
    expect(host?.textContent).not.toContain("777777");
    expect(host?.textContent).not.toContain("0.00");
    expect(mocks.rpc).not.toHaveBeenCalledWith("preview_customer_order_pricing", expect.anything());
  });

  it("shows cart restoration failure and recovers only after the catalog retry succeeds", async () => {
    mocks.cartLines = [{ product_id: PRODUCT_ID, quantity: 1 }];
    mocks.productReadFailures = 1;
    await mountRoute("/cart");

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر استعادة تفاصيل السلة من الكتالوج الحالي.",
    );
    expect(host?.textContent).not.toContain("SKU-CART-01");
    await clickButtonContaining("إعادة المحاولة");

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("صنف السلة");
    expect(host?.textContent).not.toContain("777777");
  });

  it("refuses empty checkout without validating or submitting an empty order", async () => {
    await mountRoute("/checkout");

    expect(host?.textContent).toContain("لا توجد أصناف لإتمام الطلب");
    expect(host?.textContent).toContain("لن يتم إنشاء طلب فارغ");
    expect(mocks.rpc).not.toHaveBeenCalledWith("validate_checkout_cart", expect.anything());
    expect(mocks.rpc).not.toHaveBeenCalledWith("submit_customer_order", expect.anything());
    expect(host?.textContent).not.toContain("SO-TEST-001");
  });

  it("blocks submission after validation failure, then keeps failure visible and only confirms after server acknowledgement", async () => {
    mocks.user = CUSTOMER;
    mocks.cartLines = [{ product_id: PRODUCT_ID, quantity: 2 }];
    // Keep automatic revalidation fail-closed until the test explicitly clicks Retry.
    mocks.validationFailures = 50;
    mocks.submitFailures = 1;
    await mountRoute("/checkout");

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("synthetic cart validation refusal");
    const submit = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("تأكيد الطلب"));
    expect(submit).toBeTruthy();
    expect(submit?.disabled).toBe(true);
    expect(mocks.submitCalls).toHaveLength(0);

    mocks.validationFailures = 0;
    await clickButtonContaining("إعادة التحقق");
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("صنف السلة");
    expect(host?.textContent).not.toContain("777777");
    expect(host?.querySelector<HTMLButtonElement>('input[placeholder="7XX XXX XXX"]')?.disabled).not.toBe(true);

    const phone = host?.querySelector<HTMLInputElement>('input[placeholder="7XX XXX XXX"]');
    expect(phone).toBeTruthy();
    await act(async () => {
      fireEvent.change(phone!, { target: { value: "777777777" } });
    });
    await flush();

    await clickButtonContaining("تأكيد الطلب");
    expect(host?.textContent).toContain("لم يصل تأكيد نهائي لنتيجة الطلب.");
    expect(host?.textContent).not.toContain("SO-TEST-001");
    expect(mocks.submitCalls).toHaveLength(1);
    const lockedPhone = host?.querySelector<HTMLInputElement>('input[placeholder="7XX XXX XXX"]');
    expect(lockedPhone?.disabled).toBe(true);
    const firstKey = mocks.submitCalls[0].args._idempotency_key;
    expect(firstKey).toEqual(expect.stringMatching(/^[A-Za-z0-9_-]{16,128}$/));

    await clickButtonContaining("تأكيد الطلب");
    expect(host?.textContent).toContain("SO-TEST-001");
    expect(host?.textContent).not.toContain("777777");
    expect(mocks.submitCalls).toHaveLength(2);
    expect(mocks.submitCalls[1].args._idempotency_key).toBe(firstKey);
    expect(vi.mocked(saveCustomerCart).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("recovers an ambiguous checkout after reload and refuses a different payload", async () => {
    mocks.user = CUSTOMER;
    mocks.cartLines = [{ product_id: PRODUCT_ID, quantity: 2 }];
    mocks.submitFailures = 1;
    await mountRoute("/checkout");

    const firstPhone = host?.querySelector<HTMLInputElement>('input[placeholder="7XX XXX XXX"]');
    expect(firstPhone).toBeTruthy();
    await act(async () => {
      fireEvent.change(firstPhone!, { target: { value: "777777777" } });
    });
    await flush();
    await clickButtonContaining("تأكيد الطلب");

    expect(host?.textContent).toContain("لم يصل تأكيد نهائي لنتيجة الطلب.");
    expect(host?.querySelector<HTMLAnchorElement>('a[href="/orders"]')?.textContent).toContain("افتح طلباتي للتحقق من ظهور الطلب");
    expect(mocks.submitCalls).toHaveLength(1);
    const firstKey = mocks.submitCalls[0].args._idempotency_key;

    await unmountRoute();
    await mountRoute("/checkout");

    expect(host?.textContent).toContain("توجد محاولة طلب سابقة لم يصل تأكيدها بعد.");
    const recoveredPhone = host?.querySelector<HTMLInputElement>('input[placeholder="7XX XXX XXX"]');
    expect(recoveredPhone?.disabled).toBe(false);
    await act(async () => {
      fireEvent.change(recoveredPhone!, { target: { value: "771111111" } });
    });
    await flush();
    const savesBeforeDifferentPayload = vi.mocked(saveCustomerCart).mock.calls.length;
    await clickButtonContaining("تأكيد الطلب");

    expect(mocks.submitCalls).toHaveLength(1);
    expect(vi.mocked(saveCustomerCart).mock.calls).toHaveLength(savesBeforeDifferentPayload);
    expect(host?.textContent).toContain("أدخل بيانات الطلب السابق نفسها");
    expect(host?.textContent).not.toContain("SO-TEST-001");

    await act(async () => {
      fireEvent.change(recoveredPhone!, { target: { value: "777777777" } });
    });
    await flush();
    await clickButtonContaining("تأكيد الطلب");

    expect(host?.textContent).toContain("SO-TEST-001");
    expect(mocks.submitCalls).toHaveLength(2);
    expect(mocks.submitCalls[1].args._idempotency_key).toBe(firstKey);
  });

  it("fails closed when the current persistent cart cannot be saved before order submission", async () => {
    mocks.user = CUSTOMER;
    mocks.cartLines = [{ product_id: PRODUCT_ID, quantity: 2 }];
    await mountRoute("/checkout");
    const phone = host?.querySelector<HTMLInputElement>('input[placeholder="7XX XXX XXX"]');
    expect(phone).toBeTruthy();
    await act(async () => {
      fireEvent.change(phone!, { target: { value: "777777777" } });
    });
    await flush();

    // Ensure server-side validation and address loading have settled before exercising the refusal path.
    // The route may still be committing the final validation state on slower CI workers.
    const submitButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("تأكيد الطلب"));
    expect(submitButton).toBeTruthy();
    for (let attempt = 0; attempt < 30 && submitButton!.disabled; attempt += 1) {
      await flush();
    }
    expect(submitButton!.disabled).toBe(false);

    // Fail all in-flight/background sync attempts as well as the explicit pre-submit write.
    mocks.saveCartFailures = 20;
    await act(async () => {
      fireEvent.click(submitButton!);
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    });
    await flush();

    expect(vi.mocked(saveCustomerCart).mock.calls.length).toBeGreaterThan(0);
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("synthetic persistent cart refusal");
    expect(host?.querySelector('[role="alert"]')?.getAttribute("aria-live")).toBe("assertive");
    expect(mocks.submitCalls).toHaveLength(0);
    expect(host?.textContent).not.toContain("SO-TEST-001");

    mocks.saveCartFailures = 0;
    await clickButtonContaining("تأكيد الطلب");
    expect(host?.textContent).toContain("SO-TEST-001");
    expect(mocks.submitCalls).toHaveLength(1);
  });
});
