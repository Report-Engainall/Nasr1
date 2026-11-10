import { describe, expect, it } from "vitest";
import { matchProductImagesByCode, productImageItemCodeFromFilename } from "./product-image-batch-match";

const file = (name: string) => ({ name });

const product = (overrides: Partial<{
  id: string;
  item_code: string;
  name: string;
  image_url: string | null;
  image_gallery_urls: readonly string[];
}> = {}) => ({
  id: "product-1",
  item_code: "000125",
  name: "أرز بسمتي",
  image_url: null,
  image_gallery_urls: [],
  ...overrides,
});

describe("product image filename matching", () => {
  it("preserves leading zeros in exact item-code matches", () => {
    expect(productImageItemCodeFromFilename("000125.jpg")).toBe("000125");
    const [entry] = matchProductImagesByCode([product()], [file("000125.jpg")]);
    expect(entry.status).toBe("ready");
    expect(entry.product?.id).toBe("product-1");
    expect(entry.placement).toBe("primary");
  });

  it("matches numbered extra images only after an exact-code lookup fails", () => {
    const entries = matchProductImagesByCode(
      [product()],
      [file("000125__2.png"), file("000125 (3).webp")],
    );
    expect(entries.every((entry) => entry.status === "ready")).toBe(true);
    expect(entries.map((entry) => entry.placement)).toEqual(["gallery", "primary"]);
  });

  it("prefers an exact product code that itself ends with a number suffix", () => {
    const exact = product({ id: "exact", item_code: "ABC-2" });
    const base = product({ id: "base", item_code: "ABC" });
    const [entry] = matchProductImagesByCode([base, exact], [file("ABC-2.jpg")]);
    expect(entry.product?.id).toBe("exact");
    expect(entry.placement).toBe("primary");
  });

  it("refuses duplicate product codes instead of guessing", () => {
    const entries = matchProductImagesByCode(
      [product({ id: "one" }), product({ id: "two" })],
      [file("000125.jpg")],
    );
    expect(entries[0].status).toBe("ambiguous");
    expect(entries[0].product).toBeNull();
  });

  it("never replaces an existing primary image and enforces the eight-image gallery limit", () => {
    const existing = product({
      image_url: "https://example.invalid/current.webp",
      image_gallery_urls: Array.from({ length: 7 }, (_, index) => "https://example.invalid/" + index + ".webp"),
    });
    const entries = matchProductImagesByCode(
      [existing],
      [file("000125.jpg"), file("000125.png")],
    );
    expect(entries.filter((entry) => entry.status === "ready").map((entry) => entry.placement))
      .toEqual(["gallery"]);
    expect(entries.filter((entry) => entry.status === "gallery_limit")).toHaveLength(1);
  });

  it("reports unmatched image codes and unsupported filenames", () => {
    const entries = matchProductImagesByCode([product()], [file("999999.jpeg"), file("photo")]);
    expect(entries.map((entry) => entry.status)).toEqual(["unmatched", "unmatched"]);
  });
});
