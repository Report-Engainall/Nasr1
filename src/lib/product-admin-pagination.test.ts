import { describe, expect, it } from "vitest";

import { buildProductAdminSearchFilter, isValidProductAdminCategoryId } from "./product-admin-pagination";

describe("buildProductAdminSearchFilter", () => {
  it("searches Arabic and Latin text across the four supported product identifiers", () => {
    expect(buildProductAdminSearchFilter(" أرز Basmati 000125 ")).toBe(
      "name.ilike.*أرز Basmati 000125*,item_code.ilike.*أرز Basmati 000125*,sku.ilike.*أرز Basmati 000125*,barcode.ilike.*أرز Basmati 000125*",
    );
  });

  it("preserves literal underscores in product identifiers", () => {
    expect(buildProductAdminSearchFilter("ABC_125")).toContain("item_code.ilike.*ABC\\_125*");
  });

  it("removes PostgREST syntax delimiters and user wildcards before composing the OR filter", () => {
    const filter = buildProductAdminSearchFilter('x),organization_id.eq.anything,*%_"');
    const clauses = filter?.split(",") ?? [];
    expect(clauses).toHaveLength(4);
    expect(clauses.every((clause) => clause.endsWith("ilike.*x organization\\_id.eq.anything \\_*"))).toBe(true);
    expect(filter).not.toContain("(");
    expect(filter).not.toContain(")");
    expect(filter).not.toContain("%");
    expect(filter).not.toContain('"');
  });

  it("returns null for an empty or entirely unsupported term", () => {
    expect(buildProductAdminSearchFilter("   ")).toBeNull();
    expect(buildProductAdminSearchFilter("(),%*")).toBeNull();
  });

  it("rejects an excessive search term", () => {
    expect(() => buildProductAdminSearchFilter("a".repeat(101))).toThrow("طويلة جدًا");
  });
});


describe("isValidProductAdminCategoryId", () => {
  it("accepts a canonical category UUID", () => {
    expect(isValidProductAdminCategoryId("2c4a6e80-1234-4abc-8def-1234567890ab")).toBe(true);
  });

  it("rejects malformed, padded and non-string identifiers", () => {
    expect(isValidProductAdminCategoryId("not-a-uuid")).toBe(false);
    expect(isValidProductAdminCategoryId(" 2c4a6e80-1234-4abc-8def-1234567890ab")).toBe(false);
    expect(isValidProductAdminCategoryId(null)).toBe(false);
  });
});
