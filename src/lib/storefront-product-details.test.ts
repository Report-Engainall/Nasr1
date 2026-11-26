import { describe, expect, it } from "vitest";
import {
  EMPTY_ADMIN_STOREFRONT_PRODUCT_DETAILS,
  parseAdminStorefrontProductDetails,
  parseStorefrontProductFactsRow,
} from "@/lib/storefront-product-details";

const productId = "10000000-0000-4000-8000-000000000001";
const brandId = "20000000-0000-4000-8000-000000000002";
const alternativeId = "30000000-0000-4000-8000-000000000003";
const complementId = "40000000-0000-4000-8000-000000000004";

function publicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: productId,
    brand_id: brandId,
    brand: { id: brandId, name: "علامة موثقة", name_en: "Verified Brand" },
    country_of_origin_code: "YE",
    specifications: [{ name: "الوزن", value: "500", unit: "جم" }],
    packaging: {
      package_size_value: 500,
      package_size_unit: "جم",
      carton_unit_name: "كرتون",
      units_per_carton: 24,
    },
    alternatives: [{
      id: alternativeId,
      name: "منتج بديل",
      item_code: "ALT-01",
      unit: "قطعة",
      image_url: "https://cdn.example.test/alternative.webp",
      brand_name: null,
    }],
    complements: [{
      id: complementId,
      name: "منتج مكمل",
      item_code: "COMP-01",
      unit: "قطعة",
      image_url: null,
      brand_name: "علامة أخرى",
    }],
    // A future/over-broad server response cannot make private finance fields part of the view model.
    base_price: 999,
    cost_price: 123,
    margin: 876,
    tier_prices: [{ tier: "wholesale", price: 1 }],
    ...overrides,
  };
}

describe("storefront product facts contract", () => {
  it("parses only approved brand, origin, specifications, packaging and explicit relations", () => {
    const facts = parseStorefrontProductFactsRow(publicRow(), productId);
    expect(facts.brand).toEqual({ id: brandId, name: "علامة موثقة", name_en: "Verified Brand" });
    expect(facts.countryOfOriginCode).toBe("YE");
    expect(facts.specifications).toEqual([{ name: "الوزن", value: "500", unit: "جم" }]);
    expect(facts.packaging).toEqual({
      packageSizeValue: 500,
      packageSizeUnit: "جم",
      cartonUnitName: "كرتون",
      unitsPerCarton: 24,
    });
    expect(facts.alternatives.map((item) => item.id)).toEqual([alternativeId]);
    expect(facts.complements.map((item) => item.id)).toEqual([complementId]);
    expect(facts).not.toHaveProperty("base_price");
    expect(facts).not.toHaveProperty("cost_price");
    expect(facts).not.toHaveProperty("margin");
    expect(facts).not.toHaveProperty("tier_prices");
  });

  it("withholds signed, credential-bearing and non-HTTPS recommendation images", () => {
    const facts = parseStorefrontProductFactsRow(publicRow({
      alternatives: [{
        id: alternativeId,
        name: "منتج بديل",
        item_code: "ALT-01",
        unit: "قطعة",
        image_url: "https://cdn.example.test/alternative.webp?token=private-token",
        brand_name: null,
      }],
      complements: [{
        id: complementId,
        name: "منتج مكمل",
        item_code: "COMP-01",
        unit: "قطعة",
        image_url: "https://cdn.example.test/complement.webp?X-Amz-Signature=private-signature",
        brand_name: null,
      }],
    }), productId);

    expect(facts.alternatives[0]?.image_url).toBeNull();
    expect(facts.complements[0]?.image_url).toBeNull();
  });

  it("does not infer brands, origins or recommendations from missing values", () => {
    const facts = parseStorefrontProductFactsRow(publicRow({
      brand_id: null,
      brand: null,
      country_of_origin_code: null,
      specifications: [],
      packaging: null,
      alternatives: [],
      complements: [],
    }), productId);
    expect(facts.brand).toBeNull();
    expect(facts.countryOfOriginCode).toBeNull();
    expect(facts.specifications).toEqual([]);
    expect(facts.packaging).toBeNull();
    expect(facts.alternatives).toEqual([]);
    expect(facts.complements).toEqual([]);
  });

  it("rejects a mismatched product, malformed verified facts and malformed relations", () => {
    expect(() => parseStorefrontProductFactsRow(publicRow(), alternativeId)).toThrow();
    expect(() => parseStorefrontProductFactsRow(publicRow({
      specifications: [{ name: "", value: "500", unit: "جم" }],
    }), productId)).toThrow();
    expect(() => parseStorefrontProductFactsRow(publicRow({
      packaging: { package_size_value: -1, package_size_unit: "جم", carton_unit_name: null, units_per_carton: null },
    }), productId)).toThrow();
    expect(() => parseStorefrontProductFactsRow(publicRow({
      alternatives: [{ id: "not-a-uuid", name: "غير صالح" }],
    }), productId)).toThrow();
    expect(() => parseStorefrontProductFactsRow(publicRow({
      country_of_origin_code: "YEM",
    }), productId)).toThrow();
  });

  it("parses the management-only projection without returning finance fields", () => {
    const details = parseAdminStorefrontProductDetails({
      product_id: productId,
      brand_name: "علامة موثقة",
      brand_name_en: "Verified Brand",
      country_of_origin_code: "YE",
      origin_verified: true,
      specifications: [{ name: "الوزن", value: "500", unit: "جم" }],
      specifications_verified: true,
      package_size_value: "500",
      package_size_unit: "جم",
      carton_unit_name: "كرتون",
      packaging_verified: true,
      alternatives: [{ target_product_id: alternativeId, is_published: true, sort_order: 0 }],
      complements: [{ target_product_id: complementId, is_published: true, sort_order: 0 }],
      cost_price: 15,
      wholesale_price: 25,
    }, productId);
    expect(details.brandName).toBe("علامة موثقة");
    expect(details.originVerified).toBe(true);
    expect(details.packageSizeValue).toBe(500);
    expect(details.alternatives).toEqual([alternativeId]);
    expect(details.complements).toEqual([complementId]);
    expect(details).not.toHaveProperty("cost_price");
    expect(details).not.toHaveProperty("wholesale_price");
  });

  it("provides an empty, explicit starting state for new product details", () => {
    expect(EMPTY_ADMIN_STOREFRONT_PRODUCT_DETAILS).toEqual({
      brandName: "",
      brandNameEn: "",
      countryOfOriginCode: "",
      originVerified: false,
      specifications: [],
      specificationsVerified: false,
      packageSizeValue: null,
      packageSizeUnit: "",
      cartonUnitName: "",
      packagingVerified: false,
      alternatives: [],
      complements: [],
    });
  });
});
