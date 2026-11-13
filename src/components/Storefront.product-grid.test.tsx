// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProductGrid } from "./Storefront";
import { StorefrontPredictiveSearch } from "./StorefrontPredictiveSearch";
import type { Category, ProductWithInventory } from "@/lib/types";

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


describe("storefront predictive catalogue search", () => {
  const riceCategory: Category = {
    id: "category-rice",
    name: "الأرز",
    name_en: null,
    parent_id: null,
    sort_order: 1,
    is_active: true,
    icon: null,
  };

  it("groups live query, category and product suggestions and supports keyboard selection", () => {
    const onSearch = vi.fn();
    const onProductSelect = vi.fn();
    const onCategorySelect = vi.fn();
    const onQueryChange = vi.fn();
    const matchingProduct = { ...product, name: "رز بسمتي قابل للوصول" };

    render(
      <StorefrontPredictiveSearch
        productsAvailable={true}
        query="رز"
        products={[matchingProduct]}
        categories={[riceCategory]}
        loading={false}
        onQueryChange={onQueryChange}
        onSearch={onSearch}
        onProductSelect={onProductSelect}
        onCategorySelect={onCategorySelect}
      />,
    );

    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "البحث بالعبارة" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "التصنيفات المطابقة" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "المنتجات المطابقة" })).toBeInTheDocument();

    const queryOption = screen.getByRole("option", { name: "عرض نتائج البحث عن «رز»" });
    const categoryOption = screen.getByRole("option", { name: /الأرز/ });
    const productOption = screen.getByRole("option", { name: /رز بسمتي قابل للوصول/ });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", queryOption.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", categoryOption.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", productOption.id);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onProductSelect).toHaveBeenCalledWith(matchingProduct);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("selects a real category and commits a complete query through the matching actions", () => {
    const onSearch = vi.fn();
    const onProductSelect = vi.fn();
    const onCategorySelect = vi.fn();

    render(
      <StorefrontPredictiveSearch
        productsAvailable={true}
        query="رز"
        products={[]}
        categories={[riceCategory]}
        loading={false}
        onQueryChange={vi.fn()}
        onSearch={onSearch}
        onProductSelect={onProductSelect}
        onCategorySelect={onCategorySelect}
      />,
    );

    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /الأرز/ }));
    expect(onCategorySelect).toHaveBeenCalledWith(riceCategory);

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: "عرض نتائج البحث عن «رز»" }));
    expect(onSearch).toHaveBeenCalledWith("رز");
    expect(onProductSelect).not.toHaveBeenCalled();
  });

  it("does not render stale product options while the server catalogue query is pending", () => {
    render(
      <StorefrontPredictiveSearch
        productsAvailable={false}
        query="رز"
        products={[]}
        categories={[riceCategory]}
        loading={true}
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onProductSelect={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    fireEvent.focus(input);
    expect(screen.getByRole("status")).toHaveTextContent("جار البحث في كتالوج المتجر");
    expect(screen.queryByRole("group", { name: "المنتجات المطابقة" })).not.toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /رز بسمتي/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "عرض نتائج البحث عن «رز»" })).toBeInTheDocument();
  });

  it("closes the suggestion panel on Escape", () => {
    render(
      <StorefrontPredictiveSearch        productsAvailable={true}

        query="رز"
        products={[]}
        categories={[riceCategory]}
        loading={false}
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onProductSelect={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox", { name: "اقتراحات البحث" })).not.toBeInTheDocument();
  });
});
