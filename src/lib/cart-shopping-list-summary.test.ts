import { describe, expect, it } from "vitest";
import { cartLineSetsMatch, groupCartLinesByCategory, summarizeCartLines } from "./cart-shopping-list-summary";

const lines = [
  { product_id: "a", quantity: 4 },
  { product_id: "b", quantity: 7 },
  { product_id: "c", quantity: 2 },
];
const products = [
  { id: "a", name: "أرز", unit: "كيس", category_id: "grain" },
  { id: "b", name: "سكر", unit: "كيس", category_id: "grain" },
  { id: "c", name: "زيت", unit: "لتر", category_id: "oil" },
];
const categories = [
  { id: "grain", name: "الحبوب" },
  { id: "oil", name: "الزيوت" },
];

describe("cart category summary", () => {
  it("counts unique lines and sums requested quantities without inventing a common unit", () => {
    expect(summarizeCartLines(lines)).toEqual({ skuCount: 3, totalQuantity: 13 });
  });

  it("groups every cart line by its catalog category and preserves quantities", () => {
    const groups = groupCartLinesByCategory(lines, products, categories);
    expect(groups.map((group) => group.categoryName)).toEqual(["الحبوب", "الزيوت"]);
    expect(groups[0].items.map((item) => [item.productName, item.quantity, item.unit])).toEqual([
      ["أرز", 4, "كيس"],
      ["سكر", 7, "كيس"],
    ]);
    expect(groups[1].items).toHaveLength(1);
  });

  it("keeps unresolved products visible under an explicit unknown category", () => {
    const groups = groupCartLinesByCategory(
      [{ product_id: "missing", quantity: 3 }],
      [],
      [],
    );
    expect(groups[0].categoryName).toBe("غير مصنف");
    expect(groups[0].items[0].productName).toBe("صنف لم يعد متاحًا");
    expect(groups[0].items[0].quantity).toBe(3);
  });
});


describe("cart local/server synchronization guard", () => {
  it("accepts the same draft regardless of line ordering or UUID letter case", () => {
    expect(cartLineSetsMatch(
      [{ product_id: "A", quantity: 2 }, { product_id: "B", quantity: 5 }],
      [{ product_id: "b", quantity: 5 }, { product_id: "a", quantity: 2 }],
    )).toBe(true);
  });

  it("rejects a locally pending quantity or product change", () => {
    expect(cartLineSetsMatch(
      [{ product_id: "a", quantity: 2 }],
      [{ product_id: "a", quantity: 3 }],
    )).toBe(false);
    expect(cartLineSetsMatch(
      [{ product_id: "a", quantity: 2 }],
      [{ product_id: "b", quantity: 2 }],
    )).toBe(false);
  });
});
