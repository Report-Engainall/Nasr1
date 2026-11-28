// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StorefrontMobileSearch } from "./StorefrontMobileSearch";
import type { Category, ProductWithInventory } from "@/lib/types";

const riceCategory: Category = {
  id: "category-rice-mobile-search",
  name: "الأرز",
  name_en: null,
  parent_id: null,
  sort_order: 1,
  is_active: true,
  icon: null,
};
const riceProduct = {
  id: "a1000000-0000-0000-0000-000000000091",
  name: "رز بسمتي هندي",
  item_code: "RICE-MOBILE-091",
  sku: "SKU-RICE-091",
  barcode: null,
  unit: "كيس",
  image_url: null,
  category: { name: "الأرز" },
  inventory: { quantity_available: 8 },
  min_order_quantity: 1,
  order_quantity_multiple: 1,
} as unknown as ProductWithInventory;

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("storefront mobile predictive search", () => {
  it("opens an accessible dialog, reuses live product suggestions, and restores focus after selection", () => {
    const onProductSelect = vi.fn();
    const onSearch = vi.fn();
    const onQueryChange = vi.fn();
    const onCategorySelect = vi.fn();

    render(
      <StorefrontMobileSearch
        query="رز"
        products={[riceProduct]}
        categories={[riceCategory]}
        loading={false}
        productsAvailable
        onQueryChange={onQueryChange}
        onSearch={onSearch}
        onProductSelect={onProductSelect}
        onCategorySelect={onCategorySelect}
      />,
    );

    const trigger = screen.getByRole("button", { name: "فتح بحث المنتجات" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "بحث المنتجات" });
    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    expect(dialog).toBeInTheDocument();
    expect(input).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    const productSuggestion = screen.getByRole("option", { name: /رز بسمتي هندي/ });
    expect(productSuggestion).toBeInTheDocument();
    expect(productSuggestion).toHaveTextContent("SKU: SKU-RICE-091");

    fireEvent.click(screen.getByRole("option", { name: /رز بسمتي هندي/ }));
    expect(onProductSelect).toHaveBeenCalledWith(riceProduct);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("lets Escape close suggestions first and then close the dialog without losing focus", () => {
    render(
      <StorefrontMobileSearch
        query="رز"
        products={[]}
        categories={[riceCategory]}
        loading={false}
        productsAvailable
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onProductSelect={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "فتح بحث المنتجات" }));
    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    expect(screen.getByRole("listbox", { name: "اقتراحات البحث" })).toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "بحث المنتجات" })).toBeInTheDocument();
    expect(screen.queryByRole("listbox", { name: "اقتراحات البحث" })).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "فتح بحث المنتجات" })).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("traps reverse keyboard navigation inside the dialog", () => {
    render(
      <StorefrontMobileSearch
        query=""
        products={[]}
        categories={[]}
        loading={false}
        productsAvailable={false}
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onProductSelect={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "فتح بحث المنتجات" }));
    const closeButton = screen.getByRole("button", { name: "إغلاق البحث" });
    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    closeButton.focus();
    fireEvent.keyDown(closeButton, { key: "Tab", shiftKey: true });
    expect(input).toHaveFocus();
  });
});
