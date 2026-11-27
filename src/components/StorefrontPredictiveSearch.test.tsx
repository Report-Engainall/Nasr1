// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StorefrontPredictiveSearch } from "./StorefrontPredictiveSearch";
import type { ProductWithInventory } from "@/lib/types";

const productBase = {
  id: "a1000000-0000-0000-0000-000000000092",
  name: "رز بسمتي هندي",
  item_code: "RICE-SEARCH-092",
  sku: "SKU-RICE-092",
  barcode: null,
  category_id: null,
  brand_id: null,
  unit: "كيس",
  description: null,
  is_active: true,
  is_featured: false,
  sort_order: 1,
  stock_quantity: 0,
  reserved_quantity: 0,
  min_stock_level: 0,
  status: "active",
};

function renderProductSuggestion(imageUrl: string | null) {
  const product = { ...productBase, image_url: imageUrl } as unknown as ProductWithInventory;
  render(
    <StorefrontPredictiveSearch
      query="رز"
      products={[product]}
      categories={[]}
      loading={false}
      productsAvailable
      onQueryChange={vi.fn()}
      onSearch={vi.fn()}
      onProductSelect={vi.fn()}
      onCategorySelect={vi.fn()}
    />,
  );
  fireEvent.focus(screen.getByRole("combobox", { name: "ابحث عن منتج" }));
  return screen.getByRole("option", { name: /رز بسمتي هندي/ });
}

afterEach(() => cleanup());

describe("storefront predictive-search image privacy", () => {
  it("renders a stable public HTTPS image URL in the product suggestion", () => {
    const imageUrl = "https://cdn.example.test/products/rice.webp?width=96";
    const option = renderProductSuggestion(imageUrl);

    expect(option.querySelector("img")).toHaveAttribute("src", imageUrl);
    expect(option).toHaveTextContent("SKU: SKU-RICE-092");
  });

  it.each([
    "http://cdn.example.test/products/rice.webp",
    "javascript:alert(1)",
    "https://cdn.example.test/products/rice.webp?token=private-value",
    "https://cdn.example.test/products/rice.webp?X-Amz-Signature=private-value",
    " https://cdn.example.test/products/rice.webp",
  ])("does not request an unsafe public image URL (%s)", (imageUrl) => {
    const option = renderProductSuggestion(imageUrl);

    expect(option.querySelector("img")).toBeNull();
    expect(option).toHaveTextContent("رز بسمتي هندي");
    expect(option).toHaveTextContent("SKU: SKU-RICE-092");
  });

  it("keeps the product suggestion usable when no image is available", () => {
    const option = renderProductSuggestion(null);

    expect(option.querySelector("img")).toBeNull();
    expect(option).toHaveTextContent("رز بسمتي هندي");
  });
});
