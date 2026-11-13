// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ProductWithInventory } from "@/lib/types";
import { ProductComparison } from "./ProductComparison";

const rice = {
  id: "a1000000-0000-0000-0000-000000000071",
  name: "رز بسمتي",
  name_en: "Basmati Rice",
  item_code: "RICE-071",
  sku: "SKU-RICE-071",
  unit: "كيس",
  description: "أرز بسمتي حبة طويلة",
  display_price: 1300,
  is_featured: true,
  min_order_quantity: 2,
  order_quantity_multiple: 2,
  image_url: null,
  category: { name: "الأرز" },
  inventory: { quantity_available: 12 },
} as unknown as ProductWithInventory;

const coffee = {
  ...rice,
  id: "a1000000-0000-0000-0000-000000000072",
  name: "قهوة عربية",
  name_en: null,
  item_code: "COFFEE-072",
  sku: null,
  unit: "علبة",
  description: null,
  display_price: 2400,
  is_featured: false,
  min_order_quantity: 1,
  order_quantity_multiple: 1,
  category: { name: "القهوة" },
  inventory: { quantity_available: 0 },
} as unknown as ProductWithInventory;

afterEach(() => cleanup());

function renderComparison(overrides: Partial<ComponentProps<typeof ProductComparison>> = {}) {
  const onOpen = vi.fn();
  const onAdd = vi.fn();
  const onRemove = vi.fn();
  const onBack = vi.fn();
  const onRetry = vi.fn();

  render(
    <ProductComparison
      products={[rice, coffee]}
      priceVisibilityPolicy={true}
      loading={false}
      error={null}
      onRetry={onRetry}
      onOpen={onOpen}
      onAdd={onAdd}
      onRemove={onRemove}
      onBack={onBack}
      {...overrides}
    />,
  );

  return { onOpen, onAdd, onRemove, onBack, onRetry };
}

describe("storefront product comparison workspace", () => {
  it("compares live catalog attributes side by side instead of rendering another product grid", () => {
    renderComparison();

    expect(screen.getByRole("table", { name: "مقارنة مواصفات المنتجات وأسعارها وتوفرها" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /رز بسمتي/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /قهوة عربية/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "التصنيف" })).toBeInTheDocument();
    expect(screen.getByText("الأرز")).toBeInTheDocument();
    expect(screen.getByText("القهوة")).toBeInTheDocument();
    expect(screen.getByText("RICE-071")).toBeInTheDocument();
    expect(screen.getByText("COFFEE-072")).toBeInTheDocument();
    expect(screen.getByText("١٢ متاح")).toBeInTheDocument();
    expect(screen.getAllByText("نفد المخزون").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ر\.ي/).length).toBeGreaterThan(0);
  });

  it("does not expose a server price when the storefront price policy is disabled", () => {
    renderComparison({ priceVisibilityPolicy: false });

    expect(screen.getAllByText("السعر غير معروض حسب إعدادات المتجر")).toHaveLength(2);
    expect(screen.queryByText(/ر\.ي/)).not.toBeInTheDocument();
    expect(screen.queryByText("١٬٣٠٠")).not.toBeInTheDocument();
    expect(screen.queryByText("٢٬٤٠٠")).not.toBeInTheDocument();
  });

  it("treats missing stock as unknown and blocks adding it to the cart", () => {
    const productWithoutInventory = {
      ...rice,
      inventory: undefined,
    } as unknown as ProductWithInventory;
    const onAdd = vi.fn();

    renderComparison({
      products: [productWithoutInventory],
      onAdd,
    });

    expect(screen.getAllByText("المخزون غير متحقق").length).toBeGreaterThan(0);
    expect(screen.queryByText("نفد المخزون")).not.toBeInTheDocument();

    const addButton = screen.getByRole("button", { name: "إضافة رز بسمتي إلى السلة" });
    expect(addButton).toBeDisabled();
    fireEvent.click(addButton);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("wires product details, removal, and orderable products to their real callbacks", () => {
    const actions = renderComparison();

    fireEvent.click(screen.getAllByRole("button", { name: "التفاصيل" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "إزالة رز بسمتي من المقارنة" }));
    fireEvent.click(screen.getByRole("button", { name: "إضافة رز بسمتي إلى السلة" }));

    expect(actions.onOpen).toHaveBeenCalledWith(rice);
    expect(actions.onRemove).toHaveBeenCalledWith(rice.id);
    expect(actions.onAdd).toHaveBeenCalledWith(rice);
  });

  it("keeps the retry path visible when the catalog fails to load", () => {
    const actions = renderComparison({ products: [], error: "تعذر الاتصال بالكتالوج" });

    expect(screen.getByRole("alert")).toHaveTextContent("تعذر الاتصال بالكتالوج");
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(actions.onRetry).toHaveBeenCalledTimes(1);
  });
});
