import { describe, expect, it } from "vitest";
import { parseStorefrontCartProductDetailsRow } from "./storefront-catalog";

const baseRow = {
  id: "a2000000-0000-4000-8000-000000000001",
  name: "أرز بسمتي",
  item_code: "RICE-A",
  unit: "كيس",
  display_price: null,
  created_at: "2026-11-01T00:00:00.000Z",
  min_order_quantity: 2,
  order_quantity_multiple: 2,
  inventory: null,
};

describe("storefront catalog product freshness", () => {
  it("preserves the exact server updated_at timestamp for the product detail screen", () => {
    const updatedAt = "2026-11-19T08:15:00.000Z";
    const product = parseStorefrontCartProductDetailsRow({ ...baseRow, updated_at: updatedAt });
    expect(product.updated_at).toBe(updatedAt);
  });

  it("does not fabricate a freshness timestamp when the server omits it or returns an invalid value", () => {
    const withoutTimestamp = parseStorefrontCartProductDetailsRow(baseRow);
    const malformedTimestamp = parseStorefrontCartProductDetailsRow({
      ...baseRow,
      updated_at: "not-a-timestamp",
    });
    expect(withoutTimestamp).not.toHaveProperty("updated_at");
    expect(malformedTimestamp).not.toHaveProperty("updated_at");
  });
});
