import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/format";
import { storefrontCategorySlug } from "@/lib/storefront-slugs";

const mocks = vi.hoisted(() => ({
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchStorefrontPromotions: vi.fn(),
  fetchSettingsMap: vi.fn(),
  fetchStorefrontAnnouncements: vi.fn(),
  categoryResult: null as null | {
    data: unknown;
    loading: boolean;
    error: string | null;
    refetch: () => void;
  },
  settings: {} as Record<string, unknown>,
  user: null as null | { isStaff: boolean; profileId?: string; name?: string },
  products: [
    {
      id: "product-1",
      name: "Rice",
      name_en: null,
      item_code: "SKU-001",
      sku: null,
      barcode: null,
      category_id: null,
      brand_id: null,
      description: "اختبار الخصوصية",
      unit: "carton",
      image_url: null,
      is_active: true,
      is_featured: false,
      sort_order: 0,
      price_wholesale_of_wholesale: 1000,
      price_wholesale: 1100,
      price_retail: 1234,
      base_price: 99000,
      display_price: 1234,
      cost_price: 600,
      stock_quantity: 20,
      reserved_quantity: 0,
      min_stock_level: 0,
      min_stock: 0,
      status: "active",
      created_at: "2026-01-01T00:00:00Z",
      retail_price: 1234,
      wholesale_price: 1100,
      inventory: {
        id: "inventory-1",
        product_id: "product-1",
        warehouse_id: "warehouse-1",
        quantity_on_hand: 20,
        quantity_reserved: 0,
        quantity_available: 20,
        reorder_point: 0,
      },
    },
  ],
  rpc: vi.fn(),
  pricingResponse: null as null | { data: unknown; error: { message: string } | null },
}));

const initialProducts = [...mocks.products];

vi.mock("@/lib/api", () => ({
  fetchProducts: mocks.fetchProducts,
  fetchCategories: mocks.fetchCategories,
  fetchStorefrontPromotions: mocks.fetchStorefrontPromotions,
  fetchSettingsMap: mocks.fetchSettingsMap,
  fetchStorefrontAnnouncements: mocks.fetchStorefrontAnnouncements,
}));

vi.mock("@/lib/useFetch", () => ({
  useFetch: (fetcher: unknown) => {
    if (fetcher === mocks.fetchProducts) return { data: mocks.products, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchCategories) return mocks.categoryResult ?? { data: [], loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchStorefrontPromotions) return { data: [], loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchSettingsMap) return { data: mocks.settings, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchStorefrontAnnouncements) return { data: [], loading: false, error: null, refetch: vi.fn() };
    // Storefront passes async query wrappers for the current full/paged catalog reads,
    // so the fallback must provide the concrete snapshot shape that the component consumes.
    const currentUser = mocks.user as null | { id?: string; profileId?: string; roles?: string[]; isStaff?: boolean };
    const identityKey = JSON.stringify({
      authReady: true,
      userId: currentUser?.id ?? null,
      profileId: currentUser?.profileId ?? null,
      roles: Array.isArray(currentUser?.roles) ? [...currentUser.roles].sort() : [],
      isStaff: currentUser?.isStaff === true,
    });
    return {
      data: { mode: "full", items: mocks.products, identityKey, publicCacheable: false },
      loading: false,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user, configurationError: null, ready: true }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/lib/customer-company-members", () => ({
  acceptCompanyInvitation: vi.fn(async () => ({ company_name: "شركة الاختبار", member_role: "buyer" })),
  createCompanyInvitation: vi.fn(),
  fetchCompanyMembershipWorkspace: vi.fn(),
  revokeCompanyInvitation: vi.fn(),
  revokeCompanyMember: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc },
  ORG_ID: "test-organization",
  ADMIN_PROFILE_ID: "test-admin-profile",
  WAREHOUSE_ID: "test-warehouse",
}));

vi.mock("@/lib/customer-addresses", () => ({
  fetchCustomerAddresses: vi.fn(async () => []),
}));

import { routeTree } from "@/routeTree.gen";

type Mount = { root: Root; host: HTMLDivElement; active: boolean };
const mounts: Mount[] = [];

