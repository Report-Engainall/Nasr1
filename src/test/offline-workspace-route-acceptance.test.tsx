import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";
import { offlineCartStorageKey } from "@/lib/offline-cart";
import { offlineCatalogCacheKeys, offlineCatalogScopeFingerprint } from "@/lib/offline-catalog-cache";

type TestUser = {
  id: string;
  profileId: string;
  email: string;
  name: string;
  roles: string[];
  isStaff: boolean;
};

const PROFILE_ID = "offline-customer-a";
const PROFILE_CATALOG_KEYS = offlineCatalogCacheKeys(PROFILE_ID)!;
const CATALOG_CACHE_KEY = PROFILE_CATALOG_KEYS.catalogKey;
const CATALOG_SYNC_KEY = PROFILE_CATALOG_KEYS.lastServerSyncKey;
const CATALOG_SCOPE_KEY = PROFILE_CATALOG_KEYS.scopeKey;
const ORGANIZATION_ID = "offline-org-a";
const PRODUCT_ID = "55555555-5555-4555-8555-555555555555";
const PRODUCT = {
  id: PRODUCT_ID,
  name: "صنف تجريبي للعمل دون اتصال",
  item_code: "OFFLINE-001",
  unit: "قطعة",
  status: "active",
  barcode: null,
  description: "منتج اصطناعي لاختبار مسار العمل دون اتصال",
  category_id: null,
  image_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  fetchProducts: vi.fn(),
  getCurrentTenantScope: vi.fn(),
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
  };
});

vi.mock("@/lib/supabase", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase")>();
  return {
    ...actual,
    getCurrentTenantScope: mocks.getCurrentTenantScope,
    supabase: {
      from: mocks.supabaseFrom,
      rpc: mocks.supabaseRpc,
      auth: { getSession: mocks.getSession },
    },
  };
});

