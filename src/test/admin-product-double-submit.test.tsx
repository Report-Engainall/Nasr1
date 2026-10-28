import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  fetchCategories: vi.fn(),
  uploadProductImage: vi.fn(),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    createProduct: mocks.createProduct,
    updateProduct: mocks.updateProduct,
    fetchCategories: mocks.fetchCategories,
    uploadProductImage: mocks.uploadProductImage,
  };
});

import type { ProductWithInventory } from "@/lib/types";
import { ProductModal } from "@/components/AghbariApp";

const savedProduct = {
  id: "product-created",
  name: "منتج الاختبار",
  item_code: "TEST-001",
  base_price: 25,
  category_id: null,
  status: "active",
  unit: "كرتون",
};

const existingProduct: ProductWithInventory = {
  ...savedProduct,
  name_en: null,
  sku: null,
  barcode: null,
  brand_id: null,
  description: null,
  image_url: null,
  is_active: true,
  is_featured: false,
  sort_order: 0,
  price_wholesale_of_wholesale: 25,
  price_wholesale: 25,
  price_retail: 25,
  stock_quantity: 0,
  reserved_quantity: 0,
  min_stock_level: 0,
  display_price: 25,
};

function fillRequiredFields() {
  fireEvent.change(screen.getByLabelText("اسم المنتج"), { target: { value: "منتج الاختبار" } });
  fireEvent.change(screen.getByLabelText("رمز المنتج"), { target: { value: "TEST-001" } });
  fireEvent.change(screen.getByLabelText("السعر الأساسي"), { target: { value: "25.00" } });
}