function validPricing(surface: "cart" | "orders") {
  return {
    visible: true,
    surface,
    items: [{
      product_id: "product-1",
      name: "Rice",
      item_code: "SKU-001",
      unit: "carton",
      quantity: 2,
      unit_price: 1234,
      line_total: 2468,
    }],
    item_count: 1,
    currency: "YER",
    total_amount: 2468,
    customer_tier_visible: false,
  };
}

function formatServerAmount(amount: number): string {
  return new Intl.NumberFormat("ar-YE", {
    style: "currency",
    currency: "YER",
    maximumFractionDigits: 3,
  }).format(amount);
}

function validCartValidation() {
  return {
    valid: true,
    items: [{
      product_id: "product-1",
      name: "Rice",
      item_code: "SKU-001",
      unit: "carton",
      quantity: 2,
    }],
    item_count: 1,
    currency: "YER",
    pricing_verified: true,
  };
}

function resetSettings(overrides: Record<string, unknown> = {}) {
  mocks.settings = {
    show_price_on_cards: true,
    show_price_in_cart: false,
    show_price_in_orders: false,
    show_customer_tier_in_customer_views: false,
    ...overrides,
  };
}

function seedCustomerCart() {
  window.localStorage.setItem("aghbari:cart:v2:customer:customer-1", JSON.stringify([
    { product_id: "product-1", quantity: 2, unit_price: 777777, line_total: 1555554 },
  ]));
}

function routerAt(path: string) {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: new QueryClient() },
  });
}

