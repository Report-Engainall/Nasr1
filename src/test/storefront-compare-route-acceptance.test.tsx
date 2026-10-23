import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";
import type { ProductWithInventory } from "@/lib/types";

type TestUser = {
  id: string;
  profileId: string;
  email: string;
  name: string;
  roles: string[];
  isStaff: boolean;
};

const PRODUCT_ID = "44444444-4444-4444-8444-444444444444";
const PRODUCT: ProductWithInventory = {
  id: PRODUCT_ID,
  name: "صنف تجريبي للمقارنة",
  name_en: null,
  item_code: "COMPARE-001",
  sku: null,
  barcode: null,
  category_id: null,
  brand_id: null,
  unit: "قطعة",
  description: "منتج اصطناعي لاختبار مسار مقارنة المنتجات",
  image_url: null,
  is_active: true,
  is_featured: false,
  sort_order: 1,
  price_wholesale_of_wholesale: 0,
  price_wholesale: 0,
  price_retail: 0,
  base_price: 0,
  stock_quantity: 0,
  reserved_quantity: 0,
  min_stock_level: 0,
  status: "active",
  display_price: 0,
};

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchStorefrontPromotions: vi.fn(),
  fetchSettingsMap: vi.fn(),
  fetchStorefrontAnnouncements: vi.fn(),
  syncStorefrontSavedProducts: vi.fn(),
  setStorefrontSavedProduct: vi.fn(),
  readPendingSavedProductChanges: vi.fn(),
  savedProductCacheKey: vi.fn(),
  supabaseFrom: vi.fn(),
  supabaseRpc: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    useAuth: () => ({
      user: mocks.user,
      ready: true,
      loading: false,
      configurationError: null,
      signOut: mocks.signOut,
    }),
    AuthProvider: ({ children }: { children: ReactNode }) => children,
  };
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    fetchProducts: mocks.fetchProducts,
    fetchCategories: mocks.fetchCategories,
    fetchStorefrontPromotions: mocks.fetchStorefrontPromotions,
    fetchSettingsMap: mocks.fetchSettingsMap,
    fetchStorefrontAnnouncements: mocks.fetchStorefrontAnnouncements,
  };
});

vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return {
    ...actual,
    supabase: {
      from: mocks.supabaseFrom,
      rpc: mocks.supabaseRpc,
      auth: { getSession: mocks.getSession },
    },
  };
});

vi.mock("@/lib/saved-products", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/saved-products")>();
  return {
    ...actual,
    syncStorefrontSavedProducts: mocks.syncStorefrontSavedProducts,
    setStorefrontSavedProduct: mocks.setStorefrontSavedProduct,
    readPendingSavedProductChanges: mocks.readPendingSavedProductChanges,
    savedProductCacheKey: mocks.savedProductCacheKey,
  };
});

describe("compare real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.user = null;
    mocks.fetchProducts.mockReset().mockResolvedValue([PRODUCT]);
    mocks.fetchCategories.mockReset().mockResolvedValue([]);
    mocks.fetchStorefrontPromotions.mockReset().mockResolvedValue([]);
    mocks.fetchSettingsMap.mockReset().mockResolvedValue({ show_price_on_cards: false });
    mocks.fetchStorefrontAnnouncements.mockReset().mockResolvedValue([]);
    mocks.syncStorefrontSavedProducts.mockReset().mockResolvedValue({ productIds: [], pendingCount: 0 });
    mocks.setStorefrontSavedProduct.mockReset().mockResolvedValue(true);
    mocks.readPendingSavedProductChanges.mockReset().mockReturnValue({});
    mocks.savedProductCacheKey.mockReset().mockImplementation((profileId: string) => "aghbari:wishlist:v2:" + profileId);
    mocks.supabaseFrom.mockReset();
    mocks.supabaseRpc.mockReset();
    mocks.getSession.mockReset().mockResolvedValue({ data: { session: null }, error: null });
    mocks.signOut.mockReset();
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

  async function mountCompareRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/compare"] }),
      context: { queryClient: new QueryClient() },
    });

    await router.load();
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    expect(router.state.location.pathname).toBe("/compare");
  }

  it("restores a guest comparison on the real deep route and removes the selected item through the page control", async () => {
    window.localStorage.setItem("aghbari:compare:v1", JSON.stringify([PRODUCT_ID]));

    await mountCompareRoute();

    await waitFor(() => {
      expect(host?.textContent).toContain("مقارنة المنتجات");
      expect(host?.textContent).toContain("صنف تجريبي للمقارنة");
      expect(host?.textContent).toContain("1 منتجات");
    });
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(mocks.syncStorefrontSavedProducts).not.toHaveBeenCalled();

    const removeFromCompare = host?.querySelector<HTMLButtonElement>('button[aria-label="إضافة للمقارنة"]');
    expect(removeFromCompare).toBeDefined();
    await act(async () => {
      removeFromCompare?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      expect(host?.textContent).toContain("اختر حتى ثلاثة منتجات من الكتالوج للمقارنة");
      expect(window.localStorage.getItem("aghbari:compare:v1")).toBe("[]");
    });
    expect(host?.textContent).not.toContain("صنف تجريبي للمقارنة");
    expect(mocks.syncStorefrontSavedProducts).not.toHaveBeenCalled();
  });

  it("shows catalog failure on the real compare route and recovers through the visible retry action", async () => {
    window.localStorage.setItem("aghbari:compare:v1", JSON.stringify([PRODUCT_ID]));
    mocks.fetchProducts
      .mockReset()
      .mockRejectedValueOnce(new Error("synthetic compare catalog failure"))
      .mockResolvedValueOnce([PRODUCT]);

    await mountCompareRoute();

    await waitFor(() => {
      expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر تحميل قائمة المنتجات");
    });
    expect(host?.textContent).toContain("synthetic compare catalog failure");
    expect(host?.textContent).not.toContain("صنف تجريبي للمقارنة");

    const retry = Array.from(host!.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("إعادة المحاولة"),
    );
    expect(retry).toBeDefined();
    await act(async () => {
      retry!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    await waitFor(() => {
      expect(host?.textContent).toContain("صنف تجريبي للمقارنة");
      expect(host?.querySelector('[role="alert"]')).toBeNull();
    });
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(2);
    expect(host?.textContent).toContain("1 منتجات");
  });
});