describe("admin product form submission", () => {
  beforeEach(() => {
    mocks.createProduct.mockReset().mockResolvedValue(savedProduct);
    mocks.updateProduct.mockReset().mockResolvedValue(savedProduct);
    mocks.fetchCategories.mockReset().mockResolvedValue([]);
    mocks.uploadProductImage.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("sends only one create request for rapid submits dispatched before rerender", async () => {
    let finishCreate: ((value: typeof savedProduct) => void) | undefined;
    mocks.createProduct.mockImplementationOnce(
      () =>
        new Promise<typeof savedProduct>((resolve) => {
          finishCreate = resolve;
        }),
    );
    const onSaved = vi.fn();
    render(<ProductModal product={null} onClose={vi.fn()} onSaved={onSaved} />);
    fillRequiredFields();

    const submit = screen.getByRole("button", { name: "حفظ المنتج" });
    await waitFor(() => expect(submit).toBeEnabled());
    await act(async () => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(mocks.createProduct).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();

    await act(async () => {
      finishCreate?.(savedProduct);
      await Promise.resolve();
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.createProduct).toHaveBeenCalledWith({
      name: "منتج الاختبار",
      name_en: null,
      item_code: "TEST-001",
      sku: null,
      barcode: null,
      base_price: 25,
      min_order_quantity: 1,
      order_quantity_multiple: 1,
      category_id: null,
      is_featured: false,
      sort_order: 0,
      unit: "كرتون",
      status: "active",
    });
  });

  it("sends only one update request for rapid submits dispatched before rerender", async () => {
    let finishUpdate: ((value: typeof savedProduct) => void) | undefined;
    mocks.updateProduct.mockImplementationOnce(
      () =>
        new Promise<typeof savedProduct>((resolve) => {
          finishUpdate = resolve;
        }),
    );
    const onSaved = vi.fn();
    render(<ProductModal product={existingProduct} onClose={vi.fn()} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("اسم المنتج"), { target: { value: "منتج معدّل" } });
    fireEvent.change(screen.getByLabelText("رمز المنتج"), { target: { value: "TEST-002" } });
    fireEvent.change(screen.getByLabelText("السعر الأساسي"), { target: { value: "30.00" } });

    const submit = screen.getByRole("button", { name: "حفظ المنتج" });
    await waitFor(() => expect(submit).toBeEnabled());
    await act(async () => {
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    expect(mocks.updateProduct).toHaveBeenCalledTimes(1);
    expect(mocks.createProduct).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();

    await act(async () => {
      finishUpdate?.(savedProduct);
      await Promise.resolve();
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct).toHaveBeenCalledWith("product-created", {
      name: "منتج معدّل",
      name_en: null,
      item_code: "TEST-002",
      sku: null,
      barcode: null,
      base_price: 30,
      min_order_quantity: 1,
      order_quantity_multiple: 1,
      category_id: null,
      is_featured: false,
      sort_order: 0,
      unit: "كرتون",
      status: "active",
    });
  });

  it("persists the featured flag and numeric storefront order through the product update", async () => {
    const onSaved = vi.fn();
    render(<ProductModal product={existingProduct} onClose={vi.fn()} onSaved={onSaved} />);

    const submit = screen.getByRole("button", { name: "حفظ المنتج" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText("ظهور المنتج في المتجر"), { target: { value: "featured" } });
    fireEvent.change(screen.getByLabelText("ترتيب الظهور"), { target: { value: "7" } });
    fireEvent.click(submit);

    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct).toHaveBeenCalledWith("product-created", expect.objectContaining({
      is_featured: true,
      sort_order: 7,
    }));
  });

  it("rejects a fractional storefront order before issuing a product write", async () => {
    render(<ProductModal product={existingProduct} onClose={vi.fn()} onSaved={vi.fn()} />);

    const submit = screen.getByRole("button", { name: "حفظ المنتج" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.change(screen.getByLabelText("ترتيب الظهور"), { target: { value: "1.5" } });
    fireEvent.click(submit);

    expect(await screen.findByRole("alert")).toHaveTextContent("ترتيب الظهور يجب أن يكون عددًا صحيحًا");
    expect(mocks.updateProduct).not.toHaveBeenCalled();
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });

  it("does not allow product save to proceed with an unresolved category lookup error", async () => {
    mocks.fetchCategories
      .mockRejectedValueOnce(new Error("فشل تحميل التصنيفات"))
      .mockResolvedValueOnce([{ id: "category-1", name: "الحبوب" }]);
    const onSaved = vi.fn();
    render(<ProductModal product={null} onClose={vi.fn()} onSaved={onSaved} />);
    fillRequiredFields();

    expect(await screen.findByRole("alert")).toHaveTextContent("فشل تحميل التصنيفات");
    const submit = screen.getByRole("button", { name: "حفظ المنتج" });
    expect(submit).toBeDisabled();
    expect(mocks.createProduct).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(screen.getByRole("option", { name: "الحبوب" })).toBeTruthy());
    expect(mocks.fetchCategories).toHaveBeenCalledTimes(2);
    expect(submit).toBeEnabled();

    fireEvent.change(screen.getByLabelText("التصنيف"), { target: { value: "category-1" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.createProduct).toHaveBeenCalledWith({
      name: "منتج الاختبار",
      name_en: null,
      item_code: "TEST-001",
      sku: null,
      barcode: null,
      base_price: 25,
      min_order_quantity: 1,
      order_quantity_multiple: 1,
      category_id: "category-1",
      is_featured: false,
      sort_order: 0,
      unit: "كرتون",
      status: "active",
    });
  });

  it("releases the create guard after a failed request so the user can retry", async () => {
    mocks.createProduct
      .mockRejectedValueOnce(new Error("تعذر حفظ المنتج"))
      .mockResolvedValueOnce(savedProduct);
    const onSaved = vi.fn();
    render(<ProductModal product={null} onClose={vi.fn()} onSaved={onSaved} />);
    fillRequiredFields();

    const submit = screen.getByRole("button", { name: "حفظ المنتج" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر حفظ المنتج");
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(submit);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.createProduct).toHaveBeenCalledTimes(2);
  });

  it("keeps update errors visible and allows retry after a failed update", async () => {
    mocks.updateProduct
      .mockRejectedValueOnce(new Error("تعذر تحديث المنتج"))
      .mockResolvedValueOnce(savedProduct);
    const onSaved = vi.fn();
    render(<ProductModal product={existingProduct} onClose={vi.fn()} onSaved={onSaved} />);

    const submit = screen.getByRole("button", { name: "حفظ المنتج" });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحديث المنتج");
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(submit);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(mocks.updateProduct).toHaveBeenCalledTimes(2);
    expect(mocks.updateProduct).toHaveBeenNthCalledWith(1, "product-created", {
      name: "منتج الاختبار",
      name_en: null,
      item_code: "TEST-001",
      sku: null,
      barcode: null,
      base_price: 25,
      min_order_quantity: 1,
      order_quantity_multiple: 1,
      category_id: null,
      is_featured: false,
      sort_order: 0,
      unit: "كرتون",
      status: "active",
    });
    expect(mocks.createProduct).not.toHaveBeenCalled();
  });
});
