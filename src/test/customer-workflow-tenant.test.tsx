// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";
import { offlineCatalogCacheKeys, offlineCatalogScopeFingerprint } from "@/lib/offline-catalog-cache";

const mocks = vi.hoisted(() => ({
  user: null as null | {
    id: string;
    profileId: string;
    email: string;
    name: string;
    roles: string[];
    isStaff: boolean;
  },
  getCurrentTenantScope: vi.fn(),
  fetchProducts: vi.fn(),
  fetchResolvedProductPrices: vi.fn(),
  fetchSettingsMap: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getSession: vi.fn(),
  signOut: vi.fn(),
  responses: {} as Record<string, unknown[]>,
  queries: [] as Array<{
    table: string;
    columns?: string;
    filters: Array<{ column: string; value: unknown }>;
    orderBy?: string;
    range?: { from: number; to: number };
  }>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    loading: false,
    sessionRevision: 0,
    configurationError: null,
    signOut: mocks.signOut,
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock("@/components/Login", () => ({
  Login: () => <div data-testid="login-required">تسجيل الدخول مطلوب</div>,
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: mocks.getCurrentTenantScope,
  supabase: {
    from: mocks.from,
    rpc: mocks.rpc,
    auth: { getSession: mocks.getSession },
  },
}));

vi.mock("@/lib/api", () => ({
  fetchProducts: mocks.fetchProducts,
  fetchResolvedProductPrices: mocks.fetchResolvedProductPrices,
  fetchSettingsMap: mocks.fetchSettingsMap,
}));


const ORGANIZATION_ID = "a0000000-0000-0000-0000-000000000001";
const PROFILE_ID = "f1111111-1111-4111-8111-111111111111";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function makeQuery(table: string) {
  const record = {
    table,
    columns: undefined as string | undefined,
    filters: [] as Array<{ column: string; value: unknown }>,
    orderBy: undefined as string | undefined,
  };

  const query = {
    select(columns = "*") {
      record.columns = columns;
      return query;
    },
    eq(column: string, value: unknown) {
      record.filters.push({ column, value });
      return query;
    },
    order(column: string) {
      record.orderBy = column;
      return query;
    },
    limit(_limit: number) {
      return query;
    },
    range(from: number, to: number) {
      record.range = { from, to };
      return query;
    },
    maybeSingle() {
      return Promise.resolve({
        data: (mocks.responses[table] ?? [])[0] ?? null,
        error: null,
      });
    },
    then<TResult1 = { data: unknown[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve({
        data: mocks.responses[table] ?? [],
        error: null,
      }).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };
  mocks.queries.push(record);
  return query;
}

function queryFor(table: string) {
  const query = mocks.queries.find((entry) => entry.table === table);
  if (!query) throw new Error("Expected query for table: " + table);
  return query;
}

function createCustomerInvoicePdfPayload(invoiceId: string) {
  return {
    invoice: {
      id: invoiceId,
      invoice_number: "INV-UI-001",
      currency: "YER",
      subtotal: "25.00",
      tax_amount: "0.00",
      total_amount: "25.00",
    },
    lines: [{
      id: "55555555-5555-4555-8555-555555555555",
      item_code: "000125",
      description: "سكر أبيض",
      unit: "كرتون",
      quantity: "2",
      unit_price: "12.50",
      line_total: "25.00",
    }],
    customer: {
      customer_code: "000042",
      business_name: "متجر الاختبار",
      contact_name: null,
    },
    financial_details_visible: true,
    customer_tier_visible: false,
  };
}

describe("customer quote workspace tenant boundary", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  let originalOnlineDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalOnlineDescriptor = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
    window.localStorage.clear();
    vi.clearAllMocks();
    mocks.getSession.mockReset();
    mocks.user = null;
    mocks.queries.splice(0);
    mocks.responses = {
      products: [{
        id: "product-1",
        name: "Rice",
        item_code: "SKU-001",
        barcode: null,
        unit: "carton",
        base_price: 1000,
        status: "active",
      }],
      sales_quotes: [],
    };
    mocks.getCurrentTenantScope.mockResolvedValue({
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      warehouseId: null,
      isStaff: false,
    });
    mocks.fetchProducts.mockResolvedValue([]);
    mocks.fetchResolvedProductPrices.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, 1000])));
    mocks.fetchSettingsMap.mockResolvedValue({ show_price_on_cards: false });
    mocks.from.mockImplementation((table: string) => makeQuery(table));
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(async () => {
    window.localStorage.clear();
    if (originalOnlineDescriptor) {
      Object.defineProperty(window.navigator, "onLine", originalOnlineDescriptor);
    }
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function mountQuoteWorkspace(path = "/quotes") {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [path] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    // The admin route lazy-loads its complete workspace. Resolve that module
    // before asserting role-gated content so the test does not inspect only
    // the synchronous storefront navigation shell.
    if (path === "/admin/quotes") {
      await import("@/components/AghbariApp");
    }
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    return router;
  }

  it("requires an authenticated user before loading customer quote or catalog data", async () => {
    await mountQuoteWorkspace();

    expect(host?.querySelector('[data-testid="login-required"]')).not.toBeNull();
    expect(mocks.getCurrentTenantScope).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("loads the customer catalog only after resolving the organization from the server scope", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };

    await mountQuoteWorkspace();

    expect(host?.textContent).toContain("عروض الأسعار");
    expect(host?.textContent).toContain("Rice");
    expect(host?.textContent).toContain("لم ترسل عروض أسعار بعد.");
    expect(mocks.getCurrentTenantScope).toHaveBeenCalledTimes(1);

    const productQuery = queryFor("products");
    expect(productQuery.columns).toBe("id,name,item_code,barcode,unit,status");
    expect(productQuery.range).toEqual({ from: 0, to: 99 });
    expect(productQuery.columns).not.toMatch(/base_price|cost_price|retail_price|wholesale_price|purchase_cost/i);
    expect(mocks.fetchResolvedProductPrices).toHaveBeenCalledWith(["product-1"]);
    expect(productQuery.filters).toContainEqual({
      column: "organization_id",
      value: ORGANIZATION_ID,
    });
    expect(productQuery.filters).toContainEqual({
      column: "status",
      value: "active",
    });
    expect(queryFor("sales_quotes")).toBeDefined();
  });



  it("resolves customer-tier prices on the reorder route without selecting base_price", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test", name: "CI Customer",
      roles: ["customer"], isStaff: false,
    };
    await mountQuoteWorkspace("/reorder");
    expect(host?.textContent).toContain("قوائم المشتريات والدورات");
    const templatesTab = Array.from(host?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
      .find((tab) => tab.textContent?.includes("قوالب إعادة الطلب السابقة"));
    expect(templatesTab).toBeDefined();
    await act(async () => {
      templatesTab?.click();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain("إعادة الطلب");
    expect(host?.textContent).toContain("Rice");
    expect(mocks.fetchResolvedProductPrices).toHaveBeenCalledWith(["product-1"]);
    const expectedProductColumns = "id,name,item_code,barcode,unit,status,min_order_quantity,order_quantity_multiple";
    const products = mocks.queries.find((entry) => entry.table === "products" && entry.columns === expectedProductColumns);
    expect(products).toBeDefined();
    expect(products.columns).not.toMatch(/base_price|retail_price|wholesale_price|purchase_cost/i);
    expect(products.filters).toContainEqual({ column: "organization_id", value: ORGANIZATION_ID });
    expect(products.filters).toContainEqual({ column: "status", value: "active" });
  });

  it("resolves the barcode result price through the server helper", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test", name: "CI Customer",
      roles: ["customer"], isStaff: false,
    };
    await mountQuoteWorkspace("/barcode");
    const input = host?.querySelector<HTMLInputElement>('input[aria-label="رقم الباركود"]');
    const form = input?.closest("form");
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "SKU-001");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain("Rice");
    expect(mocks.fetchResolvedProductPrices).toHaveBeenCalledWith(["product-1"]);
    const products = queryFor("products");
    expect(products.columns).toBe("id,name,item_code,barcode,sku,unit,min_order_quantity,order_quantity_multiple,status");
    expect(products.columns).not.toMatch(/base_price|retail_price|wholesale_price|purchase_cost/i);
    expect(products.filters).toContainEqual({ column: "organization_id", value: ORGANIZATION_ID });
    expect(products.filters).toContainEqual({ column: "status", value: "active" });
  });

  it("resolves assistant catalog search prices through the server helper", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test", name: "CI Customer",
      roles: ["customer"], isStaff: false,
    };
    await mountQuoteWorkspace("/assistant");
    const input = host?.querySelector<HTMLTextAreaElement>("textarea");
    const form = input?.closest("form");
    expect(input).not.toBeNull();
    expect(form).not.toBeNull();

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(input, "ابحث عن Rice");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain("نتائج من الكتالوج");
    expect(host?.textContent).toContain("Rice");
    expect(mocks.fetchResolvedProductPrices).toHaveBeenCalledWith(["product-1"]);
    const products = queryFor("products");
    expect(products.columns).toBe("id,name,item_code,barcode,unit,status");
    expect(products.columns).not.toMatch(/base_price|retail_price|wholesale_price|purchase_cost/i);
    expect(products.filters).toContainEqual({ column: "organization_id", value: ORGANIZATION_ID });
    expect(products.filters).toContainEqual({ column: "status", value: "active" });
  });

  it("does not render a numeric zero when quote prices are explicitly hidden", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test", name: "CI Customer",
      roles: ["customer"], isStaff: false,
    };
    mocks.fetchResolvedProductPrices.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, null])));
    await mountQuoteWorkspace("/quotes");
    expect(host?.textContent).toContain("السعر الحالي السعر غير متاح");
    expect(host?.textContent).not.toContain("السعر الحالي ٠");
  });

  it("does not render a numeric zero when reorder-template prices are hidden", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test", name: "CI Customer",
      roles: ["customer"], isStaff: false,
    };
    mocks.fetchResolvedProductPrices.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, null])));
    await mountQuoteWorkspace("/reorder");
    expect(host?.textContent).not.toContain("سعر الوحدة");
    expect(host?.textContent).not.toContain("السعر غير متاح");
    expect(host?.textContent).not.toContain("٠٫٠٠");
    expect(host?.textContent).not.toContain("150");
  });

  it("does not render a numeric zero when barcode lookup resolves a hidden price", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test", name: "CI Customer",
      roles: ["customer"], isStaff: false,
    };
    mocks.fetchResolvedProductPrices.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, null])));
    await mountQuoteWorkspace("/barcode");
    const input = host?.querySelector<HTMLInputElement>('input[aria-label="رقم الباركود"]');
    const form = input?.closest("form");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, "SKU-001");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain("السعر غير متاح");
    expect(host?.textContent).not.toContain("٠٫٠٠");
  });

  it("does not render a numeric zero when assistant catalog results hide prices", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test", name: "CI Customer",
      roles: ["customer"], isStaff: false,
    };
    mocks.fetchResolvedProductPrices.mockImplementation(async (ids: string[]) => new Map(ids.map((id) => [id, null])));
    await mountQuoteWorkspace("/assistant");
    const input = host?.querySelector<HTMLTextAreaElement>("textarea");
    const form = input?.closest("form");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(input, "ابحث عن Rice");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      form?.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain("السعر غير متاح");
    expect(host?.textContent).not.toContain("٠٫٠٠");
  });

  it("denies a customer from the admin quotes route before any staff data read", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };

    await mountQuoteWorkspace("/admin/quotes");

    expect(host?.textContent).toContain("لا تملك صلاحية الإدارة");
    expect(mocks.getCurrentTenantScope).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("allows an active staff identity to load the staff quotes workspace", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-staff@example.test",
      name: "CI Staff",
      roles: ["staff"],
      isStaff: true,
    };

    await mountQuoteWorkspace("/admin/quotes");

    expect(host?.textContent).toContain("إدارة عروض الأسعار");
    expect(host?.textContent).toContain("لا توجد طلبات عروض أسعار.");
    expect(queryFor("sales_quotes").columns).toBe(
      "id,quote_number,status,notes,response_note,created_at,quoted_at,valid_until",
    );
    expect(mocks.from).toHaveBeenCalledTimes(1);
  });

  it("sanitizes old and newly synced offline catalogs before persisting them", async () => {
    const unsafeRow = {
      id: "product-offline-1",
      name: "Sugar",
      item_code: "000125",
      barcode: "628123",
      unit: "carton",
      base_price: 1200,
      cost_price: 800,
      retail_price: 1200,
      wholesale_price: 1000,
      purchase_cost: 790,
      min_stock: 50,
      internal_notes: "private staff note",
      inventory: {
        id: "inventory-offline-1",
        product_id: "product-offline-1",
        warehouse_id: "warehouse-1",
        quantity_on_hand: 20,
        quantity_reserved: 4,
        quantity_available: 16,
        reorder_point: 8,
        internal_movement_note: "private stock note",
      },
      category: { id: "category-1", name: "Food", internal_note: "private category note" },
    };
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-staff@example.test",
      name: "CI Staff",
      roles: ["staff"],
      isStaff: true,
    };
    // A previously scoped staff cache is re-sanitized before use; a global legacy
    // cache is retired and is never trusted as belonging to the active tenant.
    const cacheKeys = offlineCatalogCacheKeys(PROFILE_ID)!;
    const serverScope = {
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      warehouseId: null,
      isStaff: false,
    };
    window.localStorage.setItem("aghbari:catalog:v1", JSON.stringify([unsafeRow]));
    window.localStorage.setItem(cacheKeys.catalogKey, JSON.stringify([unsafeRow]));
    window.localStorage.setItem(cacheKeys.scopeKey, offlineCatalogScopeFingerprint(serverScope));
    mocks.fetchProducts.mockResolvedValueOnce([unsafeRow]);

    await mountQuoteWorkspace("/offline");

    expect(window.localStorage.getItem("aghbari:catalog:v1")).toBeNull();
    const legacySafe = JSON.parse(window.localStorage.getItem(cacheKeys.catalogKey) || "[]");
    expect(legacySafe).toHaveLength(1);
    expect(legacySafe[0]).not.toHaveProperty("base_price");
    expect(legacySafe[0]).not.toHaveProperty("display_price");
    expect(legacySafe[0]).not.toHaveProperty("cost_price");
    expect(legacySafe[0]).not.toHaveProperty("retail_price");
    expect(legacySafe[0]).not.toHaveProperty("wholesale_price");
    expect(legacySafe[0]).not.toHaveProperty("purchase_cost");
    expect(legacySafe[0]).not.toHaveProperty("min_stock");
    expect(legacySafe[0]).not.toHaveProperty("internal_notes");
    expect(legacySafe[0].inventory).not.toHaveProperty("quantity_reserved");
    expect(legacySafe[0].inventory).not.toHaveProperty("reorder_point");
    expect(legacySafe[0].inventory).not.toHaveProperty("internal_movement_note");
    expect(legacySafe[0].category).not.toHaveProperty("internal_note");

    const syncButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("تحديث الكتالوج المحلي"),
    );
    expect(syncButton).toBeDefined();
    await act(async () => {
      syncButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const syncedSafe = JSON.parse(window.localStorage.getItem(cacheKeys.catalogKey) || "[]");
    expect(mocks.fetchProducts).toHaveBeenCalledTimes(1);
    expect(syncedSafe).toHaveLength(1);
    expect(syncedSafe[0]).not.toHaveProperty("base_price");
    expect(syncedSafe[0]).not.toHaveProperty("display_price");
    expect(syncedSafe[0]).not.toHaveProperty("cost_price");
    expect(syncedSafe[0]).not.toHaveProperty("retail_price");
    expect(syncedSafe[0]).not.toHaveProperty("wholesale_price");
    expect(syncedSafe[0].inventory).not.toHaveProperty("quantity_reserved");
    expect(syncedSafe[0].inventory).not.toHaveProperty("reorder_point");
  });

  it("browses the scoped offline catalog and adds localized quantities to the profile draft without prices", async () => {
    const sugarId = "f2222222-2222-4222-8222-222222222222";
    const riceId = "f3333333-3333-4333-8333-333333333333";
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    const keys = offlineCatalogCacheKeys(PROFILE_ID)!;
    const serverScope = {
      profileId: PROFILE_ID,
      organizationId: ORGANIZATION_ID,
      warehouseId: null,
      isStaff: false,
    };
    window.localStorage.setItem(keys.scopeKey, offlineCatalogScopeFingerprint(serverScope));
    window.localStorage.setItem(keys.lastServerSyncKey, new Date().toISOString());
    window.localStorage.setItem(keys.catalogKey, JSON.stringify([
      {
        id: sugarId,
        name: "مواد تموينية",
        item_code: "000125",
        barcode: "628000125",
        unit: "كرتون",
        status: "active",
        min_order_quantity: 1,
        order_quantity_multiple: 1,
        base_price: 1200,
        cost_price: 800,
        category: { id: "c1111111-1111-4111-8111-111111111111", name: "السكر" },
      },
      {
        id: riceId,
        name: "أرز بسمتي",
        item_code: "000126",
        unit: "كيس",
        status: "active",
        min_order_quantity: 2,
        order_quantity_multiple: 2,
        retail_price: 900,
        category: { id: "c2222222-2222-4222-8222-222222222222", name: "الأرز" },
      },
    ]));
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });

    await mountQuoteWorkspace("/offline");

    expect(host?.textContent).toContain("الكتالوج المحفوظ");
    expect(host?.textContent).toContain("مواد تموينية");
    expect(host?.textContent).toContain("أرز بسمتي");
    expect(host?.textContent).not.toContain("1200");
    expect(host?.textContent).not.toContain("900");

    const search = host?.querySelector<HTMLInputElement>('[aria-label="البحث في الكتالوج المحفوظ"]');
    expect(search).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(search, "سكر");
      search?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(host?.textContent).toContain("مواد تموينية");
    expect(host?.textContent).not.toContain("أرز بسمتي");

    const quantity = host?.querySelector<HTMLInputElement>('[aria-label="الكمية لمسودة السلة: مواد تموينية"]');
    expect(quantity).not.toBeNull();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      setter?.call(quantity, "٢");
      quantity?.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const addButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("إضافة إلى مسودة السلة"),
    );
    expect(addButton).toBeDefined();
    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const cartKey = "aghbari:cart:v2:customer:" + encodeURIComponent(PROFILE_ID);
    expect(JSON.parse(window.localStorage.getItem(cartKey) || "[]")).toEqual([
      { product_id: sugarId, quantity: 2 },
    ]);
    expect(host?.textContent).toContain("أُضيف مواد تموينية");
    expect(host?.textContent).toContain("لم يُرسل طلب ولم يُعتمد سعر أو مخزون");
    expect(mocks.fetchProducts).not.toHaveBeenCalled();
    expect(mocks.fetchResolvedProductPrices).not.toHaveBeenCalled();
  });

  it("shows invoice prices in the customer preview only from the scoped invoice RPC", async () => {
    const invoiceId = "22222222-2222-4222-8222-222222222222";
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.responses = {
      customer_invoices: [{
        id: invoiceId,
        invoice_number: "INV-UI-001",
        order_id: "33333333-3333-4333-8333-333333333333",
        customer_id: "44444444-4444-4444-8444-444444444444",
        status: "issued",
        issued_at: "2026-10-15T09:00:00.000Z",
        due_at: null,
        currency: "YER",
      }],
      orders: [{
        quantity_review_required: false,
        customer_adjustment_note: null,
        customer_payment_requested_at: null,
        payment_request_status: "none",
        status: "confirmed",
      }],
    };
    mocks.rpc.mockImplementation(async (name: string, args: { p_invoice_id?: string }) => {
      if (name === "get_my_customer_financial_source") {
        return {
          data: {
            source_mode: "APP_ONLY",
            source_status: "active",
            source_as_of: null,
            last_synced_at: null,
            verified_at: null,
            revision: 1,
            is_stale: false,
            can_read_app_ledger: true,
          },
          error: null,
        };
      }
      if (name !== "get_customer_invoice_pdf") return { data: null, error: null };
      expect(args).toEqual({ p_invoice_id: invoiceId });
      return { data: createCustomerInvoicePdfPayload(invoiceId), error: null };
    });

    await mountQuoteWorkspace("/invoices");
    expect(host?.textContent).toContain("فواتيري");
    const openButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("عرض / طباعة"),
    );
    expect(openButton).toBeDefined();

    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_invoice_pdf", { p_invoice_id: invoiceId });
    expect(host?.textContent).toContain("سعر الوحدة");
    expect(host?.textContent).toContain("الإجمالي المستحق");
    expect(host?.textContent).toContain("متجر الاختبار");
    expect(mocks.queries.some((query) => query.table === "customer_invoice_items")).toBe(false);
    expect(mocks.queries.some((query) => query.table === "customers")).toBe(false);
  });


  it("drops invoice details and the list when the source switches to ONYX before invoice-detail commit", async () => {
    const invoiceId = "2a222222-2222-4222-8222-222222222222";
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.responses = {
      customer_invoices: [{
        id: invoiceId,
        invoice_number: "INV-DETAIL-CUTOVER",
        order_id: "2a333333-3333-4333-8333-333333333333",
        customer_id: "2a444444-4444-4444-8444-444444444444",
        status: "issued",
        issued_at: "2026-11-27T00:00:00Z",
        due_at: null,
        currency: "YER",
      }],
      orders: [{
        quantity_review_required: false,
        customer_adjustment_note: null,
        customer_payment_requested_at: null,
        payment_request_status: "none",
        status: "confirmed",
      }],
    };
    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string, args: { p_invoice_id?: string }) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return {
          data: sourceReads <= 2
            ? {
                source_mode: "APP_ONLY", source_status: "active", source_as_of: null,
                last_synced_at: null, verified_at: null, revision: 31,
                is_stale: false, can_read_app_ledger: true,
              }
            : {
                source_mode: "ONYX", source_status: "active", source_as_of: "2026-11-28T00:00:00Z",
                last_synced_at: "2026-11-28T00:00:00Z", verified_at: "2026-11-28T00:00:00Z",
                revision: 32, is_stale: false, can_read_app_ledger: false,
              },
          error: null,
        };
      }
      if (name === "get_customer_invoice_pdf") {
        expect(args).toEqual({ p_invoice_id: invoiceId });
        return { data: createCustomerInvoicePdfPayload(invoiceId), error: null };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/invoices");
    expect(sourceReads).toBe(2);
    const openButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("عرض / طباعة"),
    );
    expect(openButton).toBeDefined();
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_invoice_pdf", { p_invoice_id: invoiceId });
    expect(sourceReads).toBe(3);
    expect(host?.textContent).toContain("تغير مصدر الحساب المالي أثناء تحميل تفاصيل الفاتورة");
    expect(host?.textContent).not.toContain("INV-DETAIL-CUTOVER");
    expect(host?.textContent).not.toContain("سعر الوحدة");
    expect(host?.textContent).not.toContain("25.00");
  });

  it("fails closed on invoice details when the source resolver fails after the detail read", async () => {
    const invoiceId = "2b222222-2222-4222-8222-222222222222";
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.responses = {
      customer_invoices: [{
        id: invoiceId,
        invoice_number: "INV-DETAIL-UNVERIFIED",
        order_id: "2b333333-3333-4333-8333-333333333333",
        customer_id: "2b444444-4444-4444-8444-444444444444",
        status: "issued",
        issued_at: "2026-11-27T00:00:00Z",
        due_at: null,
        currency: "YER",
      }],
      orders: [{
        quantity_review_required: false,
        customer_adjustment_note: null,
        customer_payment_requested_at: null,
        payment_request_status: "none",
        status: "confirmed",
      }],
    };
    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string, args: { p_invoice_id?: string }) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        if (sourceReads > 2) return { data: null, error: { message: "source unavailable" } };
        return {
          data: {
            source_mode: "APP_ONLY", source_status: "active", source_as_of: null,
            last_synced_at: null, verified_at: null, revision: 41,
            is_stale: false, can_read_app_ledger: true,
          },
          error: null,
        };
      }
      if (name === "get_customer_invoice_pdf") {
        expect(args).toEqual({ p_invoice_id: invoiceId });
        return { data: createCustomerInvoicePdfPayload(invoiceId), error: null };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/invoices");
    expect(sourceReads).toBe(2);
    const openButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("عرض / طباعة"),
    );
    expect(openButton).toBeDefined();
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_invoice_pdf", { p_invoice_id: invoiceId });
    expect(sourceReads).toBe(3);
    expect(host?.textContent).toContain("تعذر التحقق من مصدر الحساب بعد تحميل تفاصيل الفاتورة");
    expect(host?.textContent).not.toContain("INV-DETAIL-UNVERIFIED");
    expect(host?.textContent).not.toContain("سعر الوحدة");
    expect(host?.textContent).not.toContain("25.00");
  });

  it("cancels a stale invoice PDF preflight when a newer invoice is opened", async () => {
    const invoiceAId = "5c222222-2222-4222-8222-222222222222";
    const invoiceBId = "5c333333-3333-4333-8333-333333333333";
    const orderId = "5c444444-4444-4444-8444-444444444444";
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test",
      name: "CI Customer", roles: ["customer"], isStaff: false,
    };
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: "test-access-token" } },
      error: null,
    });
    mocks.responses = {
      customer_invoices: [
        {
          id: invoiceAId, invoice_number: "INV-CONCURRENT-A", order_id: orderId,
          customer_id: "5c555555-5555-4555-8555-555555555555",
          status: "issued", issued_at: "2026-11-28T00:00:00Z", due_at: null, currency: "YER",
        },
        {
          id: invoiceBId, invoice_number: "INV-CONCURRENT-B", order_id: orderId,
          customer_id: "5c555555-5555-4555-8555-555555555555",
          status: "issued", issued_at: "2026-11-27T00:00:00Z", due_at: null, currency: "YER",
        },
      ],
      orders: [{
        quantity_review_required: false, customer_adjustment_note: null,
        customer_payment_requested_at: null, payment_request_status: "none",
        status: "confirmed",
      }],
    };

    let sourceReads = 0;
    let releaseDeferredSource: ((result: { data: unknown; error: null }) => void) | undefined;
    mocks.rpc.mockImplementation(async (name: string, args: { p_invoice_id?: string }) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        if (sourceReads === 4) {
          return await new Promise<{ data: unknown; error: null }>((resolve) => {
            releaseDeferredSource = resolve;
          });
        }
        return {
          data: {
            source_mode: "APP_ONLY", source_status: "active", source_as_of: null,
            last_synced_at: null, verified_at: null, revision: 71,
            is_stale: false, can_read_app_ledger: true,
          },
          error: null,
        };
      }
      if (name === "get_customer_invoice_pdf") {
        expect([invoiceAId, invoiceBId]).toContain(args.p_invoice_id);
        return { data: createCustomerInvoicePdfPayload(args.p_invoice_id ?? ""), error: null };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/invoices");
    expect(sourceReads).toBe(2);
    const openRowInvoice = async (invoiceNumber: string) => {
      const button = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((candidate) => candidate.textContent?.includes("عرض / طباعة") &&
          candidate.closest("tr")?.textContent?.includes(invoiceNumber));
      expect(button).toBeDefined();
      await act(async () => {
        button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };

    await openRowInvoice("INV-CONCURRENT-A");
    expect(sourceReads).toBe(3);
    expect(host?.querySelector('[aria-label="تفاصيل الفاتورة"]')?.textContent).toContain("INV-CONCURRENT-A");

    const pdfButton = Array.from(host?.querySelectorAll<HTMLButtonElement>('[aria-label="تفاصيل الفاتورة"] button') ?? [])
      .find((button) => button.textContent?.includes("تنزيل PDF عربي"));
    expect(pdfButton).toBeDefined();
    await act(async () => {
      pdfButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sourceReads).toBe(4);
    expect(releaseDeferredSource).toBeDefined();
    expect(mocks.getSession).not.toHaveBeenCalled();

    const closeButton = Array.from(host?.querySelectorAll<HTMLButtonElement>('[aria-label="تفاصيل الفاتورة"] button') ?? [])
      .find((button) => button.textContent?.includes("إغلاق"));
    expect(closeButton).toBeDefined();
    await act(async () => {
      closeButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(host?.querySelector('[aria-label="تفاصيل الفاتورة"]')).toBeNull();

    await openRowInvoice("INV-CONCURRENT-B");
    expect(sourceReads).toBe(5);
    expect(host?.querySelector('[aria-label="تفاصيل الفاتورة"]')?.textContent).toContain("INV-CONCURRENT-B");

    await act(async () => {
      releaseDeferredSource?.({
        data: {
          source_mode: "APP_ONLY", source_status: "active", source_as_of: null,
          last_synced_at: null, verified_at: null, revision: 71,
          is_stale: false, can_read_app_ledger: true,
        },
        error: null,
      });
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(host?.querySelector('[aria-label="تفاصيل الفاتورة"]')?.textContent).toContain("INV-CONCURRENT-B");
    expect(host?.querySelector('[aria-label="تفاصيل الفاتورة"]')?.textContent).not.toContain("INV-CONCURRENT-A");
  });

  it.each(["تنزيل PDF عربي", "تنزيل Excel"])(
    "clears customer invoice rows and details when the source changes before %s",
    async (exportLabel) => {
    const invoiceId = "5b222222-2222-4222-8222-222222222222";
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test",
      name: "CI Customer", roles: ["customer"], isStaff: false,
    };
    mocks.responses = {
      customer_invoices: [{
        id: invoiceId, invoice_number: "INV-PDF-OUTPUT-CUTOVER",
        order_id: "5b333333-3333-4333-8333-333333333333",
        customer_id: "5b444444-4444-4444-8444-444444444444",
        status: "issued", issued_at: "2026-11-27T00:00:00Z",
        due_at: null, currency: "YER",
      }],
      orders: [{
        quantity_review_required: false, customer_adjustment_note: null,
        customer_payment_requested_at: null, payment_request_status: "none",
        status: "confirmed",
      }],
    };
    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string, args: { p_invoice_id?: string }) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return {
          data: sourceReads <= 3
            ? { source_mode: "APP_ONLY", source_status: "active", source_as_of: null, last_synced_at: null, verified_at: null, revision: 61, is_stale: false, can_read_app_ledger: true }
            : { source_mode: "ONYX", source_status: "active", source_as_of: "2026-11-28T00:00:00Z", last_synced_at: "2026-11-28T00:00:00Z", verified_at: "2026-11-28T00:00:00Z", revision: 62, is_stale: false, can_read_app_ledger: false },
          error: null,
        };
      }
      if (name === "get_customer_invoice_pdf") {
        expect(args).toEqual({ p_invoice_id: invoiceId });
        return { data: createCustomerInvoicePdfPayload(invoiceId), error: null };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/invoices");
    expect(sourceReads).toBe(2);
    const openButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("عرض / طباعة"));
    expect(openButton).toBeDefined();
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sourceReads).toBe(3);
    expect(host?.textContent).toContain("INV-PDF-OUTPUT-CUTOVER");
    expect(host?.textContent).toContain("25.00");

    const exportButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes(exportLabel));
    expect(exportButton).toBeDefined();
    expect(exportButton?.disabled).toBe(false);
    await act(async () => {
      exportButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(sourceReads).toBe(4);
    expect(host?.textContent).toContain(
      exportLabel === "تنزيل PDF عربي"
        ? "تغير مصدر الحساب المالي؛ أوقفنا تنزيل الفاتورة من الدفتر السابق."
        : "تغير مصدر الحساب؛ أوقفنا تصدير تفاصيل الفاتورة القديمة.",
    );
    expect(host?.textContent).not.toContain("INV-PDF-OUTPUT-CUTOVER");
    expect(host?.textContent).not.toContain("25.00");
    expect(host?.querySelector('[aria-label="تفاصيل الفاتورة"]')).toBeNull();
    },
  );

  it("omits invoice price columns and totals when the server hides invoice financial details", async () => {
    const invoiceId = "66666666-6666-4666-8666-666666666666";
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.responses = {
      customer_invoices: [{
        id: invoiceId,
        invoice_number: "INV-HIDDEN-001",
        order_id: "77777777-7777-4777-8777-777777777777",
        customer_id: "44444444-4444-4444-8444-444444444444",
        status: "issued",
        issued_at: "2026-10-15T09:00:00.000Z",
        due_at: null,
        currency: "YER",
      }],
      orders: [{
        quantity_review_required: false,
        customer_adjustment_note: null,
        customer_payment_requested_at: null,
        payment_request_status: "none",
        status: "confirmed",
      }],
    };
    mocks.rpc.mockImplementation(async (name: string, args: { p_invoice_id?: string }) => {
      if (name === "get_my_customer_financial_source") {
        return {
          data: {
            source_mode: "APP_ONLY",
            source_status: "active",
            source_as_of: null,
            last_synced_at: null,
            verified_at: null,
            revision: 1,
            is_stale: false,
            can_read_app_ledger: true,
          },
          error: null,
        };
      }
      if (name !== "get_customer_invoice_pdf") return { data: null, error: null };
      expect(args).toEqual({ p_invoice_id: invoiceId });
      return {
        data: {
          invoice: {
            id: invoiceId,
            invoice_number: "INV-HIDDEN-001",
            currency: "YER",
          },
          lines: [{
            id: "88888888-8888-4888-8888-888888888888",
            item_code: "000126",
            description: "صنف مخفي السعر",
            unit: "كرتون",
            quantity: "2",
          }],
          customer: {
            customer_code: "000043",
            business_name: "عميل مخفي الأسعار",
            contact_name: null,
          },
          financial_details_visible: false,
          customer_tier_visible: false,
        },
        error: null,
      };
    });

    await mountQuoteWorkspace("/invoices");
    const openButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("عرض / طباعة"),
    );
    expect(openButton).toBeDefined();
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.querySelector("[data-testid='invoice-prices-hidden']")?.textContent).toContain("مخفية");
    const headers = Array.from(host?.querySelectorAll('[role="dialog"] th') ?? []).map((node) => node.textContent?.trim());
    expect(headers).not.toContain("سعر الوحدة");
    expect(headers).not.toContain("الإجمالي");
    expect(headers).not.toContain("الإجمالي المستحق");
    expect(host?.textContent).not.toContain("12.50");
    expect(host?.textContent).not.toContain("25.00");
    expect(host?.textContent).toContain("صنف مخفي السعر");
    expect(mocks.queries.some((query) => query.table === "customer_invoice_items")).toBe(false);
  });

  it("shows the server-authorized customer tier on invoices independently of hidden monetary amounts", async () => {
    const invoiceId = "77777777-7777-4777-8777-777777777777";
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.responses = {
      customer_invoices: [{
        id: invoiceId,
        invoice_number: "INV-TIER-001",
        order_id: "88888888-8888-4888-8888-888888888888",
        customer_id: "44444444-4444-4444-8444-444444444444",
        status: "issued",
        issued_at: "2026-10-15T09:00:00.000Z",
        due_at: null,
        currency: "YER",
      }],
      orders: [{
        quantity_review_required: false,
        customer_adjustment_note: null,
        customer_payment_requested_at: null,
        payment_request_status: "none",
        status: "confirmed",
      }],
    };
    mocks.rpc.mockImplementation(async (name: string, args: { p_invoice_id?: string }) => {
      if (name === "get_my_customer_financial_source") {
        return {
          data: {
            source_mode: "APP_ONLY",
            source_status: "active",
            source_as_of: null,
            last_synced_at: null,
            verified_at: null,
            revision: 1,
            is_stale: false,
            can_read_app_ledger: true,
          },
          error: null,
        };
      }
      if (name !== "get_customer_invoice_pdf") return { data: null, error: null };
      expect(args).toEqual({ p_invoice_id: invoiceId });
      return {
        data: {
          invoice: {
            id: invoiceId,
            invoice_number: "INV-TIER-001",
            currency: "YER",
          },
          lines: [{
            id: "99999999-9999-4999-8999-999999999999",
            item_code: "000127",
            description: "صنف دون أسعار",
            unit: "كرتون",
            quantity: "2",
          }],
          customer: {
            customer_code: "000044",
            business_name: "متجر فئة العميل",
            contact_name: null,
            tier_label: "الجملة",
          },
          financial_details_visible: false,
          customer_tier_visible: true,
        },
        error: null,
      };
    });

    await mountQuoteWorkspace("/invoices");
    const openButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("عرض / طباعة"),
    );
    expect(openButton).toBeDefined();
    await act(async () => {
      openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).toContain("فئة العميل");
    expect(host?.textContent).toContain("الجملة");
    expect(host?.textContent).toContain("الأسعار والإجماليات مخفية");
    expect(host?.textContent).not.toContain("سعر الوحدة");
    expect(host?.textContent).not.toContain("الإجمالي المستحق");
    expect(host?.textContent).not.toContain("25.00");
  });

  it("does not advertise more customer invoices when no 101st row is returned", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.responses = {
      customer_invoices: Array.from({ length: 100 }, (_, index) => ({
        id: `invoice-${index + 1}`,
        invoice_number: `INV-${String(index + 1).padStart(3, "0")}`,
        order_id: `order-${index + 1}`,
        customer_id: "44444444-4444-4444-8444-444444444444",
        status: "issued",
        issued_at: "2026-10-15T09:00:00.000Z",
        due_at: null,
        currency: "YER",
      })),
    };

    await mountQuoteWorkspace("/invoices");

    expect(host?.textContent).toContain("فواتيري");
    expect(host?.textContent).not.toContain("عرض فواتير أقدم");
    expect(host?.textContent).not.toContain("أحدث 100 فاتورة فقط");
  });

  it("fails closed when the authenticated server scope cannot be resolved", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.getCurrentTenantScope.mockRejectedValueOnce(
      new Error("تعذر تحميل نطاق المؤسسة من الخادم."),
    );

    await mountQuoteWorkspace();

    expect(host?.textContent).toContain("تعذر تحميل نطاق المؤسسة من الخادم.");
    expect(mocks.from).not.toHaveBeenCalled();
  });


  it("discards a statement projection when the financial source revision changes during the read", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return {
          data: sourceReads === 1
            ? { source_mode: "APP_ONLY", source_status: "active", source_as_of: null, last_synced_at: null, verified_at: null, revision: 7, is_stale: false, can_read_app_ledger: true }
            : { source_mode: "ONYX", source_status: "active", source_as_of: "2026-11-28T00:00:00Z", last_synced_at: "2026-11-28T00:00:00Z", verified_at: "2026-11-28T00:00:00Z", revision: 8, is_stale: false, can_read_app_ledger: false },
          error: null,
        };
      }
      if (name === "get_customer_account_statement") {
        return {
          data: {
            invoices: [{ id: "11111111-1111-4111-8111-111111111111", invoice_number: "INV-CUTOVER-STALE", order_id: "22222222-2222-4222-8222-222222222222", customer_id: "33333333-3333-4333-8333-333333333333", status: "issued", issued_at: "2026-11-27T00:00:00Z", due_at: null, currency: "YER" }],
            payments: [],
            credits: [],
            summary: null,
            summary_as_of_utc: "2026-11-28T00:00:00Z",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/statement");

    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_account_statement");
    expect(sourceReads).toBe(2);
    expect(host?.textContent).toContain("تغير مصدر الحساب المالي أثناء إعداد كشف الحساب");
    expect(host?.textContent).not.toContain("INV-CUTOVER-STALE");
    expect(host?.querySelector('[aria-label="تنزيل Excel"]')).toBeNull();
  });

  it("clears the APP_ONLY statement projection when the source changes before PDF download", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test",
      name: "CI Customer", roles: ["customer"], isStaff: false,
    };
    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return {
          data: sourceReads <= 2
            ? { source_mode: "APP_ONLY", source_status: "active", source_as_of: null, last_synced_at: null, verified_at: null, revision: 51, is_stale: false, can_read_app_ledger: true }
            : { source_mode: "ONYX", source_status: "active", source_as_of: "2026-11-28T00:00:00Z", last_synced_at: "2026-11-28T00:00:00Z", verified_at: "2026-11-28T00:00:00Z", revision: 52, is_stale: false, can_read_app_ledger: false },
          error: null,
        };
      }
      if (name === "get_customer_account_statement") {
        return {
          data: {
            source_mode: "APP_ONLY",
            invoices: [{
              id: "51111111-1111-4111-8111-111111111111",
              invoice_number: "INV-PDF-CUTOVER-STALE",
              order_id: "52222222-2222-4222-8222-222222222222",
              customer_id: "53333333-3333-4333-8333-333333333333",
              status: "issued", issued_at: "2026-11-27T00:00:00Z",
              due_at: null, currency: "YER",
            }],
            payments: [], credits: [], summary: null,
            summary_as_of_utc: "2026-11-28T00:00:00Z",
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/statement");
    expect(sourceReads).toBe(2);
    expect(host?.textContent).toContain("INV-PDF-CUTOVER-STALE");
    const pdfButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
      .find((button) => button.textContent?.includes("تنزيل PDF عربي"));
    expect(pdfButton).toBeDefined();

    await act(async () => {
      pdfButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(sourceReads).toBe(3);
    expect(host?.textContent).toContain("تغير مصدر الحساب المالي؛ أوقفنا إنشاء كشف من الدفتر السابق.");
    expect(host?.textContent).not.toContain("INV-PDF-CUTOVER-STALE");
    expect(
      Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .some((button) => button.textContent?.includes("تنزيل PDF عربي")),
    ).toBe(false);
  });

  it("renders and prints a source-routed ONYX statement as separate customer currency ledgers", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test",
      name: "CI Customer", roles: ["customer"], isStaff: false,
    };
    const sourceAsOf = new Date(Date.now() - 2 * 60_000).toISOString();
    const currencyAsOf = new Date(Date.now() - 60_000).toISOString();
    const externalSource = {
      source_mode: "ONYX", source_status: "active", source_as_of: sourceAsOf,
      last_synced_at: sourceAsOf, verified_at: sourceAsOf, revision: 77,
      is_stale: false, can_read_app_ledger: false,
    };
    const externalStatement = {
      source_mode: "ONYX", source_as_of: sourceAsOf, details_limit_per_currency: 500,
      currencies: [
        {
          currency_code: "YER", source_as_of: currencyAsOf, entry_count: 2,
          total_debit: "1500.0000", total_credit: "500.0000", closing_balance: "1000.0000",
          details_partial: false,
          // The parser requires newest-first details and microsecond-exact running balances.
          entries: [
            {
              entry_reference: "ONYX-RC-001", entry_date: "2026-11-28", due_date: null,
              entry_type: "payment", debit_amount: "0", credit_amount: "500.0000",
              running_balance: "1000.0000", source_document_number: "ONYX-RC-001",
              description: "سداد جزئي",
            },
            {
              entry_reference: "ONYX-JV-001", entry_date: "2026-11-27", due_date: null,
              entry_type: "invoice", debit_amount: "1500.0000", credit_amount: "0",
              running_balance: "1500.0000", source_document_number: "ONYX-INV-001",
              description: "فاتورة من المصدر الخارجي",
            },
          ],
        },
        {
          currency_code: "USD", source_as_of: currencyAsOf, entry_count: 1,
          total_debit: "25.0000", total_credit: "0", closing_balance: "25.0000",
          details_partial: false,
          entries: [{
            entry_reference: "ONYX-JV-USD-001", entry_date: "2026-11-27", due_date: null,
            entry_type: "opening_balance", debit_amount: "25.0000", credit_amount: "0",
            running_balance: "25.0000", source_document_number: null,
            description: "رصيد افتتاحي بالدولار",
          }],
        },
      ],
    };
    let sourceReads = 0;
    let statementReads = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return { data: externalSource, error: null };
      }
      if (name === "get_customer_account_statement") {
        statementReads += 1;
        return {
          data: {
            source_mode: "ONYX", invoices: [], payments: [], credits: [],
            summary: null, summary_as_of_utc: sourceAsOf,
            external_statement: externalStatement,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const printSpy = vi.fn();
    const originalPrintDescriptor = Object.getOwnPropertyDescriptor(window, "print");
    Object.defineProperty(window, "print", { configurable: true, value: printSpy });
    try {
      await mountQuoteWorkspace("/statement");
      expect(sourceReads).toBe(2);
      expect(statementReads).toBe(1);
      expect(host?.textContent).toContain("كشف الحساب الخارجي");
      expect(host?.textContent).toContain("Onyx Pro");
      expect(host?.textContent).toContain("كشف YER");
      expect(host?.textContent).toContain("كشف USD");
      expect(host?.textContent).toContain("ONYX-JV-001");
      expect(host?.textContent).toContain("ONYX-JV-USD-001");
      expect(host?.textContent).not.toContain("INV-APP-ONLY");
      expect(host?.textContent).not.toContain("دفتر متجر الأغبري الكامل");

      const buttons = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const pdfButton = buttons.find((button) => button.textContent?.includes("تنزيل PDF عربي"));
      const excelButton = buttons.find((button) => button.textContent?.includes("تنزيل Excel"));
      const printButton = buttons.find((button) => button.textContent?.includes("طباعة من المتصفح"));
      expect(pdfButton).toBeUndefined();
      expect(excelButton).toBeDefined();
      expect(excelButton?.disabled).toBe(false);
      expect(printButton).toBeDefined();

      await act(async () => {
        printButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(sourceReads).toBe(3);
      expect(printSpy).toHaveBeenCalledTimes(1);
    } finally {
      if (originalPrintDescriptor) Object.defineProperty(window, "print", originalPrintDescriptor);
      else Reflect.deleteProperty(window, "print");
    }
  });

  it("discards a payment history projection when its source revision changes before commit", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return {
          data: sourceReads === 1
            ? { source_mode: "APP_ONLY", source_status: "active", source_as_of: null, last_synced_at: null, verified_at: null, revision: 11, is_stale: false, can_read_app_ledger: true }
            : { source_mode: "MUTAKAMEL", source_status: "active", source_as_of: "2026-11-28T00:00:00Z", last_synced_at: "2026-11-28T00:00:00Z", verified_at: "2026-11-28T00:00:00Z", revision: 12, is_stale: false, can_read_app_ledger: false },
          error: null,
        };
      }
      if (name === "get_customer_account_statement") {
        return {
          data: {
            invoices: [{ id: "44444444-4444-4444-8444-444444444444", invoice_number: "INV-PAYMENT-CUTOVER", currency: "YER" }],
            payments: [{ id: "55555555-5555-4555-8555-555555555555", invoice_id: "44444444-4444-4444-8444-444444444444", amount: "75.00", paid_at: "2026-11-27T10:00:00Z" }],
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/payments");

    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_account_statement");
    expect(sourceReads).toBe(2);
    expect(host?.textContent).toContain("تغير مصدر الحساب المالي أثناء تحميل سجل الدفعات");
    expect(host?.textContent).not.toContain("INV-PAYMENT-CUTOVER");
    expect(host?.querySelector('[aria-label="ترقيم سندات قبض العميل"]')).toBeNull();
  });


  it("discards the customer invoice list when its financial source changes during the query", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.responses.customer_invoices = [{
      id: "66666666-6666-4666-8666-666666666666",
      invoice_number: "INV-INVOICE-CUTOVER",
      order_id: "77777777-7777-4777-8777-777777777777",
      customer_id: "88888888-8888-4888-8888-888888888888",
      status: "issued",
      issued_at: "2026-11-27T00:00:00Z",
      due_at: null,
      currency: "YER",
    }];
    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return {
          data: sourceReads === 1
            ? { source_mode: "APP_ONLY", source_status: "active", source_as_of: null, last_synced_at: null, verified_at: null, revision: 21, is_stale: false, can_read_app_ledger: true }
            : { source_mode: "ONYX", source_status: "active", source_as_of: "2026-11-28T00:00:00Z", last_synced_at: "2026-11-28T00:00:00Z", verified_at: "2026-11-28T00:00:00Z", revision: 22, is_stale: false, can_read_app_ledger: false },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/invoices");

    expect(sourceReads).toBe(2);
    expect(host?.textContent).toContain("تغير مصدر الحساب المالي أثناء تحميل الفواتير");
    expect(host?.textContent).not.toContain("INV-INVOICE-CUTOVER");
  });

  it("keeps barcode scanning open for multiple products and merges repeat scans by each product's order multiple", async () => {
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };

    const firstProductId = "f4444444-4444-4444-8444-444444444444";
    const secondProductId = "f5555555-5555-4555-8555-555555555555";
    const firstProduct = {
      id: firstProductId,
      name: "سكر أبيض",
      item_code: "000125",
      barcode: "628000125",
      sku: "SUGAR-125",
      unit: "كرتون",
      min_order_quantity: 2,
      order_quantity_multiple: 2,
      status: "active",
    };
    const secondProduct = {
      id: secondProductId,
      name: "أرز بسمتي",
      item_code: "RICE-126",
      barcode: "628000126",
      sku: "RICE-126",
      unit: "كيس",
      min_order_quantity: 1,
      order_quantity_multiple: 1,
      status: "active",
    };
    mocks.responses.products = [firstProduct];

    const router = await mountQuoteWorkspace("/barcode");
    const barcodeInput = host?.querySelector<HTMLInputElement>('[aria-label="رقم الباركود"]');
    expect(barcodeInput).not.toBeNull();

    const searchBarcode = async (barcode: string) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        setter?.call(barcodeInput, barcode);
        barcodeInput?.dispatchEvent(new Event("input", { bubbles: true }));
      });
      const searchButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
        button.textContent?.includes("بحث"),
      );
      expect(searchButton).toBeDefined();
      await act(async () => {
        searchButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    };

    const addScannedProduct = async (name: string) => {
      expect(host?.textContent).toContain(name);
      const addButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
        button.textContent?.includes("أضف إلى السلة"),
      );
      expect(addButton).toBeDefined();
      await act(async () => {
        addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(router.state.location.pathname).toBe("/barcode");
      expect(host?.textContent).toContain("مسح صنف آخر");
    };

    await searchBarcode("٦٢٨٠٠٠١٢٥");
    await addScannedProduct("سكر أبيض");

    const cartKey = "aghbari:cart:v2:customer:" + encodeURIComponent(PROFILE_ID);
    expect(JSON.parse(window.localStorage.getItem(cartKey) || "[]")).toEqual([
      { product_id: firstProductId, quantity: 2 },
    ]);

    mocks.responses.products = [secondProduct];
    await searchBarcode("٦٢٨٠٠٠١٢٦");
    await addScannedProduct("أرز بسمتي");
    expect(JSON.parse(window.localStorage.getItem(cartKey) || "[]")).toEqual([
      { product_id: firstProductId, quantity: 2 },
      { product_id: secondProductId, quantity: 1 },
    ]);

    // Re-scanning the first product adds its own server-defined multiple; units are never aggregated.
    mocks.responses.products = [firstProduct];
    await searchBarcode("٦٢٨٠٠٠١٢٥");
    await addScannedProduct("سكر أبيض");
    expect(JSON.parse(window.localStorage.getItem(cartKey) || "[]")).toEqual([
      { product_id: firstProductId, quantity: 4 },
      { product_id: secondProductId, quantity: 1 },
    ]);
    expect(host?.textContent).toMatch(/[2٢] أصناف/);
    expect(host?.textContent).not.toContain("إجمالي 5 وحدة");

    const openCartButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("فتح سلة المشتريات"),
    );
    expect(openCartButton).toBeDefined();
    await act(async () => {
      openCartButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(router.state.location.pathname).toBe("/cart");
  });


  it("blocks invoice browser printing when the server source changes immediately before print", async () => {
    const invoiceId = "2c222222-2222-4222-8222-222222222222";
    mocks.user = {
      id: USER_ID,
      profileId: PROFILE_ID,
      email: "ci-customer@example.test",
      name: "CI Customer",
      roles: ["customer"],
      isStaff: false,
    };
    mocks.responses = {
      customer_invoices: [{
        id: invoiceId,
        invoice_number: "INV-PRINT-CUTOVER",
        order_id: "2c333333-3333-4333-8333-333333333333",
        customer_id: "2c444444-4444-4444-8444-444444444444",
        status: "issued",
        issued_at: "2026-11-27T00:00:00Z",
        due_at: null,
        currency: "YER",
      }],
      orders: [{
        quantity_review_required: false,
        customer_adjustment_note: null,
        customer_payment_requested_at: null,
        payment_request_status: "none",
        status: "confirmed",
      }],
    };

    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string, args: { p_invoice_id?: string }) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return {
          data: sourceReads <= 3
            ? {
                source_mode: "APP_ONLY", source_status: "active", source_as_of: null,
                last_synced_at: null, verified_at: null, revision: 51,
                is_stale: false, can_read_app_ledger: true,
              }
            : {
                source_mode: "ONYX", source_status: "active", source_as_of: "2026-11-28T00:00:00Z",
                last_synced_at: "2026-11-28T00:00:00Z", verified_at: "2026-11-28T00:00:00Z",
                revision: 52, is_stale: false, can_read_app_ledger: false,
              },
          error: null,
        };
      }
      if (name === "get_customer_invoice_pdf") {
        expect(args).toEqual({ p_invoice_id: invoiceId });
        return { data: createCustomerInvoicePdfPayload(invoiceId), error: null };
      }
      return { data: null, error: null };
    });

    const printSpy = vi.fn();
    const originalPrintDescriptor = Object.getOwnPropertyDescriptor(window, "print");
    Object.defineProperty(window, "print", { configurable: true, value: printSpy });

    try {
      await mountQuoteWorkspace("/invoices");
      const openButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
        button.textContent?.includes("عرض / طباعة"),
      );
      expect(openButton).toBeDefined();
      await act(async () => {
        openButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(sourceReads).toBe(3);

      const browserPrintButton = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
        button.textContent?.includes("طباعة من المتصفح"),
      );
      expect(browserPrintButton).toBeDefined();
      await act(async () => {
        browserPrintButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(sourceReads).toBe(4);
      expect(printSpy).not.toHaveBeenCalled();
      expect(host?.textContent).toContain("تغير مصدر الحساب المالي؛ لم تتم طباعة الفاتورة القديمة.");
      expect(host?.textContent).not.toContain("INV-PRINT-CUTOVER");
      expect(host?.textContent).not.toContain("25.00");
    } finally {
      if (originalPrintDescriptor) Object.defineProperty(window, "print", originalPrintDescriptor);
      else Reflect.deleteProperty(window, "print");
    }
  });


  it("blocks ERP statement printing when the displayed snapshot is one microsecond older than the current binding", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test",
      name: "CI Customer", roles: ["customer"], isStaff: false,
    };
    const sourceAsOf = new Date(Date.now() - 2 * 60_000).toISOString().replace(/Z$/, "001Z");
    const changedSourceAsOf = sourceAsOf.replace(/001Z$/, "002Z");
    const currencyAsOf = new Date(Date.now() - 60_000).toISOString();
    const sourceFor = (watermark: string) => ({
      source_mode: "ONYX", source_status: "active", source_as_of: watermark,
      last_synced_at: watermark, verified_at: watermark,
      revision: watermark === sourceAsOf ? 77 : 78,
      is_stale: false, can_read_app_ledger: false,
    });
    const externalStatement = {
      source_mode: "ONYX", source_as_of: sourceAsOf, details_limit_per_currency: 500,
      currencies: [{
        currency_code: "YER", source_as_of: currencyAsOf, entry_count: 1,
        total_debit: "10.0000", total_credit: "0", closing_balance: "10.0000",
        details_partial: false,
        entries: [{
          entry_reference: "ONYX-JV-MICRO-001", entry_date: "2026-11-28", due_date: null,
          entry_type: "invoice", debit_amount: "10.0000", credit_amount: "0",
          running_balance: "10.0000", source_document_number: "ONYX-INV-MICRO-001",
          description: "قيد اختبار دقة توقيت المصدر",
        }],
      }],
    };
    let sourceReads = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return { data: sourceFor(sourceReads <= 2 ? sourceAsOf : changedSourceAsOf), error: null };
      }
      if (name === "get_customer_account_statement") {
        return {
          data: {
            source_mode: "ONYX", invoices: [], payments: [], credits: [],
            summary: null, summary_as_of_utc: sourceAsOf, external_statement: externalStatement,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    const printSpy = vi.fn();
    const originalPrintDescriptor = Object.getOwnPropertyDescriptor(window, "print");
    Object.defineProperty(window, "print", { configurable: true, value: printSpy });
    try {
      await mountQuoteWorkspace("/statement");
      expect(sourceReads).toBe(2);
      expect(host?.textContent).toContain("ONYX-JV-MICRO-001");
      const printButton = Array.from(host?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        .find((button) => button.textContent?.includes("طباعة من المتصفح"));
      expect(printButton).toBeDefined();

      await act(async () => {
        printButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      expect(sourceReads).toBe(3);
      expect(host?.textContent).toContain("تغير مصدر الحساب؛ أوقفنا طباعة كشف الدفتر السابق.");
      expect(host?.textContent).not.toContain("ONYX-JV-MICRO-001");
      expect(printButton).toBeDisabled();
      expect(printSpy).not.toHaveBeenCalled();
    } finally {
      if (originalPrintDescriptor) Object.defineProperty(window, "print", originalPrintDescriptor);
      else Reflect.deleteProperty(window, "print");
    }
  });


  it("refreshes the customer statement after returning to the foreground and supports explicit refresh", async () => {
    mocks.user = {
      id: USER_ID, profileId: PROFILE_ID, email: "ci-customer@example.test",
      name: "CI Customer", roles: ["customer"], isStaff: false,
    };
    const externalAsOf = new Date(Date.now() - 2 * 60_000).toISOString();
    const currencyAsOf = new Date(Date.now() - 60_000).toISOString();
    const appSource = {
      source_mode: "APP_ONLY", source_status: "active", source_as_of: null,
      last_synced_at: null, verified_at: null, revision: 91, is_stale: false,
      can_read_app_ledger: true,
    };
    const externalSource = {
      source_mode: "ONYX", source_status: "active", source_as_of: externalAsOf,
      last_synced_at: externalAsOf, verified_at: externalAsOf, revision: 92,
      is_stale: false, can_read_app_ledger: false,
    };
    const externalStatement = {
      source_mode: "ONYX", source_as_of: externalAsOf, details_limit_per_currency: 500,
      currencies: [{
        currency_code: "YER", source_as_of: currencyAsOf, entry_count: 1,
        total_debit: "20.0000", total_credit: "0", closing_balance: "20.0000",
        details_partial: false,
        entries: [{
          entry_reference: "EXT-NEW-001", entry_date: "2026-11-28", due_date: null,
          entry_type: "invoice", debit_amount: "20.0000", credit_amount: "0",
          running_balance: "20.0000", source_document_number: "EXT-INV-001",
          description: "فاتورة من مصدر الحساب الجديد",
        }],
      }],
    };
    let sourceReads = 0;
    let statementReads = 0;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_my_customer_financial_source") {
        sourceReads += 1;
        return { data: sourceReads <= 2 ? appSource : externalSource, error: null };
      }
      if (name === "get_customer_account_statement") {
        statementReads += 1;
        if (statementReads === 1) {
          return {
            data: {
              source_mode: "APP_ONLY",
              invoices: [{
                id: "91111111-1111-4111-8111-111111111111",
                invoice_number: "INV-FOREGROUND-STALE",
                order_id: "92222222-2222-4222-8222-222222222222",
                customer_id: "93333333-3333-4333-8333-333333333333",
                status: "issued", issued_at: "2026-11-27T00:00:00Z", due_at: null,
                currency: "YER", subtotal: "100.00", tax_amount: "0.00", total_amount: "100.00",
              }],
              payments: [], credits: [],
              summary: [{
                currency: "YER", invoiced: "100.00", paid: "0.00", credited: "0.00",
                outstanding: "100.00", overdue_outstanding: "0.00", overdue_invoice_count: 0,
                unknown_due_date_outstanding: "0.00", unknown_due_date_invoice_count: 0,
              }],
              summary_as_of_utc: "2026-11-28T00:00:00Z",
            },
            error: null,
          };
        }
        return {
          data: {
            source_mode: "ONYX", invoices: [], payments: [], credits: [],
            summary: null, summary_as_of_utc: externalAsOf, external_statement: externalStatement,
          },
          error: null,
        };
      }
      return { data: null, error: null };
    });

    await mountQuoteWorkspace("/statement");
    expect(sourceReads).toBe(2);
    expect(statementReads).toBe(1);
    expect(host?.textContent).toContain("INV-FOREGROUND-STALE");

    await act(async () => {
      window.dispatchEvent(new Event("focus"));
      // A browser may also emit visibilitychange for the same foreground transition.
      document.dispatchEvent(new Event("visibilitychange"));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(sourceReads).toBe(4);
    expect(statementReads).toBe(2);
    expect(host?.textContent).not.toContain("INV-FOREGROUND-STALE");
    expect(host?.textContent).toContain("كشف الحساب الخارجي");
    expect(host?.textContent).toContain("EXT-NEW-001");

    const refreshButton = host?.querySelector<HTMLButtonElement>('button[aria-label="تحديث كشف الحساب"]');
    expect(refreshButton).toBeDefined();
    expect(refreshButton).toBeEnabled();
    await act(async () => {
      refreshButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(sourceReads).toBe(6);
    expect(statementReads).toBe(3);
    expect(host?.textContent).not.toContain("INV-FOREGROUND-STALE");
    expect(host?.textContent).toContain("EXT-NEW-001");
  });

});
