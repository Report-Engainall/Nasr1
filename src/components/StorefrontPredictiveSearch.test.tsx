/* @vitest-environment jsdom */
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StorefrontPredictiveSearch } from "./StorefrontPredictiveSearch";
import type { Category, ProductWithInventory } from "@/lib/types";

const activeRiceCategory: Category = {
  id: "category-rice",
  name: "الأرز",
  name_en: null,
  parent_id: null,
  sort_order: 1,
  is_active: true,
  icon: null,
};

const inactiveRiceCategory: Category = {
  ...activeRiceCategory,
  id: "category-inactive",
  name: "الأرز المؤرشف",
  is_active: false,
};

function makeProduct(id: string, name: string): ProductWithInventory {
  return {
    id,
    name,
    item_code: id.toUpperCase(),
    image_url: null,
    inventory: { quantity_available: 9 },
  } as unknown as ProductWithInventory;
}

afterEach(() => cleanup());

describe("Storefront predictive search", () => {
  it("groups query, active category and current catalogue products with keyboard navigation", () => {
    const onProductSelect = vi.fn();
    const product = makeProduct("rice-basmati", "أرز بسمتي");

    render(
      <StorefrontPredictiveSearch
        query="رز"
        products={[product]}
        categories={[activeRiceCategory, inactiveRiceCategory]}
        loading={false}
        productsAvailable={true}
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onProductSelect={onProductSelect}
        onCategorySelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    fireEvent.focus(input);

    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("group", { name: "البحث بالعبارة" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "التصنيفات المطابقة" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "المنتجات المطابقة" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /الأرز المؤرشف/ })).not.toBeInTheDocument();

    const queryOption = screen.getByRole("option", { name: "عرض نتائج البحث عن «رز»" });
    const categoryOption = screen.getByRole("option", { name: /الأرز/ });
    const productOption = screen.getByRole("option", { name: /أرز بسمتي/ });

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", queryOption.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", categoryOption.id);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveAttribute("aria-activedescendant", productOption.id);
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onProductSelect).toHaveBeenCalledWith(product);
    expect(input).toHaveAttribute("aria-expanded", "false");
  });

  it("dispatches query and category selections to their existing storefront actions", () => {
    const onSearch = vi.fn();
    const onCategorySelect = vi.fn();

    render(
      <StorefrontPredictiveSearch
        query="رز"
        products={[]}
        categories={[activeRiceCategory]}
        loading={false}
        productsAvailable={true}
        onQueryChange={vi.fn()}
        onSearch={onSearch}
        onProductSelect={vi.fn()}
        onCategorySelect={onCategorySelect}
      />,
    );

    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: /الأرز/ }));
    expect(onCategorySelect).toHaveBeenCalledWith(activeRiceCategory);

    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: "عرض نتائج البحث عن «رز»" }));
    expect(onSearch).toHaveBeenCalledWith("رز");
  });

  it("does not show stale product suggestions while the current server page is pending or unavailable", () => {
    const staleProduct = makeProduct("old-rice", "أرز من استجابة سابقة");
    const { rerender } = render(
      <StorefrontPredictiveSearch
        query="رز"
        products={[staleProduct]}
        categories={[]}
        loading={true}
        productsAvailable={false}
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onProductSelect={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    fireEvent.focus(input);
    expect(screen.getByRole("status")).toHaveTextContent("جار البحث في كتالوج المتجر");
    expect(screen.queryByRole("option", { name: /أرز من استجابة سابقة/ })).not.toBeInTheDocument();

    rerender(
      <StorefrontPredictiveSearch
        query="رز"
        products={[staleProduct]}
        categories={[]}
        loading={false}
        productsAvailable={false}
        error="catalog unavailable"
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onProductSelect={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("تعذر تحميل اقتراحات المنتجات");
    expect(screen.queryByRole("option", { name: /أرز من استجابة سابقة/ })).not.toBeInTheDocument();
  });

  it("closes on Escape and commits the query on Enter when no option is active", () => {
    const onSearch = vi.fn();
    render(
      <StorefrontPredictiveSearch
        query="سكر"
        products={[]}
        categories={[]}
        loading={false}
        productsAvailable={true}
        onQueryChange={vi.fn()}
        onSearch={onSearch}
        onProductSelect={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    );

    const input = screen.getByRole("combobox", { name: "ابحث عن منتج" });
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(input).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox", { name: "اقتراحات البحث" })).not.toBeInTheDocument();

    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSearch).toHaveBeenCalledWith("سكر");
  });

  it("caps product suggestions at five items", () => {
    const products = Array.from({ length: 8 }, (_, index) => makeProduct(`product-${index}`, `صنف ${index}`));
    render(
      <StorefrontPredictiveSearch
        query="صنف"
        products={products}
        categories={[]}
        loading={false}
        productsAvailable={true}
        onQueryChange={vi.fn()}
        onSearch={vi.fn()}
        onProductSelect={vi.fn()}
        onCategorySelect={vi.fn()}
      />,
    );

    fireEvent.focus(screen.getByRole("combobox", { name: "ابحث عن منتج" }));
    expect(screen.getAllByRole("option").filter(option => option.textContent?.startsWith("صنف "))).toHaveLength(5);
  });
});
