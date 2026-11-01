import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductWithInventory } from "@/lib/types";
import { validateQuickOrderLines } from "@/lib/commerce-utils";
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

function renderMatrix(quantities: Record<string, string>, onQuantityChange = vi.fn(), alreadyInCart: Record<string, number> = {}) {
  const view = render(
    <QuickOrderMatrix
      products={[product]}
      quantities={quantities}
      alreadyInCart={alreadyInCart}
      feedback={null}
      onQuantityChange={onQuantityChange}
      onAddSelected={vi.fn()}
      onBack={vi.fn()}
      onCart={vi.fn()}
    />,
  );
  return { ...view, onQuantityChange };
}

function policyMatrixElement(
  policyProduct: ProductWithInventory,
  quantities: Record<string, string>,
  onQuantityChange: (productId: string, quantity: string) => void,
) {
  return (
    <QuickOrderMatrix products={[policyProduct]} quantities={quantities} feedback={null}
      onQuantityChange={onQuantityChange} onAddSelected={vi.fn()} onBack={vi.fn()} onCart={vi.fn()} />
  );
}

describe("QuickOrderMatrix quantity controls", () => {
  afterEach(() => cleanup());

  it("starts empty and increments using the product's available stock limit", () => {
    const { onQuantityChange } = renderMatrix({});
    const input = screen.getByRole("spinbutton", { name: "كمية صنف تجريبي" });
    const decrease = screen.getByRole("button", { name: "تقليل كمية صنف تجريبي" });
    const increase = screen.getByRole("button", { name: "زيادة كمية صنف تجريبي" });

    expect((input as HTMLInputElement).value).toBe("");
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

  it("limits the new quantity to stock remaining after the existing cart quantity", () => {
    const { onQuantityChange } = renderMatrix({}, vi.fn(), { "product-1": 2 });
    const input = screen.getByRole("spinbutton", { name: "كمية صنف تجريبي" });
    const increase = screen.getByRole("button", { name: "زيادة كمية صنف تجريبي" });
    expect(input).toHaveAttribute("max", "1");
    expect(increase).not.toBeDisabled();
    fireEvent.click(increase);
    expect(onQuantityChange).toHaveBeenCalledWith("product-1", "1");

    cleanup();
    renderMatrix({}, vi.fn(), { "product-1": 3 });
    expect(screen.getByRole("spinbutton", { name: "كمية صنف تجريبي" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "زيادة كمية صنف تجريبي" })).toBeDisabled();
  });

  it("steps from the configured minimum by the configured pack multiple", () => {
    const policyProduct = { ...product, stock_quantity: 9, min_order_quantity: 3, order_quantity_multiple: 2, inventory: { ...product.inventory!, quantity_on_hand: 9, quantity_available: 9 } };
    const onQuantityChange = vi.fn();
    const view = render(policyMatrixElement(policyProduct, {}, onQuantityChange));
    const input = screen.getByRole("spinbutton", { name: "كمية صنف تجريبي" });
    const increase = screen.getByRole("button", { name: "زيادة كمية صنف تجريبي" });
    expect(input).toHaveAttribute("min", "3");
    expect(input).toHaveAttribute("step", "2");
    fireEvent.click(increase);
    expect(onQuantityChange).toHaveBeenLastCalledWith("product-1", "3");

    view.rerender(policyMatrixElement(policyProduct, { "product-1": "3" }, onQuantityChange));
    fireEvent.click(screen.getByRole("button", { name: "زيادة كمية صنف تجريبي" }));
    expect(onQuantityChange).toHaveBeenLastCalledWith("product-1", "5");
    fireEvent.click(screen.getByRole("button", { name: "تقليل كمية صنف تجريبي" }));
    expect(onQuantityChange).toHaveBeenLastCalledWith("product-1", "");
  });

  it("validates policy against the resulting cart quantity, not only the newly added amount", () => {
    const policy = { min_order_quantity: 3, order_quantity_multiple: 2 };
    const line = { product_id: "product-1", product_name: "صنف تجريبي", available: 10, ...policy };
    expect(validateQuickOrderLines([{ ...line, quantity: 1 }])).toMatchObject({
      valid: false, reason: "order_policy",
    });
    expect(validateQuickOrderLines([{ ...line, quantity: 3 }])).toEqual({ valid: true });
    expect(validateQuickOrderLines([{ ...line, quantity: 2, already_in_cart: 3 }])).toEqual({ valid: true });
    expect(validateQuickOrderLines([{ ...line, quantity: 1, already_in_cart: 3 }])).toMatchObject({
      valid: false, reason: "order_policy",
    });
    expect(validateQuickOrderLines([{ ...line, quantity: 3, available: 2 }])).toMatchObject({
      valid: false, reason: "insufficient_stock",
    });
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
