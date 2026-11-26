import { describe, expect, it } from "vitest";
import { parseStorefrontCatalogFilters } from "./storefront-catalog";

const brandId = "20000000-0000-4000-8000-000000000002";

describe("server-backed storefront catalog filters", () => {
  it("parses tenant-scoped brand and base/alternate sale-unit options", () => {
    expect(parseStorefrontCatalogFilters({
      brands: [{ id: brandId, name: "علامة الأغبري", name_en: "Aghbari" }],
      units: ["كيس", "كرتون"],
    })).toEqual({
      brands: [{ id: brandId, name: "علامة الأغبري", name_en: "Aghbari" }],
      units: ["كيس", "كرتون"],
    });
  });

  it("rejects incomplete, duplicate or malformed filter options", () => {
    expect(() => parseStorefrontCatalogFilters({ brands: [], units: "كيس" })).toThrow();
    expect(() => parseStorefrontCatalogFilters({
      brands: [{ id: "not-a-uuid", name: "علامة" }],
      units: [],
    })).toThrow();
    expect(() => parseStorefrontCatalogFilters({
      brands: [{ id: brandId, name: "علامة" }, { id: brandId, name: "علامة مكررة" }],
      units: [],
    })).toThrow();
    expect(() => parseStorefrontCatalogFilters({ brands: [], units: ["كيس", "كيس"] })).toThrow();
  });
});
