// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { BulkProductImageUploader } from "./BulkProductImageUploader";
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

    await act(async () => {
      resolveConversion?.(new Blob(["webp"], { type: "image/webp" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(uploadProductImage).toHaveBeenCalledTimes(1));
    expect(onUploaded).toHaveBeenCalledTimes(1);
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
