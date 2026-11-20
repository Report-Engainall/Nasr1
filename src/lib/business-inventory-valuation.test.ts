import { describe, expect, it } from "vitest";

import { calculateBusinessInventoryValue } from "./business-inventory-valuation";

const products = [
  { id: "product-a", base_price: 12.5 },
  { id: "product-b", base_price: "4" },
];

describe("calculateBusinessInventoryValue", () => {
  it("preserves the base-price times selected-warehouse-available-quantity formula", () => {
    expect(calculateBusinessInventoryValue(products, [
      { product_id: "product-a", quantity_available: 3 },
      { product_id: "product-b", quantity_available: 10 },
    ], true)).toBe(77.5);
  });

  it("returns zero for a confirmed empty product set", () => {
    expect(calculateBusinessInventoryValue([], [], false)).toBe(0);
  });

  it("keeps valuation unavailable without an active warehouse", () => {
    expect(calculateBusinessInventoryValue(products, [], false)).toBeNull();
  });

  it("fails closed when any product balance is missing or malformed", () => {
    expect(calculateBusinessInventoryValue(products, [
      { product_id: "product-a", quantity_available: 3 },
    ], true)).toBeNull();
    expect(calculateBusinessInventoryValue(products, [
      { product_id: "product-a", quantity_available: 3 },
      { product_id: "product-b", quantity_available: "10" },
    ], true)).toBeNull();
  });

  it("fails closed for duplicate balance identities or invalid prices", () => {
    expect(calculateBusinessInventoryValue(products, [
      { product_id: "product-a", quantity_available: 3 },
      { product_id: "product-a", quantity_available: 4 },
      { product_id: "product-b", quantity_available: 10 },
    ], true)).toBeNull();
    expect(calculateBusinessInventoryValue([
      { id: "product-a", base_price: -1 },
    ], [{ product_id: "product-a", quantity_available: 1 }], true)).toBeNull();
  });

  it("ignores unrelated balance records but rejects unsafe totals", () => {
    expect(calculateBusinessInventoryValue(products, [
      { product_id: "product-a", quantity_available: 3 },
      { product_id: "product-b", quantity_available: 10 },
      { product_id: "orphan-product", quantity_available: 500 },
    ], true)).toBe(77.5);
    expect(calculateBusinessInventoryValue([
      { id: "product-a", base_price: Number.MAX_SAFE_INTEGER },
    ], [{ product_id: "product-a", quantity_available: 2 }], true)).toBeNull();
  });
});
