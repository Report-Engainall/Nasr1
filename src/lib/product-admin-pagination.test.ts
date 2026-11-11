import { describe, expect, it } from "vitest";

import { buildProductAdminSearchFilter } from "./product-admin-pagination";

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
    expect(filter).not.toContain(",");
    expect(filter).not.toContain("(");
    expect(filter).not.toContain(")");
    expect(filter).not.toContain("%");
    expect(filter).not.toContain('"');
    expect(filter).toContain("name.ilike.*x organization_id.eq.anything*");
  });

  it("returns null for an empty or entirely unsupported term", () => {
    expect(buildProductAdminSearchFilter("   ")).toBeNull();
    expect(buildProductAdminSearchFilter("(),%*")).toBeNull();
  });

  it("rejects an excessive search term", () => {
    expect(() => buildProductAdminSearchFilter("a".repeat(101))).toThrow("طويلة جدًا");
  });
});
