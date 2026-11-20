// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductDetail } from "./Storefront";
import type { ProductWithInventory } from "@/lib/types";

vi.mock("@/components/StorefrontProductReviews", () => ({
  StorefrontProductReviews: () => null,
}));
vi.mock("@/components/StorefrontProductQuestions", () => ({
  StorefrontProductQuestions: () => null,
}));
vi.mock("@/lib/product-unit-conversions", () => ({
  fetchProductUnitOptions: vi.fn(async () => ({ base_unit: "كيس", units: [] })),
}));

const product = {
  id: "a1000000-0000-0000-0000-000000000071",
  name: "أرز بسمتي",
  item_code: "RICE-BUY-071",
  sku: "RICE-BUY-071",
  barcode: null,
  unit: "كيس",
  category: { name: "الأرز" },
  description: "أرز بسمتي طويل الحبة",
  image_url: null,
  image_gallery_urls: [],
  display_price: null,
  min_order_quantity: 2,
  order_quantity_multiple: 2,
  inventory: { quantity_available: 10 },
} as unknown as ProductWithInventory;

afterEach(() => cleanup());

function renderProductDetail(overrides: {
  canBuyNow?: boolean;
  buyNowDisabledMessage?: string | null;
  product?: ProductWithInventory;
} = {}) {
  const onAdd = vi.fn();
  const onBuyNow = vi.fn();
  render(
    <ProductDetail
      product={overrides.product ?? product}
      relatedProducts={[]}
      priceVisibilityPolicy={false}
      inWishlist={false}
      inCompare={false}
      initialQuantity={null}
      canBuyNow={overrides.canBuyNow ?? true}
      buyNowDisabledMessage={overrides.buyNowDisabledMessage ?? null}
      onBack={vi.fn()}
      onAdd={onAdd}
      onBuyNow={onBuyNow}
      onWishlist={vi.fn()}
      onCompare={vi.fn()}
      onOpenRelated={vi.fn()}
    />,
  );
  return { onAdd, onBuyNow };
}

describe("storefront product buy-now action", () => {
  it("sends the selected, policy-compliant quantity to the existing checkout action", () => {
    const { onAdd, onBuyNow } = renderProductDetail();

    fireEvent.click(screen.getByRole("button", { name: "شراء المنتج أرز بسمتي الآن" }));

    expect(onBuyNow).toHaveBeenCalledTimes(1);
    expect(onBuyNow).toHaveBeenCalledWith(2, {
      unit_name: "كيس",
      base_units_per_unit: 1,
      selected_quantity: 2,
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("blocks direct checkout until the saved customer cart has been restored", () => {
    renderProductDetail({
      canBuyNow: false,
      buyNowDisabledMessage: "جار مزامنة سلة حسابك المحفوظة قبل بدء الإتمام.",
    });

    const button = screen.getByRole("button", { name: "شراء المنتج أرز بسمتي الآن" });
    expect(button).toBeDisabled();
    expect(screen.getByText("جار مزامنة سلة حسابك المحفوظة قبل بدء الإتمام.")).toBeInTheDocument();
  });

  it("keeps the normal add-to-cart action independent from the buy-now action", () => {
    const { onAdd, onBuyNow } = renderProductDetail();

    fireEvent.click(screen.getByRole("button", { name: /إضافة إلى السلة/ }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith(2, {
      unit_name: "كيس",
      base_units_per_unit: 1,
      selected_quantity: 2,
    });
    expect(onBuyNow).not.toHaveBeenCalled();
  });

  it("preserves the minimum and order-multiple rules when buying immediately", () => {
    const { onBuyNow } = renderProductDetail();

    fireEvent.click(screen.getByRole("button", { name: "زيادة كمية الطلب" }));
    fireEvent.click(screen.getByRole("button", { name: "شراء المنتج أرز بسمتي الآن" }));

    expect(onBuyNow).toHaveBeenCalledTimes(1);
    expect(onBuyNow).toHaveBeenCalledWith(4, {
      unit_name: "كيس",
      base_units_per_unit: 1,
      selected_quantity: 4,
    });
  });

  it("fails closed when current inventory is unknown", () => {
    renderProductDetail({
      product: { ...product, inventory: undefined } as unknown as ProductWithInventory,
    });

    expect(screen.getByRole("button", { name: "شراء المنتج أرز بسمتي الآن" })).toBeDisabled();
    expect(screen.getByRole("button", { name: /إضافة إلى السلة/ })).toBeDisabled();
    expect(screen.getByText(/تعذر التحقق من الكمية المتاحة/)).toBeInTheDocument();
  });
});
