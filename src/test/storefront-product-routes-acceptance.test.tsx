import { act, useSyncExternalStore, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";

// This file uses createRoot directly; opt into React's supported act() flushing contract.
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

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

type CatalogResult = { items: ProductRow[]; totalCount: number; totalPages: number; page: number; pageSize: number };

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  authListeners: new Set<() => void>(),
  getSession: vi.fn(),
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchPromotions: vi.fn(),
  fetchSettings: vi.fn(),
  fetchAnnouncements: vi.fn(),
  fetchCatalogPage: vi.fn(),
  detailReadFailures: 0,
  catalogReadFailures: 0,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => {
    const user = useSyncExternalStore(
      (notify) => {
        mocks.authListeners.add(notify);
        return () => mocks.authListeners.delete(notify);
      },
      () => mocks.user,
      () => mocks.user,
    );
    return {
      user,
      ready: true,
      loading: false,
      configurationError: null,
      signOut: vi.fn(),
    };
  },
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
  fetchCustomerCart: vi.fn().mockResolvedValue([]),
  saveCustomerCart: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/offline-cart", () => ({
  loadOfflineCartDraft: vi.fn().mockReturnValue([]),
  offlineCartStorageKey: vi.fn((profileId?: string) => `test-cart:${profileId ?? "guest"}`),
  saveOfflineCartDraft: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/saved-products", () => ({
  readPendingSavedProductChanges: vi.fn().mockReturnValue([]),
  savedProductCacheKey: vi.fn((profileId: string) => `test-saved:${profileId}`),
  setStorefrontSavedProduct: vi.fn(),
  syncStorefrontSavedProducts: vi.fn().mockResolvedValue({ productIds: [], pendingCount: 0 }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: vi.fn(), rpc: vi.fn(), auth: { getSession: mocks.getSession } },
}));

const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT: ProductRow = {
  id: PRODUCT_ID,
  organization_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  category_id: null,
  name: "صنف اختبار",
  name_en: "Test Product",
  item_code: "SKU-STOREFRONT-01",
  sku: "STOREFRONT-01",
  barcode: "000012345678",
  brand_id: null,
  unit: "كرتون",
  description: "وصف اختبار",
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
  // A sensitive sentinel should never appear when the policy hides customer-facing prices.
  display_price: 777777,
  inventory: {
    id: "33333333-3333-4333-8333-333333333333",
    product_id: PRODUCT_ID,
    warehouse_id: "44444444-4444-4444-8444-444444444444",
    quantity_on_hand: 8,
    quantity_reserved: 1,
    quantity_available: 7,
  },
};

const PAGE: CatalogResult = { items: [PRODUCT], totalCount: 1, totalPages: 1, page: 1, pageSize: 24 };