async function mountAt(path: string): Promise<Mount> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const mount: Mount = { root, host, active: true };
  mounts.push(mount);
  const router = routerAt(path);
  await router.load();
  await act(async () => {
    root.render(<RouterProvider router={router} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return mount;
}

async function flushEffects() {
  await act(async () => {
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function unmount(mount: Mount) {
  if (!mount.active) return;
  await act(async () => mount.root.unmount());
  mount.active = false;
  mount.host.remove();
}

function clickButton(host: HTMLElement, selector: string, index = 0) {
  const button = host.querySelectorAll<HTMLButtonElement>(selector).item(index);
  if (!button) throw new Error("Could not find expected button: " + selector + " index " + index);
  act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function rejectCustomerPricingRpc(name: string) {
  if (name === "preview_customer_order_pricing") {
    return { data: null, error: { message: "pricing unavailable" } };
  }
  return { data: null, error: null };
}

describe("customer price visibility UI acceptance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.products.splice(0, mocks.products.length, ...initialProducts);
    mocks.user = { isStaff: false, profileId: "customer-1", name: "Buyer" };
    mocks.categoryResult = null;
    resetSettings();
    mocks.pricingResponse = null;
    mocks.rpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") {
        return { data: validPricing("cart"), error: null };
      }
      if (name === "validate_checkout_cart") {
        return { data: validCartValidation(), error: null };
      }
      return { data: null, error: null };
    });
  });

  afterEach(async () => {
    for (const mount of mounts.splice(0)) await unmount(mount);
    mocks.user = null;
    mocks.pricingResponse = null;
    window.localStorage.clear();
  });

  it("announces category loading while the category service has no data yet", async () => {
    mocks.categoryResult = {
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    };

    const mount = await mountAt("/");
    await flushEffects();

    expect(mount.host.querySelector('[role="status"]')?.textContent).toContain("جار تحميل التصنيفات...");
    expect(mount.host.querySelector('[role="alert"]')?.textContent ?? "").not.toContain("تعذر تحميل التصنيفات");
    expect(mount.host.querySelector('button[aria-label="إعادة تحميل التصنيفات"]')).toBeNull();
    expect(mount.host.querySelector<HTMLInputElement>(".sf-search input")?.disabled).not.toBe(true);
  });

  it("shows a source-specific category error, retries it, and keeps text search available", async () => {
    const refetch = vi.fn();
    mocks.categoryResult = {
      data: null,
      loading: false,
      error: "category source unavailable",
      refetch,
    };

    const mount = await mountAt("/");
    await flushEffects();

    const categoryError = mount.host.querySelector('[role="alert"]');
    expect(categoryError?.textContent).toContain("تعذر تحميل التصنيفات: category source unavailable");
    const retry = mount.host.querySelector<HTMLButtonElement>('button[aria-label="إعادة تحميل التصنيفات"]');
    expect(retry).not.toBeNull();
    expect(retry?.disabled).toBe(false);
    expect(mount.host.querySelector<HTMLInputElement>(".sf-search input")?.disabled).not.toBe(true);

    act(() => retry?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each([false, true])("shows product-card and direct product-detail price according to the catalog setting (%s)", async (enabled) => {
    resetSettings({ show_price_on_cards: enabled });
    const mount = await mountAt("/");
    await flushEffects();
    const cardPrice = mount.host.querySelector(".sf-product-price");

    if (enabled) {
      expect(cardPrice).not.toBeNull();
      expect(cardPrice?.textContent).toContain(formatCurrency(1234));
    } else {
      // Hidden prices are removed from the DOM rather than replaced by a fabricated price message.
      expect(cardPrice).toBeNull();
      expect(mount.host.textContent).not.toContain(formatCurrency(1234));
    }

    clickButton(mount.host, "button.sf-product-open");
    await flushEffects();
    const detailPrice = mount.host.querySelector(".sf-detail-price");
    if (enabled) {
      expect(detailPrice).not.toBeNull();
      expect(detailPrice?.textContent).toContain(formatCurrency(1234));
    } else {
      expect(detailPrice).toBeNull();
      expect(mount.host.textContent).not.toContain(formatCurrency(1234));
    }
  });

  it("keeps cart amounts hidden when the setting is off, even if local cart storage contains monetary fields", async () => {
    resetSettings({ show_price_in_cart: false });
    seedCustomerCart();
    const mount = await mountAt("/cart");
    await flushEffects();

    expect(mount.host.textContent).toContain("Rice");
    expect(mount.host.textContent).not.toContain("سعر الوحدة:");
    expect(mount.host.querySelector('.sf-order-pricing-total')).toBeNull();
    expect(mount.host.textContent).not.toContain(formatCurrency(777777));
    expect(mocks.rpc.mock.calls.some(([name]) => name === "preview_customer_order_pricing")).toBe(false);
  });

  it("shows cart amounts only after an enabled setting and a valid server-priced preview", async () => {
    resetSettings({ show_price_in_cart: true });
    mocks.pricingResponse = { data: validPricing("cart"), error: null };
    seedCustomerCart();
    const mount = await mountAt("/cart");
    await flushEffects();

    expect(mount.host.textContent).toContain("سعر الوحدة:");
    expect(mount.host.querySelector('.sf-order-pricing-total')).not.toBeNull();
    expect(mount.host.textContent).toContain(formatServerAmount(1234));
    expect(mount.host.textContent).toContain(formatServerAmount(2468));
  });

  it("does not render financial keys from a server-hidden cart preview", async () => {
    resetSettings({ show_price_in_cart: true });
    mocks.pricingResponse = {
      data: {
        visible: false,
        surface: "cart",
        items: [{ product_id: "product-1", unit_price: 1234, line_total: 2468 }],
        total_amount: 2468,
      },
      error: null,
    };
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") return mocks.pricingResponse;
      return { data: null, error: null };
    });
    seedCustomerCart();
    const mount = await mountAt("/cart");
    await flushEffects();

    expect(mount.host.textContent).not.toContain("سعر الوحدة:");
    expect(mount.host.textContent).not.toContain("إجمالي السلة");
    expect(mount.host.textContent).not.toContain(formatServerAmount(2468));
    expect(mount.host.textContent).toContain("لم يسمح إعداد الخادم بعرض الأسعار على هذه الشاشة؛ لم تُعرض أي مبالغ.");
  });

  it("fails closed when cart pricing RPC errors or returns malformed amounts", async () => {
    resetSettings({ show_price_in_cart: true });
    seedCustomerCart();
    mocks.pricingResponse = { data: { visible: true, items: [{ product_id: "product-1", unit_price: 1234 }], total_amount: 2468 }, error: null };
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") return mocks.pricingResponse;
      return { data: null, error: null };
    });
    const malformed = await mountAt("/cart");
    await flushEffects();
    expect(malformed.host.textContent).not.toContain("سعر الوحدة:");
    expect(malformed.host.textContent).not.toContain("إجمالي السلة");
    expect(malformed.host.textContent).not.toContain(formatServerAmount(2468));
    await unmount(malformed);

    mocks.rpc.mockImplementation(rejectCustomerPricingRpc);
    const failed = await mountAt("/cart");
    await flushEffects();
    expect(failed.host.textContent).not.toContain("سعر الوحدة:");
    expect(failed.host.textContent).not.toContain("إجمالي السلة");
    expect(failed.host.textContent).not.toContain(formatServerAmount(2468));
  });

  it("prevents same-tick duplicate checkout submits until the server acknowledges the first", async () => {
    window.sessionStorage.clear();
    seedCustomerCart();
    let resolveOrder!: (value: { data: unknown; error: null }) => void;
    const pendingOrder = new Promise<{ data: unknown; error: null }>((resolve) => { resolveOrder = resolve; });
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "validate_checkout_cart") return { data: validCartValidation(), error: null };
      if (name === "submit_customer_order") return pendingOrder;
      return { data: null, error: null };
    });

    const mount = await mountAt("/checkout");
    await flushEffects();

    const phone = mount.host.querySelector<HTMLInputElement>('input[placeholder="7XX XXX XXX"]');
    expect(phone).not.toBeNull();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(phone, "777123456");
      phone!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flushEffects();

    const confirm = mount.host.querySelector<HTMLButtonElement>(".sf-checkout-actions .sf-btn-primary");
    expect(confirm).not.toBeNull();
    expect(confirm?.disabled).toBe(false);
    act(() => {
      confirm!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      confirm!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mocks.rpc.mock.calls.filter(([name]) => name === "submit_customer_order")).toHaveLength(1);
    expect(mount.host.textContent).not.toContain("PO-001");
    await act(async () => {
      resolveOrder({ data: { id: "order-1", order_number: "PO-001", status: "pending" }, error: null });
      await pendingOrder;
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mount.host.textContent).toContain("PO-001");
  });

  it("keeps order-review amounts hidden while the order validation remains non-financial", async () => {
    resetSettings({ show_price_in_orders: false });
    seedCustomerCart();
    const mount = await mountAt("/checkout");
    await flushEffects();

    expect(mount.host.textContent).toContain("ملخص الطلب");
    expect(mount.host.textContent).not.toContain("سعر الوحدة:");
    expect(mount.host.querySelector('.sf-order-pricing-total')).toBeNull();
    expect(mount.host.textContent).not.toContain(formatCurrency(777777));
    expect(mount.host.textContent).toContain("الأسعار والإجماليات مخفية في مراجعة الطلب");
    expect(mocks.rpc.mock.calls.some(([name]) => name === "validate_checkout_cart")).toBe(true);
    expect(mocks.rpc.mock.calls.some(([name]) => name === "preview_customer_order_pricing")).toBe(false);
  });

  it("shows order-review amounts only after an enabled setting and a valid server-priced preview", async () => {
    resetSettings({ show_price_in_orders: true });
    mocks.pricingResponse = { data: validPricing("orders"), error: null };
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") return mocks.pricingResponse;
      if (name === "validate_checkout_cart") return { data: validCartValidation(), error: null };
      return { data: null, error: null };
    });
    seedCustomerCart();
    const mount = await mountAt("/checkout");
    await flushEffects();

    expect(mount.host.textContent).toContain("سعر الوحدة:");
    expect(mount.host.querySelector('.sf-order-pricing-total')).not.toBeNull();
    expect(mount.host.textContent).toContain(formatServerAmount(1234));
    expect(mount.host.textContent).toContain(formatServerAmount(2468));
  });

  it("fails closed for hidden, malformed, or errored order-review pricing responses", async () => {
    resetSettings({ show_price_in_orders: true });
    seedCustomerCart();
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") {
        return {
          data: { visible: false, items: [{ product_id: "product-1", unit_price: 1234, line_total: 2468 }], total_amount: 2468 },
          error: null,
        };
      }
      if (name === "validate_checkout_cart") return { data: validCartValidation(), error: null };
      return { data: null, error: null };
    });
    const hidden = await mountAt("/checkout");
    await flushEffects();
    expect(hidden.host.textContent).not.toContain("سعر الوحدة:");
    expect(hidden.host.querySelector('.sf-order-pricing-total')).toBeNull();
    expect(hidden.host.textContent).not.toContain(formatServerAmount(2468));
    await unmount(hidden);

    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") {
        return { data: { visible: true, items: [{ product_id: "product-1", unit_price: 1234 }], total_amount: 2468 }, error: null };
      }
      if (name === "validate_checkout_cart") return { data: validCartValidation(), error: null };
      return { data: null, error: null };
    });
    const malformed = await mountAt("/checkout");
    await flushEffects();
    expect(malformed.host.textContent).not.toContain("سعر الوحدة:");
    expect(malformed.host.querySelector('.sf-order-pricing-total')).toBeNull();
    expect(malformed.host.textContent).not.toContain(formatServerAmount(2468));
    await unmount(malformed);

    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") {
        return { data: null, error: { message: "pricing unavailable" } };
      }
      if (name === "validate_checkout_cart") return { data: validCartValidation(), error: null };
      return { data: null, error: null };
    });
    const failed = await mountAt("/checkout");
    await flushEffects();
    expect(failed.host.textContent).not.toContain("سعر الوحدة:");
    expect(failed.host.querySelector('.sf-order-pricing-total')).toBeNull();
    expect(failed.host.textContent).not.toContain(formatServerAmount(2468));
  });

  describe("public storefront deep-link acceptance", () => {
    it.each([
      { path: "/categories", heading: "تصنيفات المنتجات" },
      { path: "/collections", heading: "تصنيفات المنتجات" },
      { path: "/offers", heading: "العروض المنشورة" },
      { path: "/search/advanced", heading: "البحث المتقدم" },
    ])("mounts the actual route for a direct URL: $path", async ({ path, heading }) => {
      const mount = await mountAt(path);
      await flushEffects();

      expect(mount.host.querySelector("h1")?.textContent).toContain(heading);
      expect(mount.host.textContent).not.toContain("Application error");
      await unmount(mount);
    });

    it.each(["/catalog?q=Rice", "/search?q=Rice"])(
      "preserves direct URL search state on %s",
      async (path) => {
        const mount = await mountAt(path);
        await flushEffects();

        const input = mount.host.querySelector<HTMLInputElement>(".sf-search input");
        expect(input).not.toBeNull();
        expect(input?.value).toBe("Rice");
        expect(mount.host.textContent).toContain("Rice");
        await unmount(mount);
      },
    );
    it("resolves a published category slug through the generated router", async () => {
      const category = {
        id: "a1000000-0000-4000-8000-000000000111",
        name: "أغذية معلبة",
        name_en: null,
        parent_id: null,
        is_active: true,
      };
      const slug = storefrontCategorySlug({ id: category.id, name: category.name, name_en: category.name_en });
      mocks.categoryResult = { data: [category], loading: false, error: null, refetch: vi.fn() };

      const mount = await mountAt(`/category/${slug}`);
      await flushEffects();

      expect(mount.host.querySelector("h1")?.textContent).toContain(category.name);
      expect(mount.host.textContent).not.toContain("التصنيف غير موجود");
      expect(mount.host.textContent).not.toContain("Application error");
      await unmount(mount);
    });

    it("resolves a subcategory slug through the generated router beneath its published parent", async () => {
      const parent = {
        id: "a1000000-0000-4000-8000-000000000222",
        name: "مشروبات",
        name_en: null,
        parent_id: null,
        is_active: true,
      };
      const child = {
        id: "a1000000-0000-4000-8000-000000000333",
        name: "عصائر",
        name_en: null,
        parent_id: parent.id,
        is_active: true,
      };
      const parentSlug = storefrontCategorySlug({ id: parent.id, name: parent.name, name_en: parent.name_en });
      const childSlug = storefrontCategorySlug({ id: child.id, name: child.name, name_en: child.name_en });
      mocks.categoryResult = { data: [parent, child], loading: false, error: null, refetch: vi.fn() };

      const mount = await mountAt(`/category/${parentSlug}/subcategory/${childSlug}`);
      await flushEffects();

      expect(mount.host.querySelector("h1")?.textContent).toContain(child.name);
      expect(mount.host.textContent).toContain(parent.name + " / تصنيف فرعي");
      expect(mount.host.textContent).not.toContain("Application error");
      await unmount(mount);
    });

  });

});
