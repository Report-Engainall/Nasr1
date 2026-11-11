// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { BulkProductImageUploader } from "./BulkProductImageUploader";

vi.mock("@/lib/api", () => ({
  uploadProductGalleryImage: vi.fn(),
  uploadProductImage: vi.fn(),
}));

vi.mock("@/lib/product-image", () => ({
  toWebp: vi.fn(),
  validateProductImageFile: vi.fn(() => null),
}));

afterEach(() => cleanup());

function renderUploader(loadProducts: () => Promise<never[]>, catalogRevision = 0) {
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
  it("does not fetch the full catalog until the image tool is expanded", async () => {
    const loadProducts = vi.fn().mockResolvedValue([]);
    const { container } = renderUploader(loadProducts);

    expect(loadProducts).not.toHaveBeenCalled();

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle"));

    await waitFor(() => expect(loadProducts).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText("اختر عدة صور (JPG / PNG / WebP)")).not.toBeDisabled();
  });

  it("refreshes its matching catalog when the parent catalog revision changes while expanded", async () => {
    const loadProducts = vi.fn().mockResolvedValue([]);
    const { container, rerender } = renderUploader(loadProducts, 0);

    const details = container.querySelector("details");
    expect(details).not.toBeNull();
    details!.open = true;
    fireEvent(details!, new Event("toggle"));
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
    fireEvent(details!, new Event("toggle"));

    await screen.findByText("catalog unavailable");
    expect(screen.getByLabelText("اختر عدة صور (JPG / PNG / WebP)")).toBeDisabled();
  });
});