describe("public storefront product route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.authListeners.clear();
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    mocks.detailReadFailures = 0;
    mocks.catalogReadFailures = 0;
    mocks.fetchProducts.mockReset().mockImplementation(async () => {
      if (mocks.detailReadFailures > 0) {
        mocks.detailReadFailures -= 1;
        throw new Error("synthetic product detail read failure");
      }
      return [PRODUCT];
    });
    mocks.fetchCategories.mockReset().mockResolvedValue([]);
    mocks.fetchPromotions.mockReset().mockResolvedValue([]);
    mocks.fetchSettings.mockReset().mockResolvedValue({ show_price_on_cards: false });
    mocks.fetchAnnouncements.mockReset().mockResolvedValue([]);
    mocks.fetchCatalogPage.mockReset().mockImplementation(async (args: { search: string; categoryId: string | null; page: number; pageSize: number; availableOnly: boolean }) => {
      if (mocks.catalogReadFailures > 0) {
        mocks.catalogReadFailures -= 1;
        throw new Error("synthetic catalog page failure");
      }
      return PAGE;
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
  });

  async function flush() {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  async function mountRoute(path: string) {
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
    return router;
  }

  async function clickRetry() {
    const retry = Array.from(host?.querySelectorAll<HTMLButtonElement>('button') ?? []).find((button) =>
      button.textContent?.includes("إعادة المحاولة"),
    );
    expect(retry).toBeTruthy();
    await act(async () => {
      fireEvent.click(retry!);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await flush();
  }

  it("loads a deep-linked product by exact route ID without exposing a hidden customer price", async () => {
    const router = await mountRoute(`/product/${PRODUCT_ID}`);

    expect(router.state.location.pathname).toBe(`/product/${PRODUCT_ID}`);
    expect(host?.textContent).toContain("صنف اختبار");
    expect(host?.textContent).not.toContain("777777");
    expect(host?.textContent).not.toContain("0.00");
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(1);
  });

  it("fails closed when Supabase has a live session but the auth context has no resolved identity", async () => {
    mocks.user = null;
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "auth-user-unresolved" } } },
      error: null,
    });
    mocks.fetchProducts.mockResolvedValue([{ ...PRODUCT, name: "LIVE-SESSION-PRIVATE-CATALOG-SENTINEL" }]);

    await mountRoute(`/product/${PRODUCT_ID}`);

    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    expect(host?.textContent).not.toContain("LIVE-SESSION-PRIVATE-CATALOG-SENTINEL");
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("جلسة المصادقة لا تطابق هوية العرض الحالية");
  });

  it("does not render an unscoped public cache when an authenticated tenant detail read fails", async () => {
    const stale = {
      ...PRODUCT,
      name: "OTHER-TENANT-CACHE-SENTINEL",
      inventory: { ...PRODUCT.inventory, warehouse_id: "99999999-9999-4999-8999-999999999999" },
    };
    window.localStorage.setItem("aghbari:catalog:v1", JSON.stringify([stale]));
    window.localStorage.setItem("aghbari:catalog:public:v2", JSON.stringify([stale]));
    mocks.user = {
      id: "auth-user-1",
      profileId: "profile-1",
      email: "buyer@example.test",
      name: "Buyer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "auth-user-1" } } }, error: null });
    mocks.detailReadFailures = 1;

    await mountRoute(`/product/${PRODUCT_ID}`);

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل تفاصيل المنتج");
    expect(host?.textContent).not.toContain("OTHER-TENANT-CACHE-SENTINEL");
    expect(host?.textContent).not.toContain("99999999-9999-4999-8999-999999999999");
    expect(window.localStorage.getItem("aghbari:catalog:v1")).toBeNull();
  });

  it("fails closed when a paged catalog read races with an account switch", async () => {
    mocks.user = {
      id: "auth-user-a",
      profileId: "profile-a",
      email: "tenant-a@example.test",
      name: "Tenant A",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "auth-user-b" } } }, error: null });
    mocks.fetchCatalogPage.mockResolvedValue({
      ...PAGE,
      items: [{ ...PRODUCT, name: "PAGED-OTHER-SESSION-PRIVATE-CATALOG-SENTINEL" }],
    });

    await mountRoute("/products?q=stale-session");

    expect(mocks.fetchCatalogPage).not.toHaveBeenCalled();
    expect(host?.textContent).not.toContain("PAGED-OTHER-SESSION-PRIVATE-CATALOG-SENTINEL");
    expect(host?.querySelector('[role=\"alert\"]')?.textContent).toContain("تعذر تحميل الكتالوج");
  });

  it("fails closed when the live Supabase session belongs to a different identity than the stale auth context", async () => {
    mocks.user = {
      id: "auth-user-a",
      profileId: "profile-a",
      email: "tenant-a@example.test",
      name: "Tenant A",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "auth-user-b" } } },
      error: null,
    });
    mocks.fetchProducts.mockResolvedValue([{ ...PRODUCT, name: "OTHER-SESSION-PRIVATE-CATALOG-SENTINEL" }]);

    await mountRoute(`/product/${PRODUCT_ID}`);

    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    expect(host?.textContent).not.toContain("OTHER-SESSION-PRIVATE-CATALOG-SENTINEL");
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("جلسة المصادقة لا تطابق هوية العرض");
  });

  it("does not write authenticated tenant catalog data into the shared public cache", async () => {
    mocks.user = {
      id: "auth-user-1",
      profileId: "profile-1",
      email: "buyer@example.test",
      name: "Buyer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "auth-user-1" } } }, error: null });

    await mountRoute(`/product/${PRODUCT_ID}`);

    expect(host?.textContent).toContain("صنف اختبار");
    expect(window.localStorage.getItem("aghbari:catalog:public:v2")).toBeNull();
    expect(window.localStorage.getItem("aghbari:catalog:v1")).toBeNull();
  });

  it("fails visibly on a product detail read error and recovers through the rendered retry action", async () => {
    mocks.detailReadFailures = 1;
    await mountRoute(`/product/${PRODUCT_ID}`);

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل تفاصيل المنتج");
    expect(host?.textContent).not.toContain("777777");

    await clickRetry();

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("صنف اختبار");
    expect(host?.textContent).not.toContain("777777");
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(2);
  });

  it("invalidates an already-rendered product immediately when the authenticated tenant changes", async () => {
    mocks.user = {
      id: "auth-user-a",
      profileId: "profile-a",
      email: "tenant-a@example.test",
      name: "Tenant A",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "auth-user-a" } } }, error: null });
    mocks.fetchProducts.mockImplementation(async () => {
      if (mocks.detailReadFailures > 0) {
        mocks.detailReadFailures -= 1;
        throw new Error("synthetic product detail read failure after identity switch");
      }
      return [{ ...PRODUCT, name: "TENANT-A-ONLY-SENTINEL" }];
    });

    const router = await mountRoute(`/product/${PRODUCT_ID}`);
    expect(host?.textContent).toContain("TENANT-A-ONLY-SENTINEL");

    mocks.user = {
      id: "auth-user-b",
      profileId: "profile-b",
      email: "tenant-b@example.test",
      name: "Tenant B",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "auth-user-b" } } }, error: null });
    mocks.detailReadFailures = 1;

    expect(mocks.authListeners.size).toBeGreaterThan(0);
    await act(async () => {
      for (const notify of [...mocks.authListeners]) notify();
    });

    // ProductPage keys its storefront subtree to the live auth identity. React must commit
    // that boundary before stale product data can remain visible.
    expect(host?.textContent).not.toContain("TENANT-A-ONLY-SENTINEL");
    await flush();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل تفاصيل المنتج");
    expect(host?.textContent).not.toContain("TENANT-A-ONLY-SENTINEL");
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(2);
  });

  it("shows a not-available state for an unknown deep-linked product ID", async () => {
    mocks.fetchProducts.mockResolvedValue([{ ...PRODUCT, id: "55555555-5555-4555-8555-555555555555" }]);
    await mountRoute(`/product/${PRODUCT_ID}`);

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("المنتج غير متاح");
    expect(host?.textContent).not.toContain("777777");
    expect(Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? []).some((button) => button.textContent?.includes("العودة للمتجر"))).toBe(true);
  });

  it("keeps products listing on its server-paginated API and carries the deep-link search safely", async () => {
    const router = await mountRoute("/products?q=%D8%B4%D8%A7%D9%8A");

    expect(router.state.location.pathname).toBe("/products");
    expect(mocks.fetchCatalogPage).toHaveBeenCalledWith({
      search: "شاي",
      categoryId: null,
      page: 1,
      pageSize: 24,
      availableOnly: false,
    });
    expect(host?.textContent).toContain("صنف اختبار");
    expect(host?.textContent).not.toContain("777777");
  });

  it("shows catalog fetch failures and retries without rendering stale or fabricated results", async () => {
    mocks.catalogReadFailures = 1;
    await mountRoute("/products?q=%D8%B4%D8%A7%D9%8A");

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل الكتالوج");
    expect(host?.textContent).not.toContain("صنف اختبار");
    expect(host?.textContent).not.toContain("777777");

    await clickRetry();

    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("صنف اختبار");
    expect(host?.textContent).not.toContain("777777");
    expect(mocks.fetchCatalogPage).toHaveBeenCalledTimes(2);
  });
});
