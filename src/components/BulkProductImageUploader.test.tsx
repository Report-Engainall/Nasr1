// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import {
  BulkProductImageUploader,
  buildMissingProductImagesCsv,
  buildProductImageBatchReportCsv,
  formatProductImageFileSize,
  getProductImageCoverage,
  getProductsMissingPrimaryImage,
} from "./BulkProductImageUploader";
import { uploadProductImage } from "@/lib/api";
import { toWebp } from "@/lib/product-image";
import type { ProductWithInventory } from "@/lib/types";

vi.mock("@/lib/api", () => ({
  uploadProductGalleryImage: vi.fn(),
  uploadProductImage: vi.fn(),
}));

vi.mock("@/lib/product-image", () => ({
  toWebp: vi.fn(),
  validateProductImageFile: vi.fn(() => null),
}));

afterEach(() => cleanup());

function renderUploader(loadProducts: () => Promise<ProductWithInventory[]>, catalogRevision = 0) {
  return render(
    <BulkProductImageUploader
      loadProducts={loadProducts}
      catalogRevision={catalogRevision}
      canManage
      onUploaded={vi.fn()}
    />,
  );
}

describe("BulkProductImageUploader lazy catalog loading", () => {
  it("starts only one upload when the same batch is double-clicked before React rerenders", async () => {
    let resolveConversion: ((image: Blob) => void) | undefined;
    vi.mocked(toWebp).mockReturnValue(
      new Promise<Blob>((resolve) => { resolveConversion = resolve; }),
    );
    vi.mocked(uploadProductImage).mockResolvedValue("https://cdn.example.test/product.webp");

    const product = {
      id: "product-1",
      name: "Rice",
      item_code: "000125",
      image_url: null,
      image_gallery_urls: [],
    } as unknown as ProductWithInventory;
    const loadProducts = vi.fn().mockResolvedValue([product]);
    const onUploaded = vi.fn();
    const { container } = render(
      <BulkProductImageUploader
        loadProducts={loadProducts}
        catalogRevision={0}
        canManage
        onUploaded={onUploaded}
      />,
    );

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle", { bubbles: true }));
    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));

    const file = new File(["source"], "000125.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("اختر عدة صور (JPG / PNG / WebP)"), {
      target: { files: [file] },
    });

    const uploadButton = screen.getByRole("button", { name: "رفع الصور المطابقة" });
    await act(async () => {
      uploadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      uploadButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(toWebp).toHaveBeenCalledTimes(1);
    expect(uploadProductImage).not.toHaveBeenCalled();
    const progress = screen.getByRole("progressbar");
    expect(progress.getAttribute("aria-valuemin")).toBe("0");
    expect(progress.getAttribute("aria-valuemax")).toBe("1");
    expect(progress.getAttribute("aria-valuenow")).toBe("0");

    await act(async () => {
      resolveConversion?.(new Blob(["webp"], { type: "image/webp" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(uploadProductImage).toHaveBeenCalledTimes(1));
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "تصدير نتائج الدفعة الحالية (CSV)" })).toBeTruthy();
  });


  it("does not fetch the full catalog until the image tool is expanded", async () => {
    const loadProducts = vi.fn().mockResolvedValue([]);
    const { container } = renderUploader(loadProducts);

    expect(loadProducts).not.toHaveBeenCalled();

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle", { bubbles: true }));

    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));
    expect((screen.getByLabelText("اختر عدة صور (JPG / PNG / WebP)") as HTMLInputElement).disabled).toBe(false);
  });

  it("refreshes its matching catalog when the parent catalog revision changes while expanded", async () => {
    const loadProducts = vi.fn().mockResolvedValue([]);
    const { container, rerender } = renderUploader(loadProducts, 0);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle", { bubbles: true }));
    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));

    rerender(
      <BulkProductImageUploader
        loadProducts={loadProducts}
        catalogRevision={1}
        canManage
        onUploaded={vi.fn()}
      />,
    );

    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(2));
  });

  it("keeps image selection disabled when the full catalog cannot be verified", async () => {
    const loadProducts = vi.fn().mockRejectedValue(new Error("catalog unavailable"));
    const { container } = renderUploader(loadProducts);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle", { bubbles: true }));

    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("catalog unavailable"));
    expect((screen.getByLabelText("اختر عدة صور (JPG / PNG / WebP)") as HTMLInputElement).disabled).toBe(true);
  });
});