describe("offline workspace real-route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;
  let initialOnline = true;

  beforeEach(() => {
    initialOnline = window.navigator.onLine;
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: initialOnline });
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.user = {
      id: PROFILE_ID,
      profileId: PROFILE_ID,
      email: "offline-customer@example.test",
      name: "عميل اختبار",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.fetchProducts.mockReset().mockResolvedValue([PRODUCT]);
    mocks.getCurrentTenantScope.mockReset().mockResolvedValue({
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      warehouseId: null,
      isStaff: false,
    });
    window.localStorage.setItem(CATALOG_SCOPE_KEY, offlineCatalogScopeFingerprint({
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      warehouseId: null,
      isStaff: false,
    }));
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
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: initialOnline });
  });

  async function mountOfflineRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/offline"] }),
      context: { queryClient: new QueryClient() },
    });

    await router.load();
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
    });

    expect(router.state.location.pathname).toBe("/offline");
    return router;
  }

  function findButton(label: string) {
    const button = Array.from(host!.querySelectorAll("button")).find((candidate) =>
      candidate.textContent?.includes(label),
    );
    expect(button).toBeDefined();
    return button!;
  }

  it("sanitizes cached catalog pricing and renders only the active customer's local draft", async () => {
    window.localStorage.setItem(
      CATALOG_CACHE_KEY,
      JSON.stringify([
        {
          ...PRODUCT,
          base_price: 888888,
          display_price: 777777,
          price_wholesale: 666666,
          price_retail: 555555,
          cost_price: 444444,
          average_cost: 333333,
          organization_id: "another-organization",
          tenant_id: "another-tenant",
        },
      ]),
    );
    window.localStorage.setItem(
      offlineCartStorageKey(PROFILE_ID),
      JSON.stringify([{ product_id: PRODUCT_ID, quantity: 2 }]),
    );

    await mountOfflineRoute();

    await waitFor(() => {
      expect(host?.textContent).toContain("العمل دون اتصال");
      expect(host?.textContent).toContain(PRODUCT.name);
    });
    expect(host?.textContent).toContain("مسودة السلة لهذا الحساب");
    expect(host?.textContent).not.toContain("888888");
    expect(host?.textContent).not.toContain("777777");
    expect(host?.textContent).not.toContain("666666");
    expect(host?.textContent).not.toContain("555555");
    expect(host?.textContent).not.toContain("444444");
    expect(host?.textContent).not.toContain("333333");

    const safeCatalog = JSON.parse(
      window.localStorage.getItem(CATALOG_CACHE_KEY) || "[]",
    ) as Array<Record<string, unknown>>;
    expect(safeCatalog).toHaveLength(1);
    expect(safeCatalog[0]).toMatchObject({ id: PRODUCT_ID, name: PRODUCT.name });
    for (const key of [
      "base_price",
      "display_price",
      "price_wholesale",
      "price_retail",
      "cost_price",
      "average_cost",
      "organization_id",
      "tenant_id",
    ]) {
      expect(safeCatalog[0]).not.toHaveProperty(key);
    }
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
  });

  it("never renders another profile's cached cart after account switch or logout", async () => {
    const otherProfileId = "offline-customer-b";
    const otherProductId = "66666666-6666-4666-8666-666666666666";
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));
    const firstProfileDraft = [{ product_id: PRODUCT_ID, quantity: 7 }];
    const secondProfileDraft = [{ product_id: otherProductId, quantity: 1 }];
    window.localStorage.setItem(
      offlineCartStorageKey(PROFILE_ID),
      JSON.stringify(firstProfileDraft),
    );
    window.localStorage.setItem(
      offlineCartStorageKey(otherProfileId),
      JSON.stringify(secondProfileDraft),
    );

    const router = await mountOfflineRoute();
    await waitFor(() => {
      const row = host?.querySelector("li");
      expect(row?.textContent).toContain(PRODUCT.name);
    });

    mocks.user = {
      id: "auth-user-b",
      profileId: otherProfileId,
      email: "offline-customer-b@example.test",
      name: "عميل اختبار ب",
      roles: ["customer"],
      isStaff: false,
    };
    await act(async () => {
      // The real AuthScopedOutlet remounts route-local UI when identity changes.
      root?.unmount();
      root = createRoot(host!);
      root.render(<RouterProvider router={router} />);
    });
    await waitFor(() => {
      const row = host?.querySelector("li");
      expect(row?.textContent).toContain("صنف غير موجود في النسخة المحلية");
      expect(row?.textContent).not.toContain(PRODUCT.name);
    });

    mocks.user = null;
    await act(async () => {
      root?.unmount();
      root = createRoot(host!);
      root.render(<RouterProvider router={router} />);
    });
    await waitFor(() => {
      // Gate replaces the offline workspace with the login screen on sign-out.
      // No cached cart row or private product name may remain visible.
      expect(host?.querySelector("li")).toBeNull();
      expect(host?.querySelector(".login-screen")).not.toBeNull();
      expect(host?.textContent).not.toContain(PRODUCT.name);
      expect(host?.textContent).not.toContain("صنف غير موجود في النسخة المحلية");
    });

    // The old draft stays in its own storage namespace, but is never rendered
    // for the other customer or for the anonymous signed-out state.
    expect(JSON.parse(window.localStorage.getItem(offlineCartStorageKey(PROFILE_ID)) || "[]"))
      .toEqual(firstProfileDraft);
    expect(JSON.parse(window.localStorage.getItem(offlineCartStorageKey(otherProfileId)) || "[]"))
      .toEqual(secondProfileDraft);
  });

  it("refuses restoration when the server-resolved profile differs and preserves the draft", async () => {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));
    const draft = [{ product_id: PRODUCT_ID, quantity: 2 }];
    const storageKey = offlineCartStorageKey(PROFILE_ID);
    window.localStorage.setItem(storageKey, JSON.stringify(draft));
    mocks.getCurrentTenantScope.mockResolvedValue({
      profileId: "offline-customer-b",
      organizationId: "offline-org-b",
    });

    const router = await mountOfflineRoute();
    await act(async () => {
      findButton("التحقق واستعادة السلة").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    await waitFor(() => {
      expect(host?.querySelector('[role="status"]')?.textContent).toContain(
        "تغير نطاق الحساب",
      );
    });
    expect(router.state.location.pathname).toBe("/offline");
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    expect(JSON.parse(window.localStorage.getItem(storageKey) || "[]")).toEqual(draft);
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
  });

  it("fails closed when the cached catalog has no verified server-sync timestamp", async () => {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));

    await mountOfflineRoute();

    await waitFor(() => {
      expect(host?.textContent).toContain("آخر تحقق من الخادم: غير معروف");
      expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
        "لم يتم التحقق من حداثة النسخة المحلية",
      );
    });
  });

  it("fails closed when the cached catalog timestamp is implausibly far in the future", async () => {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));
    window.localStorage.setItem(
      CATALOG_SYNC_KEY,
      new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    );

    await mountOfflineRoute();

    await waitFor(() => {
      expect(host?.textContent).toContain("آخر تحقق من الخادم: غير معروف");
      expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
        "لم يتم التحقق من حداثة النسخة المحلية",
      );
    });
  });

  it("reports partial local persistence accurately when the freshness marker cannot be saved", async () => {
    const refreshedProduct = { ...PRODUCT, name: "صنف بعد التحديث" };
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));
    window.localStorage.setItem(
      CATALOG_SYNC_KEY,
      new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    );
    mocks.fetchProducts.mockResolvedValue([refreshedProduct]);
    await mountOfflineRoute();

    const originalSetItem = Storage.prototype.setItem;
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === CATALOG_SYNC_KEY) {
        throw new DOMException("storage quota unavailable", "QuotaExceededError");
      }
      return originalSetItem.call(this, key, value);
    });

    try {
      await act(async () => {
        findButton("تحديث الكتالوج المحلي").click();
      });

      await waitFor(() => {
        expect(host?.textContent).toContain("حُفظت نسخة الكتالوج محليًا");
        expect(host?.textContent).toContain("حداثتها غير مؤكدة");
        expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
          "لم يتم التحقق من حداثة النسخة المحلية",
        );
      });

      expect(setItemSpy).toHaveBeenCalledWith(
        CATALOG_SYNC_KEY,
        expect.any(String),
      );
      const stored = JSON.parse(window.localStorage.getItem(CATALOG_CACHE_KEY) || "[]") as Array<{name?: string}>;
      expect(stored[0]?.name).toBe("صنف بعد التحديث");
      expect(window.localStorage.getItem(CATALOG_SYNC_KEY)).toBeNull();
      expect(host?.textContent).not.toContain("لم نغيّر النسخة المحلية");
    } finally {
      setItemSpy.mockRestore();
    }
  });

  it("shows cached catalog age and marks a cache stale after 24 hours until a successful refresh", async () => {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));
    window.localStorage.setItem(
      CATALOG_SYNC_KEY,
      new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    );
    await mountOfflineRoute();

    await waitFor(() => {
      expect(host?.textContent).toContain("آخر تحقق من الخادم: منذ ");
      expect(host?.querySelector('[role="alert"]')?.textContent).toContain("النسخة المحلية قديمة");
    });

    await act(async () => {
      findButton("تحديث الكتالوج المحلي").click();
    });
    await waitFor(() => {
      expect(host?.textContent).toContain("تم تحديث نسخة الكتالوج المحلية من الخادم: 1 صنف");
      expect(host?.querySelector('[role="alert"]')).toBeNull();
    });
    const lastSync = window.localStorage.getItem(CATALOG_SYNC_KEY);
    expect(lastSync).not.toBeNull();
    expect(Date.parse(lastSync!)).toBeGreaterThan(Date.now() - 5 * 60 * 1000);
  });

  it("allows only a local cart draft offline and blocks catalog refresh or server restoration", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));
    const draft = [{ product_id: PRODUCT_ID, quantity: 2 }];
    window.localStorage.setItem(offlineCartStorageKey(PROFILE_ID), JSON.stringify(draft));

    await mountOfflineRoute();

    expect(host?.textContent).toContain("غير متصل بالإنترنت");
    expect(findButton("تحديث الكتالوج المحلي").disabled).toBe(true);
    expect(findButton("التحقق واستعادة السلة").disabled).toBe(true);

    await act(async () => {
      findButton("حفظ مسودة السلة").click();
    });
    await waitFor(() => {
      expect(host?.textContent).toContain("لن يُرسل أي طلب ولن يُعتمد سعر أو مخزون");
    });

    expect(JSON.parse(window.localStorage.getItem(offlineCartStorageKey(PROFILE_ID)) || "[]")).toEqual(draft);
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    expect(mocks.getCurrentTenantScope).not.toHaveBeenCalled();
    expect(mocks.supabaseRpc).not.toHaveBeenCalled();
    expect(mocks.supabaseFrom).not.toHaveBeenCalled();
  });

  it("keeps the local catalog unchanged after sync failure and recovers on retry", async () => {
    const originalCatalog = [
      {
        ...PRODUCT,
        display_price: 999999,
        cost_price: 888888,
      },
    ];
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(originalCatalog));
    await mountOfflineRoute();

    const storedBeforeSync = window.localStorage.getItem(CATALOG_CACHE_KEY);
    mocks.fetchProducts
      .mockReset()
      .mockRejectedValueOnce(new Error("synthetic offline catalog failure"))
      .mockResolvedValueOnce([PRODUCT]);

    await act(async () => {
      findButton("تحديث الكتالوج المحلي").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(() => {
      expect(host?.querySelector('[role="status"]')?.textContent).toContain(
        "تعذر تحديث الكتالوج؛ لم نغيّر النسخة المحلية.",
      );
    });
    expect(window.localStorage.getItem(CATALOG_CACHE_KEY)).toBe(storedBeforeSync);

    await act(async () => {
      findButton("تحديث الكتالوج المحلي").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await waitFor(() => {
      expect(host?.querySelector('[role="status"]')?.textContent).toContain(
        "تم تحديث نسخة الكتالوج المحلية من الخادم: 1 صنف",
      );
    });
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(2);
    expect(host?.querySelector('[role="alert"]')).toBeNull();

    const safeCatalog = JSON.parse(
      window.localStorage.getItem(CATALOG_CACHE_KEY) || "[]",
    ) as Array<Record<string, unknown>>;
    expect(safeCatalog).toHaveLength(1);
    expect(safeCatalog[0]).toMatchObject({ id: PRODUCT_ID, name: PRODUCT.name });
    expect(safeCatalog[0]).not.toHaveProperty("base_price");
    expect(safeCatalog[0]).not.toHaveProperty("display_price");
    expect(safeCatalog[0]).not.toHaveProperty("cost_price");
  });

  it("discards a legacy global catalog instead of showing it to the active account", async () => {
    window.localStorage.setItem("aghbari:catalog:v1", JSON.stringify([PRODUCT]));
    window.localStorage.setItem("aghbari:catalog:last-server-sync:v1", new Date().toISOString());

    await mountOfflineRoute();

    expect(host?.textContent).not.toContain(PRODUCT.name);
    expect(window.localStorage.getItem("aghbari:catalog:v1")).toBeNull();
    expect(window.localStorage.getItem("aghbari:catalog:last-server-sync:v1")).toBeNull();
  });

  it("discards a scoped catalog with no verified tenant marker while offline", async () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));
    window.localStorage.setItem(CATALOG_SYNC_KEY, new Date().toISOString());
    window.localStorage.removeItem(CATALOG_SCOPE_KEY);

    await mountOfflineRoute();

    expect(host?.textContent).not.toContain(PRODUCT.name);
    expect(window.localStorage.getItem(CATALOG_CACHE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CATALOG_SYNC_KEY)).toBeNull();
  });

  it("discards cached rows when the same profile moves to another organization or warehouse", async () => {
    window.localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify([PRODUCT]));
    window.localStorage.setItem(CATALOG_SYNC_KEY, new Date().toISOString());
    mocks.getCurrentTenantScope.mockResolvedValue({
      profileId: PROFILE_ID,
      organizationId: "offline-org-b",
      warehouseId: "offline-warehouse-b",
      isStaff: false,
    });

    await mountOfflineRoute();

    await waitFor(() => expect(window.localStorage.getItem(CATALOG_CACHE_KEY)).toBeNull());
    expect(window.localStorage.getItem(CATALOG_SYNC_KEY)).toBeNull();
    expect(host?.textContent).not.toContain(PRODUCT.name);
    expect(window.localStorage.getItem(CATALOG_SCOPE_KEY)).not.toBeNull();
  });

  it("does not persist catalog rows when the tenant scope changes during sync", async () => {
    let resolveProducts!: (rows: typeof PRODUCT[]) => void;
    mocks.fetchProducts.mockReturnValueOnce(new Promise<typeof PRODUCT[]>((resolve) => {
      resolveProducts = resolve;
    }));

    await mountOfflineRoute();
    await act(async () => {
      findButton("تحديث الكتالوج المحلي").click();
    });
    await waitFor(() => expect(mocks.fetchProducts).toHaveBeenCalledTimes(1));

    mocks.getCurrentTenantScope.mockResolvedValue({
      profileId: "offline-customer-b",
      organizationId: "offline-org-b",
      warehouseId: null,
      isStaff: false,
    });
    await act(async () => {
      resolveProducts([PRODUCT]);
      await Promise.resolve();
    });

    await waitFor(() => expect(host?.textContent).toContain("تغير نطاق الحساب أو المستودع"));
    expect(window.localStorage.getItem(CATALOG_CACHE_KEY)).toBeNull();
    expect(window.localStorage.getItem(CATALOG_SYNC_KEY)).toBeNull();
  });

});
