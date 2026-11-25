// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  productPageRequests: [] as Array<{ afterId: string | null; start: number; end: number }>,
  products: [] as Array<Record<string, unknown>>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { profileId: "shopping-customer-profile", roles: ["customer"], isStaff: false },
    ready: true,
  }),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: vi.fn(async () => ({ organizationId: "shopping-org-001" })),
  supabase: { from: mocks.from },
}));
vi.mock("@/lib/customer-cart", () => ({
  fetchCustomerCart: vi.fn(async () => ({ items: [] })),
}));
vi.mock("@/lib/customer-shopping-lists", () => ({
  fetchCustomerShoppingLists: vi.fn(async () => []),
  fetchCompanyMembershipWorkspace: vi.fn(async () => null),
  applyCustomerShoppingListRunToCart: vi.fn(),
  createCustomerShoppingListRun: vi.fn(),
  removeCustomerShoppingListShare: vi.fn(),
  reviewCustomerShoppingListRun: vi.fn(),
  saveCustomerShoppingList: vi.fn(),
  shareCustomerShoppingList: vi.fn(),
}));
vi.mock("@/lib/storefront-cart-products", () => ({ fetchStorefrontCartProductDetails: vi.fn() }));
vi.mock("@/lib/product-unit-conversions", () => ({ fetchProductUnitOptions: vi.fn() }));
vi.mock("@/lib/customer-company-members", () => ({ fetchCompanyMembershipWorkspace: vi.fn(async () => null) }));
vi.mock("@/lib/customer-shopping-lists-xlsx", () => ({ parseCustomerShoppingListXlsx: vi.fn() }));
vi.mock("@/components/Login", () => ({ Login: () => <div>تسجيل الدخول مطلوب</div> }));
vi.mock("@/components/CustomerOrderPricingPreview", () => ({ CustomerOrderPricingPreview: () => null }));
vi.mock("@/components/CustomerOrderPricingPresentation", () => ({ CustomerOrderPricingPresentation: () => null }));

import { CustomerShoppingListsWorkspace } from "@/components/CustomerShoppingListsWorkspace";
import { formatNumber } from "@/lib/format";

function makeProduct(index: number) {
  const serial = String(index + 1).padStart(12, "0");
  return {
    id: "00000000-0000-4000-8000-" + serial,
    name: "صنف اختبار " + String(index).padStart(3, "0"),
    item_code: "SKU-" + String(index).padStart(3, "0"),
    sku: "BAR-" + index,
    barcode: null,
    unit: "علبة",
    status: "active",
    min_order_quantity: 1,
    order_quantity_multiple: 1,
  };
}

function productQuery() {
  let afterId: string | null = null;
  let range: [number, number] = [0, 1000];
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.order = () => builder;
  builder.gt = (_column: string, cursor: string) => {
    afterId = cursor;
    return builder;
  };
  builder.range = (start: number, end: number) => {
    range = [start, end];
    return builder;
  };
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
    mocks.productPageRequests.push({ afterId, start: range[0], end: range[1] });
    const rows = afterId
      ? mocks.products.filter((product) => String(product.id) > afterId!)
      : mocks.products;
    return Promise.resolve({
      data: rows.slice(range[0], range[1] + 1),
      error: null,
    }).then(resolve, reject);
  };
  return builder;
}

describe("customer shopping list catalog server pagination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.productPageRequests = [];
    mocks.products = Array.from({ length: 405 }, (_, index) => makeProduct(index));
    mocks.from.mockImplementation((table: string) => {
      if (table !== "products") throw new Error("Unexpected table query: " + table);
      return productQuery();
    });
  });

  afterEach(() => cleanup());

  it("loads product catalog pages by last ID and keeps all products searchable without duplicates", async () => {
    render(<CustomerShoppingListsWorkspace />);

    const loadNextPage = await screen.findByRole("button", { name: "تحميل 200 صنف إضافي من الكتالوج" });
    expect(mocks.productPageRequests).toContainEqual({ afterId: null, start: 0, end: 200 });

    fireEvent.click(loadNextPage);
    await waitFor(() => {
      expect(mocks.productPageRequests).toContainEqual({
        afterId: mocks.products[199].id,
        start: 0,
        end: 200,
      });
    });
    expect(await screen.findByRole("button", { name: "تحميل 200 صنف إضافي من الكتالوج" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "تحميل 200 صنف إضافي من الكتالوج" }));
    await waitFor(() => {
      expect(mocks.productPageRequests).toContainEqual({
        afterId: mocks.products[399].id,
        start: 0,
        end: 200,
      });
    });
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "تحميل 200 صنف إضافي من الكتالوج" })).not.toBeInTheDocument();
    });

    const search = screen.getByPlaceholderText("ابحث بالاسم أو رمز الصنف أو SKU أو الباركود");
    fireEvent.change(search, { target: { value: "SKU-404" } });
    expect(screen.getByText("صنف اختبار 404")).toBeInTheDocument();
    expect(screen.getByText(new RegExp("عرض " + formatNumber(1) + " من " + formatNumber(1) + " نتيجة مطابقة"))).toBeInTheDocument();
  });
});
