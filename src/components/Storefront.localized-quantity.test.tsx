// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuickOrderMatrix } from "./Storefront";
import type { ProductWithInventory } from "@/lib/types";

const productId = "a1000000-0000-0000-0000-000000000081";
const product = {
  id: productId,
  name: "سكر",
  item_code: "SUGAR-081",
  unit: "كيس",
  inventory: { quantity_available: 40 },
  min_order_quantity: 2,
  order_quantity_multiple: 2,
} as unknown as ProductWithInventory;

afterEach(() => cleanup());

describe("storefront localized quantity inputs", () => {
  it("normalizes Arabic-Indic and Persian digits in the quick-order matrix", () => {
    const onQuantityChange = vi.fn();
    render(
      <QuickOrderMatrix
        products={[product]}
        quantities={{ [productId]: "" }}
        feedback={null}
        onQuantityChange={onQuantityChange}
        onAddSelected={vi.fn()}
        onBack={vi.fn()}
        onCart={vi.fn()}
      />,
    );

    const input = screen.getByRole("textbox", { name: "كمية سكر" });
    expect(input).toHaveAttribute("inputmode", "numeric");
    fireEvent.change(input, { target: { value: "١٢" } });
    expect(onQuantityChange).toHaveBeenLastCalledWith(productId, "12");

    fireEvent.change(input, { target: { value: "۱۲" } });
    expect(onQuantityChange).toHaveBeenLastCalledWith(productId, "12");
  });

  it("does not pass malformed quantity text into the quick-order draft", () => {
    const onQuantityChange = vi.fn();
    render(
      <QuickOrderMatrix
        products={[product]}
        quantities={{ [productId]: "" }}
        feedback={null}
        onQuantityChange={onQuantityChange}
        onAddSelected={vi.fn()}
        onBack={vi.fn()}
        onCart={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByRole("textbox", { name: "كمية سكر" }), {
      target: { value: "١٢x" },
    });
    expect(onQuantityChange).not.toHaveBeenCalled();
  });
});
