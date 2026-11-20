import { describe, expect, it } from "vitest";
import {
  normalizeShoppingListImportQuantity,
  resolveShoppingListImportProduct,
} from "@/lib/customer-shopping-lists-xlsx";

const products = [
  { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", name: "أرز", item_code: "RICE-1", sku: "SKU-1", barcode: "6280001", unit: "كيس" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "سكر", item_code: "SUGAR-2", sku: null, barcode: null, unit: "كيس" },
];

describe("shopping-list Excel import normalization", () => {
  it("normalizes Arabic-Indic digits and grouped whole quantities", () => {
    expect(normalizeShoppingListImportQuantity("١٬٢٥٠")).toBe(1250);
    expect(normalizeShoppingListImportQuantity("10,000")).toBe(10000);
  });

  it("rejects fractional, zero, over-limit and malformed thousand separators", () => {
    expect(() => normalizeShoppingListImportQuantity("1,00")).toThrow("فواصل الآلاف");
    expect(() => normalizeShoppingListImportQuantity("10٬00")).toThrow("فواصل الآلاف");
    expect(() => normalizeShoppingListImportQuantity("1.5")).toThrow("أعدادًا صحيحة");
    expect(() => normalizeShoppingListImportQuantity("0")).toThrow("بين 1 و10000");
    expect(() => normalizeShoppingListImportQuantity("10001")).toThrow("بين 1 و10000");
  });

  it("matches exact SKU, item code or barcode only", () => {
    expect(resolveShoppingListImportProduct("sku-1", products).id).toBe(products[0].id);
    expect(resolveShoppingListImportProduct("6280001", products).id).toBe(products[0].id);
    expect(() => resolveShoppingListImportProduct("RICE", products)).toThrow("لم يتم العثور");
  });

  it("rejects duplicated catalog identifiers instead of guessing the product", () => {
    const ambiguous = [...products, { ...products[1], id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", item_code: "OTHER", barcode: "6280001" }];
    expect(() => resolveShoppingListImportProduct("6280001", ambiguous)).toThrow("أكثر من منتج");
  });
});
