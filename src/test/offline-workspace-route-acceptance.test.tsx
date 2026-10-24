import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import { routeTree } from "@/routeTree.gen";
import { offlineCartStorageKey } from "@/lib/offline-cart";

type TestUser = {
  id: string;
  profileId: string;
  email: string;
  name: string;
  roles: string[];
  isStaff: boolean;
};

const PROFILE_ID = "offline-customer-a";
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

  beforeEach(() => {
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
    });
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
      "aghbari:catalog:v1",
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
      window.localStorage.getItem("aghbari:catalog:v1") || "[]",
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

  it("refuses restoration when the server-resolved profile differs and preserves the draft", async () => {
    window.localStorage.setItem("aghbari:catalog:v1", JSON.stringify([PRODUCT]));
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

  it("keeps the local catalog unchanged after sync failure and recovers on retry", async () => {
    const originalCatalog = [
      {
        ...PRODUCT,
        display_price: 999999,
        cost_price: 888888,
      },
    ];
    window.localStorage.setItem("aghbari:catalog:v1", JSON.stringify(originalCatalog));
    await mountOfflineRoute();

    const storedBeforeSync = window.localStorage.getItem("aghbari:catalog:v1");
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
    expect(window.localStorage.getItem("aghbari:catalog:v1")).toBe(storedBeforeSync);

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
      window.localStorage.getItem("aghbari:catalog:v1") || "[]",
    ) as Array<Record<string, unknown>>;
    expect(safeCatalog).toHaveLength(1);
    expect(safeCatalog[0]).toMatchObject({ id: PRODUCT_ID, name: PRODUCT.name, base_price: 0 });
    expect(safeCatalog[0]).not.toHaveProperty("base_price");
    expect(safeCatalog[0]).not.toHaveProperty("display_price");
    expect(safeCatalog[0]).not.toHaveProperty("cost_price");
  });
});
