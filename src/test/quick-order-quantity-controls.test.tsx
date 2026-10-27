import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductWithInventory } from "@/lib/types";
import { QuickOrderMatrix } from "@/components/Storefront";

const product: ProductWithInventory = {
  id: "product-1",
  name: "صنف تجريبي",
  name_en: null,
  item_code: "000123",
  sku: null,
  barcode: null,
  category_id: null,
  brand_id: null,
  unit: "حبة",
  description: null,
  image_url: null,
  is_active: true,
  is_featured: false,
  sort_order: 0,
  price_wholesale_of_wholesale: 0,
  price_wholesale: 0,
  price_retail: 0,
  base_price: 0,
  stock_quantity: 3,
  reserved_quantity: 0,
  min_stock_level: 0,
  inventory: {
    id: "balance-1",
    product_id: "product-1",
    warehouse_id: "warehouse-1",
    quantity_on_hand: 3,
    quantity_reserved: 0,
    quantity_available: 3,
  },
};

function renderMatrix(quantities: Record<string, string>, onQuantityChange = vi.fn()) {
  const view = render(
    <QuickOrderMatrix
      products={[product]}
      quantities={quantities}
      feedback={null}
      onQuantityChange={onQuantityChange}
      onAddSelected={vi.fn()}
      onBack={vi.fn()}
      onCart={vi.fn()}
    />,
  );
  return { ...view, onQuantityChange };
}

describe("QuickOrderMatrix quantity controls", () => {
  afterEach(() => cleanup());

  it("starts empty and increments using the product's available stock limit", () => {
    const { onQuantityChange } = renderMatrix({});
    const input = screen.getByRole("spinbutton", { name: "كمية صنف تجريبي" });
    const decrease = screen.getByRole("button", { name: "تقليل كمية صنف تجريبي" });
    const increase = screen.getByRole("button", { name: "زيادة كمية صنف تجريبي" });

    expect(input).toHaveValue(null);
    expect(decrease).toBeDisabled();
    expect(increase).not.toBeDisabled();
    fireEvent.click(increase);
    expect(onQuantityChange).toHaveBeenCalledWith("product-1", "1");
  });

  it("decrements the current quantity and disables increasing at the stock limit", () => {
    const { onQuantityChange } = renderMatrix({ "product-1": "3" });
    expect(screen.getByRole("button", { name: "زيادة كمية صنف تجريبي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "تقليل كمية صنف تجريبي" })).not.toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "تقليل كمية صنف تجريبي" }));
    expect(onQuantityChange).toHaveBeenCalledWith("product-1", "2");
  });

  it("disables the input and both steppers when no stock is available", () => {
    const outOfStock = {
      ...product,
      inventory: { ...product.inventory!, quantity_available: 0 },
    };
    render(
      <QuickOrderMatrix
        products={[outOfStock]}
        quantities={{}}
        feedback={null}
        onQuantityChange={vi.fn()}
        onAddSelected={vi.fn()}
        onBack={vi.fn()}
        onCart={vi.fn()}
      />,
    );
    expect(screen.getByRole("spinbutton", { name: "كمية صنف تجريبي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "تقليل كمية صنف تجريبي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "زيادة كمية صنف تجريبي" })).toBeDisabled();
  });
});
