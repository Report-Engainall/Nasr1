// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applyStorefrontProductHeadMetadata,
  buildStorefrontProductHeadMetadata,
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


describe("storefront product head metadata", () => {
  beforeEach(() => {
    document.head.innerHTML = '<title>كتالوج الأغبري</title><meta name="description" content="وصف الكتالوج">';
  });

  afterEach(() => {
    document.head.innerHTML = "";
  });

  it("builds a product title, safe canonical URL and public share image without adding price fields", () => {
    const structuredData = buildStorefrontProductStructuredData(base);
    const metadata = buildStorefrontProductHeadMetadata(structuredData);
    expect(metadata).toEqual({
      title: "أرز بسمتي | متجر الأغبري",
      description: "أرز فاخر",
      canonicalUrl: "https://aghbari.example/product/product-123",
      imageUrl: "https://cdn.example/rice.webp",
    });
    expect(Object.keys(metadata ?? {}).sort()).toEqual(["canonicalUrl", "description", "imageUrl", "title"]);
  });

  it("rejects unsafe canonical and image URLs and provides a useful description fallback", () => {
    const structuredData = buildStorefrontProductStructuredData({
      ...base,
      description: null,
      imageUrls: ["https://cdn.example/private.webp?token=secret"],
    })!;
    const metadata = buildStorefrontProductHeadMetadata({
      ...structuredData,
      url: "http://aghbari.example/product/product-123?preview=1",
    });
    expect(metadata).toMatchObject({
      title: "أرز بسمتي | متجر الأغبري",
      description: "تفاصيل المنتج وبيانات العبوة والوحدات المتاحة في متجر الأغبري.",
      canonicalUrl: null,
      imageUrl: null,
    });
    expect(buildStorefrontProductHeadMetadata({ ...structuredData, name: "<script></script>" })).toBeNull();
  });

  it("applies product metadata and restores existing tags when the detail view closes", () => {
    const structuredData = buildStorefrontProductStructuredData(base);
    const metadata = buildStorefrontProductHeadMetadata(structuredData)!;
    const cleanupMetadata = applyStorefrontProductHeadMetadata(metadata, document);

    expect(document.title).toBe("أرز بسمتي | متجر الأغبري");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("أرز فاخر");
    expect(document.querySelector('meta[property="og:type"]')?.getAttribute("content")).toBe("product");
    expect(document.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://cdn.example/rice.webp");
    expect(document.querySelector('meta[name="twitter:card"]')?.getAttribute("content")).toBe("summary_large_image");
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://aghbari.example/product/product-123");

    cleanupMetadata();
    expect(document.title).toBe("كتالوج الأغبري");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("وصف الكتالوج");
    expect(document.querySelector('meta[property="og:type"]')).toBeNull();
    expect(document.querySelector('meta[property="og:image"]')).toBeNull();
    expect(document.querySelector('link[rel="canonical"]')).toBeNull();
  });

  it("does not overwrite a newer route head update during cleanup", () => {
    const metadata = buildStorefrontProductHeadMetadata(buildStorefrontProductStructuredData(base))!;
    const cleanupMetadata = applyStorefrontProductHeadMetadata(metadata, document);
    document.title = "المنتجات | متجر الأغبري";
    document.querySelector('meta[name="description"]')?.setAttribute("content", "وصف صفحة المنتجات");
    cleanupMetadata();

    expect(document.title).toBe("المنتجات | متجر الأغبري");
    expect(document.querySelector('meta[name="description"]')?.getAttribute("content")).toBe("وصف صفحة المنتجات");
  });
});
