import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import type { ProductWithInventory } from "@/lib/types";
import { ProductDetail, ProductGrid } from "@/components/Storefront";

const displayPrice = 1234.5;
const product = {
  id: "a1000000-0000-0000-0000-000000000001",
  name: "أرز الاختبار",
  item_code: "RICE-CI-001",
  unit: "كيس",
  description: "صنف اختبار لسياسة إظهار الأسعار",
  image_url: null,
  display_price: displayPrice,
  category: { name: "مواد غذائية" },
  inventory: { quantity_available: 5 },
} as unknown as ProductWithInventory;

const noop = () => undefined;

function renderCard(policyValue: unknown, amount = displayPrice) {
  return renderToStaticMarkup(createElement(ProductGrid, {
    products: [{ ...product, display_price: amount }],
    priceVisibilityPolicy: policyValue,
    wishlist: [],
    compare: [],
    emptyTitle: "لا توجد منتجات",
    emptyDescription: "",
    onOpen: noop,
    onAdd: noop,
    onWishlist: noop,
    onCompare: noop,
  }));
}

function renderDetail(policyValue: unknown, amount = displayPrice) {
  return renderToStaticMarkup(createElement(ProductDetail, {
    product: { ...product, display_price: amount },
    priceVisibilityPolicy: policyValue,
    inWishlist: false,
    inCompare: false,
    onBack: noop,
    onAdd: noop,
    onWishlist: noop,
    onCompare: noop,
  }));
}

describe("storefront product-card and product-detail price policy integration", () => {
  it("renders the unchanged server price on a product card only when the public policy is explicitly true", () => {
    const html = renderCard(true);
    expect(html).toContain('class="sf-product-price"');
    expect(html).toContain(formatCurrency(displayPrice));
    expect(html).toContain("كيس");
  });

  it.each([false, undefined, null, "true", 1])(
    "fails closed and omits card price markup when the policy is not boolean true (%s)",
    (policyValue) => {
      const html = renderCard(policyValue);
      expect(html).not.toContain("sf-product-price");
      expect(html).not.toContain(formatCurrency(displayPrice));
    },
  );

  it("suppresses the zero-price sentinel even while the public policy is enabled", () => {
    expect(renderCard(true, 0)).not.toContain("sf-product-price");
    expect(renderDetail(true, 0)).not.toContain("sf-detail-price");
  });

  it("renders the unchanged server price on product details when enabled", () => {
    const html = renderDetail(true);
    expect(html).toContain('class="sf-detail-price"');
    expect(html).toContain(formatCurrency(displayPrice));
    expect(html).toContain("لكل كيس");
    expect(html).toContain("السعر الظاهر قبل تأكيد الطلب");
  });

  it.each([false, undefined, null, "true", 1])(
    "fails closed and omits detail price markup and price-only copy when the policy is not boolean true (%s)",
    (policyValue) => {
      const html = renderDetail(policyValue);
      expect(html).not.toContain("sf-detail-price");
      expect(html).not.toContain(formatCurrency(displayPrice));
      expect(html).not.toContain("السعر الظاهر قبل تأكيد الطلب");
    },
  );
});