describe("product image batch result report", () => {
  it("formats file sizes without inventing values for invalid input", () => {
    expect(formatProductImageFileSize(0)).toBe("0 بايت");
    expect(formatProductImageFileSize(1024)).toBe("1 ك.بايت");
    expect(formatProductImageFileSize(1536)).toBe("1.5 ك.بايت");
    expect(formatProductImageFileSize(Number.NaN)).toBe("غير معروف");
    expect(formatProductImageFileSize(-1)).toBe("غير معروف");
  });

  it("exports the current results as UTF-8 CSV and neutralizes spreadsheet formulas", () => {
    const csv = buildProductImageBatchReportCsv([
      {
        fileName: '=HYPERLINK("https://example.test","open")',
        productName: "أرز, بسمتي",
        placement: "primary",
        ok: true,
        message: "تم الربط بنجاح",
      },
      {
        fileName: "000126__2.png",
        productName: "صنف آخر",
        placement: "gallery",
        ok: false,
        message: 'تعذر الرفع\r\n"راجع الصلاحية"',
      },
    ]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"أرز, بسمتي"');
    expect(csv).toContain(`"'=HYPERLINK(""https://example.test"",""open"")"`);
    expect(csv).toContain('"تعذر الرفع  ""راجع الصلاحية"""');
    expect(csv.split("\r\n")).toHaveLength(3);
  });
});


describe("product image coverage and direct completion", () => {
  const completeProduct = {
    id: "product-complete",
    name: "أرز كامل",
    item_code: "000100",
    image_url: "https://cdn.example.test/primary.webp",
    image_gallery_urls: ["https://cdn.example.test/side.webp", "https://cdn.example.test/side.webp"],
  } as unknown as ProductWithInventory;
  const missingProduct = {
    id: "product-missing",
    name: "أرز ناقص",
    item_code: "000101",
    image_url: null,
    image_gallery_urls: [],
    category: { name: "الأرز" },
  } as unknown as ProductWithInventory;

  it("calculates coverage from actual valid image URLs and deduplicates gallery URLs", () => {
    expect(getProductImageCoverage([completeProduct, missingProduct])).toEqual({
      totalProducts: 2,
      primaryImageCount: 1,
      missingPrimaryCount: 1,
      galleryImageCount: 1,
      completionPercentage: 50,
    });
    expect(getProductsMissingPrimaryImage([completeProduct, missingProduct])).toEqual([missingProduct]);
  });

  it("exports only missing primary-image products and neutralizes spreadsheet formulas", () => {
    const csv = buildMissingProductImagesCsv([
      missingProduct,
      { ...missingProduct, id: "formula", item_code: "=1+1", name: "+SUM(A1:A2)" } as ProductWithInventory,
      completeProduct,
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'+SUM(A1:A2)");
    expect(csv.split("\\r\\n")).toHaveLength(3);
  });

  it("uploads a selected image directly as the primary image for a product with no primary image", async () => {
    const converted = new Blob(["webp"], { type: "image/webp" });
    vi.mocked(toWebp).mockResolvedValue(converted);
    vi.mocked(uploadProductImage).mockResolvedValue("https://cdn.example.test/new-primary.webp");
    const loadProducts = vi.fn().mockResolvedValue([missingProduct]);
    const onUploaded = vi.fn();
    const onOpenProduct = vi.fn();
    const { container } = render(
      <BulkProductImageUploader
        loadProducts={loadProducts}
        catalogRevision={0}
        canManage
        onUploaded={onUploaded}
        onOpenProduct={onOpenProduct}
      />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle", { bubbles: true }));
    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("اختيار صورة رئيسية للصنف أرز ناقص"), {
      target: { files: [new File(["source"], "rice.webp", { type: "image/webp" })] },
    });
    fireEvent.click(screen.getByRole("button", { name: "رفع كصورة رئيسية للصنف أرز ناقص" }));

    await waitFor(() => expect(uploadProductImage).toHaveBeenCalledWith(
      "product-missing",
      converted,
      null,
    ));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith("تم ربط الصورة الرئيسية بالصنف أرز ناقص بنجاح."));
    expect(screen.getByText("كل الأصناف المحمّلة لديها صورة رئيسية صالحة.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "رفع كصورة رئيسية للصنف أرز ناقص" })).not.toBeInTheDocument();

    // Product opening remains an explicit, separate action from the image upload.
    // It is tested with the same catalog entry before its upload in a dedicated render below.
    expect(onOpenProduct).not.toHaveBeenCalled();
  });

  it("blocks duplicate direct image upload clicks before React commits the busy state", async () => {
    let resolveConversion: ((image: Blob) => void) | undefined;
    vi.mocked(toWebp).mockReturnValue(
      new Promise<Blob>((resolve) => { resolveConversion = resolve; }),
    );
    vi.mocked(uploadProductImage).mockResolvedValue("https://cdn.example.test/once.webp");
    const loadProducts = vi.fn().mockResolvedValue([missingProduct]);
    const { container } = renderUploader(loadProducts);
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle", { bubbles: true }));
    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));

    fireEvent.change(screen.getByLabelText("اختيار صورة رئيسية للصنف أرز ناقص"), {
      target: { files: [new File(["source"], "rice.webp", { type: "image/webp" })] },
    });
    const button = screen.getByRole("button", { name: "رفع كصورة رئيسية للصنف أرز ناقص" });
    await act(async () => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(toWebp).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConversion?.(new Blob(["webp"], { type: "image/webp" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(uploadProductImage).toHaveBeenCalledTimes(1));
  });

  it("opens the existing product editor from the missing-image queue without duplicating the editor", async () => {
    const loadProducts = vi.fn().mockResolvedValue([missingProduct]);
    const onOpenProduct = vi.fn();
    const { container } = render(
      <BulkProductImageUploader
        loadProducts={loadProducts}
        catalogRevision={0}
        canManage
        onUploaded={vi.fn()}
        onOpenProduct={onOpenProduct}
      />,
    );
    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle", { bubbles: true }));
    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "فتح تحرير الصنف أرز ناقص" }));
    expect(onOpenProduct).toHaveBeenCalledWith(missingProduct);
  });
});
