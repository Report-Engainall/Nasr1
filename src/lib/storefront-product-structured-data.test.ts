import { describe, expect, it } from "vitest";
import {
  buildStorefrontProductStructuredData,
  serializeStorefrontProductStructuredData,
} from "./storefront-product-structured-data";

const base = {
  id: "product-123",
  name: "أرز بسمتي",
  description: "أرز فاخر",
  sku: "RICE-123",
  itemCode: "AG-RICE-123",
  categoryName: "الأرز",
  pageOrigin: "https://aghbari.example",
  imageUrls: [
    "https://cdn.example/rice.webp",
    "https://cdn.example/private.webp?token=secret",
    "javascript:alert(1)",
    "//cdn.example/protocol-relative.webp",
  ],
  priceVisible: false,
  displayPrice: 1200,
  availableQuantity: 30,
  minimumOrderQuantity: 1,
};

describe("storefront product structured data", () => {
  it("emits the current product public identity, category and safe images", () => {
    const result = buildStorefrontProductStructuredData(base);
    expect(result).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "أرز بسمتي",
      description: "أرز فاخر",
      sku: "RICE-123",
      category: "الأرز",
      url: "https://aghbari.example/product/product-123",
    });
    expect(result?.image).toEqual(["https://cdn.example/rice.webp"]);
    expect(result).not.toHaveProperty("offers");
    expect(result).not.toHaveProperty("review");
    expect(result).not.toHaveProperty("aggregateRating");
  });

  it("includes an offer only when the server-resolved price is visible", () => {
    const result = buildStorefrontProductStructuredData({
      ...base, priceVisible: true, displayPrice: 1200.5,
    });
    expect(result?.offers).toMatchObject({
      "@type": "Offer", price: "1200.5", priceCurrency: "YER",
      availability: "https://schema.org/InStock",
    });
  });

  it("does not invent availability when stock evidence is unknown", () => {
    const result = buildStorefrontProductStructuredData({
      ...base, priceVisible: true, availableQuantity: null,
    });
    expect(result?.offers).toMatchObject({ price: "1200", priceCurrency: "YER" });
    expect(result?.offers).not.toHaveProperty("availability");
  });

  it("maps confirmed stock and minimum order evidence to Schema.org availability", () => {
    const out = buildStorefrontProductStructuredData({
      ...base, priceVisible: true, availableQuantity: 0,
    });
    const limited = buildStorefrontProductStructuredData({
      ...base, priceVisible: true, availableQuantity: 2, minimumOrderQuantity: 5,
    });
    expect(out?.offers).toMatchObject({ availability: "https://schema.org/OutOfStock" });
    expect(limited?.offers).toMatchObject({ availability: "https://schema.org/LimitedAvailability" });
  });

  it("omits invalid, hidden or inaccessible prices rather than encoding zero", () => {
    for (const displayPrice of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      const result = buildStorefrontProductStructuredData({ ...base, priceVisible: true, displayPrice });
      expect(result).not.toHaveProperty("offers");
    }
    expect(buildStorefrontProductStructuredData({ ...base, priceVisible: false })).not.toHaveProperty("offers");
  });

  it("rejects invalid product identity", () => {
    expect(buildStorefrontProductStructuredData({ ...base, id: " " })).toBeNull();
    expect(buildStorefrontProductStructuredData({ ...base, name: "" })).toBeNull();
  });

  it("escapes script-closing markup and preserves the parsed text value", () => {
    const result = buildStorefrontProductStructuredData({
      ...base, name: "</script><script>alert(1)</script>",
    });
    expect(result).not.toBeNull();
    const serialized = serializeStorefrontProductStructuredData(result!);
    expect(serialized).not.toContain("</script>");
    expect(JSON.parse(serialized).name).toBe("alert(1)");
  });

  it("resolves safe same-origin image paths and rejects protocol-relative paths", () => {
    const result = buildStorefrontProductStructuredData({
      ...base, imageUrls: ["/storage/products/rice.webp", "//cdn.example/rice.webp"],
    });
    expect(result?.image).toEqual(["https://aghbari.example/storage/products/rice.webp"]);
  });
});
