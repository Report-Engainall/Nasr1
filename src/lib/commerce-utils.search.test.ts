import { describe, expect, it } from "vitest";
import {
  matchesArabicCatalogSearch,
  normalizeArabicSearchText,
  normalizeCatalogSearchQuery,
} from "./commerce-utils";

describe("storefront catalogue search", () => {
  it("normalizes Arabic-Indic and Persian digits before sending search terms to the catalog RPC", () => {
    expect(normalizeCatalogSearchQuery("باركود ٦٢٩١٠٤١٥٠٠٢١٣")).toBe("باركود 6291041500213");
    expect(normalizeCatalogSearchQuery("SKU-۶۲۹۱۰۴")).toBe("SKU-629104");
  });

  it("normalizes localized digits consistently in local matching", () => {
    expect(normalizeArabicSearchText("SKU-٦٢٩")).toBe("sku 629");
    expect(normalizeArabicSearchText("SKU-۶۲۹")).toBe("sku 629");
  });

  it("matches product SKU by exact value and prefix", () => {
    const product = { name: "زيت دوار الشمس", item_code: "OIL-001", sku: "SKU-AGH/24", barcode: "6291041500213" };
    expect(matchesArabicCatalogSearch(product, "SKU-AGH/24")).toBe(true);
    expect(matchesArabicCatalogSearch(product, "sku-agh")).toBe(true);
  });

  it("matches SKU when the stored identifier and query use localized numerals", () => {
    expect(matchesArabicCatalogSearch(
      { name: "سكر", sku: "SKU-٢٤٠" },
      "SKU-240",
    )).toBe(true);
    expect(matchesArabicCatalogSearch(
      { name: "سكر", sku: "SKU-240" },
      "SKU-٢٤",
    )).toBe(true);
  });

  it("keeps barcode and item-code prefix matching while supporting SKU", () => {
    const product = { name: "أرز بسمتي", item_code: "RICE-007", sku: "AGH-R007", barcode: "6291041500213" };
    expect(matchesArabicCatalogSearch(product, "RICE-00")).toBe(true);
    expect(matchesArabicCatalogSearch(product, "AGH-R0")).toBe(true);
    expect(matchesArabicCatalogSearch(product, "62910415")).toBe(true);
  });
});
