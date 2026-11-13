// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductGrid } from "./Storefront";
import type { ProductWithInventory } from "@/lib/types";

const productId = "a1000000-0000-0000-0000-000000000071";
const product = {
  id: productId,
  name: "رز بسمتي قابل للوصول",
  item_code: "RICE-ACCESS-071",
  unit: "كيس",
  image_url: "https://images.example.test/rice.webp",
  display_price: null,
  category: { name: "الأرز" },
  inventory: { quantity_available: 12 },
  min_order_quantity: 1,
  order_quantity_multiple: 1,
} as unknown as ProductWithInventory;

afterEach(() => cleanup());

describe("storefront product card accessibility", () => {
  it("exposes the image as a keyboard-focusable details button without nesting favorite/compare controls", () => {
    const onOpen = vi.fn();
    const onAdd = vi.fn();
    const onWishlist = vi.fn();
    const onCompare = vi.fn();

    render(
      <ProductGrid
        products={[product]}
        priceVisibilityPolicy={false}
        wishlist={[]}
        compare={[]}
        emptyTitle="لا توجد منتجات"
        emptyDescription=""
        onOpen={onOpen}
        onAdd={onAdd}
        onWishlist={onWishlist}
        onCompare={onCompare}
      />,
    );

    const imageButton = screen.getByRole("button", { name: "عرض تفاصيل رز بسمتي قابل للوصول" });
    expect(imageButton.tagName).toBe("BUTTON");
    expect(imageButton.querySelector("button")).toBeNull();
    imageButton.focus();
    expect(document.activeElement).toBe(imageButton);

    const favoriteButton = screen.getByRole("button", { name: "إضافة رز بسمتي قابل للوصول إلى المفضلة" });
    const compareButton = screen.getByRole("button", { name: "إضافة رز بسمتي قابل للوصول إلى المقارنة" });
    expect(favoriteButton.closest(".sf-card-actions")?.parentElement).toBe(imageButton.parentElement);
    expect(compareButton.closest(".sf-card-actions")?.parentElement).toBe(imageButton.parentElement);

    fireEvent.click(imageButton);
    fireEvent.click(favoriteButton);
    fireEvent.click(compareButton);
    fireEvent.click(screen.getByRole("button", { name: "إضافة رز بسمتي قابل للوصول إلى السلة" }));

    expect(onOpen).toHaveBeenCalledWith(product);
    expect(onWishlist).toHaveBeenCalledWith(productId);
    expect(onCompare).toHaveBeenCalledWith(productId);
    expect(onAdd).toHaveBeenCalledWith(product);
  });

  it("keeps pressed state and action names specific to the product", () => {
    render(
      <ProductGrid
        products={[product]}
        priceVisibilityPolicy={false}
        wishlist={[productId]}
        compare={[productId]}
        emptyTitle="لا توجد منتجات"
        emptyDescription=""
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onWishlist={vi.fn()}
        onCompare={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "إزالة رز بسمتي قابل للوصول من المفضلة" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "إزالة رز بسمتي قابل للوصول من المقارنة" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("does not report missing inventory evidence as confirmed out of stock or allow an unchecked add", () => {
    const productWithoutInventory = {
      ...product,
      inventory: undefined,
    } as unknown as ProductWithInventory;

    render(
      <ProductGrid
        products={[productWithoutInventory]}
        priceVisibilityPolicy={false}
        wishlist={[]}
        compare={[]}
        emptyTitle="لا توجد منتجات"
        emptyDescription=""
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onWishlist={vi.fn()}
        onCompare={vi.fn()}
      />,
    );

    expect(screen.getByText("لم يتم التحقق من المخزون")).toBeInTheDocument();
    expect(screen.queryByText("نفد المخزون")).toBeNull();
    const addButton = screen.getByRole("button", {
      name: "إضافة رز بسمتي قابل للوصول إلى السلة",
    });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveTextContent("التوفر غير مؤكد");
  });

  it("continues to report out of stock for an authoritative zero balance", () => {
    const productWithZeroStock = {
      ...product,
      inventory: { quantity_available: 0 },
    } as unknown as ProductWithInventory;

    render(
      <ProductGrid
        products={[productWithZeroStock]}
        priceVisibilityPolicy={false}
        wishlist={[]}
        compare={[]}
        emptyTitle="لا توجد منتجات"
        emptyDescription=""
        onOpen={vi.fn()}
        onAdd={vi.fn()}
        onWishlist={vi.fn()}
        onCompare={vi.fn()}
      />,
    );

    expect(screen.getByText("نفد المخزون")).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "إضافة رز بسمتي قابل للوصول إلى السلة",
    })).toBeDisabled();
  });
});
