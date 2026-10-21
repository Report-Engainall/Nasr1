import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatCurrency } from "@/lib/format";

const mocks = vi.hoisted(() => ({
  fetchProducts: vi.fn(),
  fetchCategories: vi.fn(),
  fetchStorefrontPromotions: vi.fn(),
  fetchSettingsMap: vi.fn(),
  fetchStorefrontAnnouncements: vi.fn(),
  settings: {} as Record<string, unknown>,
  user: null as null | { isStaff: boolean; profileId?: string; name?: string },
  products: [
    {
      id: "product-1",
      name: "Rice",
      item_code: "SKU-001",
      barcode: null,
      description: "اختبار الخصوصية",
      unit: "carton",
      base_price: 99000,
      display_price: 1234,
      cost_price: 600,
      min_stock: 0,
      status: "active",
      category_id: null,
      image_url: null,
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
    if (fetcher === mocks.fetchCategories) return { data: [], loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchStorefrontPromotions) return { data: [], loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchSettingsMap) return { data: mocks.settings, loading: false, error: null, refetch: vi.fn() };
    if (fetcher === mocks.fetchStorefrontAnnouncements) return { data: [], loading: false, error: null, refetch: vi.fn() };
    return { data: null, loading: false, error: null, refetch: vi.fn() };
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

describe("customer price visibility UI acceptance", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.products.splice(0, mocks.products.length, ...initialProducts);
    mocks.user = { isStaff: false, profileId: "customer-1", name: "Buyer" };
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

  it.each([false, true])("shows product-card and direct product-detail price according to the catalog setting (%s)", async (enabled) => {
    resetSettings({ show_price_on_cards: enabled });
    const mount = await mountAt("/");
    await flushEffects();
    const cardPrice = mount.host.querySelector(".sf-product-price");
    expect(cardPrice).not.toBeNull();

    if (enabled) {
      expect(cardPrice?.textContent).toContain(formatCurrency(1234));
    } else {
      expect(cardPrice?.textContent).toContain("السعر حسب سياسة حسابك");
      expect(cardPrice?.textContent).not.toContain(formatCurrency(1234));
    }

    clickButton(mount.host, "button.sf-product-open");
    await flushEffects();
    const detailPrice = mount.host.querySelector(".sf-detail-price");
    expect(detailPrice).not.toBeNull();
    if (enabled) {
      expect(detailPrice?.textContent).toContain(formatCurrency(1234));
    } else {
      expect(detailPrice?.textContent).toContain("السعر حسب سياسة حسابك");
      expect(detailPrice?.textContent).not.toContain(formatCurrency(1234));
    }
  });

  it("keeps cart amounts hidden when the setting is off, even if local cart storage contains monetary fields", async () => {
    resetSettings({ show_price_in_cart: false });
    seedCustomerCart();
    const mount = await mountAt("/cart");
    await flushEffects();

    expect(mount.host.textContent).toContain("Rice");
    expect(mount.host.textContent).not.toContain("سعر الوحدة:");
    expect(mount.host.querySelector('[aria-label="إجمالي السلة"]')).toBeNull();
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
    expect(mount.host.querySelector('[aria-label="إجمالي السلة"]')).not.toBeNull();
    expect(mount.host.textContent).toContain(formatCurrency(1234));
    expect(mount.host.textContent).toContain(formatCurrency(2468));
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
    expect(mount.host.textContent).not.toContain(formatCurrency(2468));
    expect(mount.host.textContent).toContain("تبقى المبالغ مخفية");
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
    expect(malformed.host.textContent).not.toContain(formatCurrency(2468));
    await unmount(malformed);

    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") return { data: null, error: { message: "pricing unavailable" } };
      return { data: null, error: null };
    });
    const failed = await mountAt("/cart");
    await flushEffects();
    expect(failed.host.textContent).not.toContain("سعر الوحدة:");
    expect(failed.host.textContent).not.toContain("إجمالي السلة");
    expect(failed.host.textContent).not.toContain(formatCurrency(2468));
  });

  it("keeps order-review amounts hidden while the order validation remains non-financial", async () => {
    resetSettings({ show_price_in_orders: false });
    seedCustomerCart();
    const mount = await mountAt("/checkout");
    await flushEffects();

    expect(mount.host.textContent).toContain("ملخص الطلب");
    expect(mount.host.textContent).not.toContain("سعر الوحدة:");
    expect(mount.host.querySelector('[aria-label="إجمالي مراجعة الطلب"]')).toBeNull();
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
    expect(mount.host.querySelector('[aria-label="إجمالي مراجعة الطلب"]')).not.toBeNull();
    expect(mount.host.textContent).toContain(formatCurrency(1234));
    expect(mount.host.textContent).toContain(formatCurrency(2468));
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
    expect(hidden.host.querySelector('[aria-label="إجمالي مراجعة الطلب"]')).toBeNull();
    expect(hidden.host.textContent).not.toContain(formatCurrency(2468));
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
    expect(malformed.host.querySelector('[aria-label="إجمالي مراجعة الطلب"]')).toBeNull();
    expect(malformed.host.textContent).not.toContain(formatCurrency(2468));
    await unmount(malformed);

    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "preview_customer_order_pricing") return { data: null, error: { message: "pricing unavailable" } };
      if (name === "validate_checkout_cart") return { data: validCartValidation(), error: null };
      return { data: null, error: null };
    });
    const failed = await mountAt("/checkout");
    await flushEffects();
    expect(failed.host.textContent).not.toContain("سعر الوحدة:");
    expect(failed.host.querySelector('[aria-label="إجمالي مراجعة الطلب"]')).toBeNull();
    expect(failed.host.textContent).not.toContain(formatCurrency(2468));
  });
});
