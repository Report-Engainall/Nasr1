import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_RECENTLY_VIEWED_PRODUCTS,
  clearRecentlyViewedProducts,
  normalizeRecentlyViewedProducts,
  readRecentlyViewedProducts,
  recentlyViewedProductsStorageKey,
  recordRecentlyViewedProduct,
  removeRecentlyViewedProduct,
} from "./recently-viewed-products";

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

const viewedAt = "2026-11-13T03:00:00.000Z";
const customerA = "11111111-1111-4111-8111-111111111111";
const customerB = "22222222-2222-4222-8222-222222222222";

describe("recently viewed product history", () => {
  let storage: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    storage = createMemoryStorage();
  });

  it("stores only public product details under the current customer profile", () => {
    expect(recordRecentlyViewedProduct(storage, customerA, {
      id: "product-1",
      name: "هاتف تجريبي",
      itemCode: "PHONE-1",
      imageUrl: "https://cdn.example.test/phone.webp",
    }, viewedAt)).toBe(true);

    const saved = readRecentlyViewedProducts(storage, customerA);
    expect(saved).toEqual([{
      id: "product-1",
      name: "هاتف تجريبي",
      itemCode: "PHONE-1",
      imageUrl: "https://cdn.example.test/phone.webp",
      viewedAt,
    }]);
    expect(JSON.stringify(saved)).not.toMatch(/price|cost|margin|stock|tenant|customer/i);
    expect(readRecentlyViewedProducts(storage, customerB)).toEqual([]);
  });

  it("moves a revisited product to the front without creating duplicates", () => {
    recordRecentlyViewedProduct(storage, customerA, { id: "one", name: "الأول" }, viewedAt);
    recordRecentlyViewedProduct(storage, customerA, { id: "two", name: "الثاني" }, viewedAt);
    recordRecentlyViewedProduct(storage, customerA, { id: "one", name: "الأول بعد التحديث" }, "2026-11-13T03:05:00.000Z");

    const saved = readRecentlyViewedProducts(storage, customerA);
    expect(saved.map((item) => item.id)).toEqual(["one", "two"]);
    expect(saved[0]?.name).toBe("الأول بعد التحديث");
  });

  it("bounds the history and rejects malformed or credential-bearing records", () => {
    for (let index = 0; index < MAX_RECENTLY_VIEWED_PRODUCTS + 4; index += 1) {
      expect(recordRecentlyViewedProduct(storage, customerA, {
        id: `product-${index}`,
        name: `صنف ${index}`,
      }, viewedAt)).toBe(true);
    }
    expect(readRecentlyViewedProducts(storage, customerA)).toHaveLength(MAX_RECENTLY_VIEWED_PRODUCTS);

    const normalized = normalizeRecentlyViewedProducts([
      { id: "bad-scheme", name: "خطر", imageUrl: "javascript:alert(1)", viewedAt },
      { id: "signed", name: "رابط موقع", imageUrl: "https://cdn.example.test/a.png?token=secret", viewedAt },
      { id: "valid", name: "صالح", imageUrl: "/storage/public/a.png", viewedAt },
      { id: "invalid-date", name: "تاريخ غير صالح", viewedAt: "not-a-date" },
    ]);
    expect(normalized).toHaveLength(3);
    expect(normalized[0]?.imageUrl).toBeNull();
    expect(normalized[1]?.imageUrl).toBe("/storage/public/a.png");
    expect(normalized[2]?.id).toBe("valid");
  });

  it("ignores corrupt storage and invalid identities", () => {
    const key = recentlyViewedProductsStorageKey(customerA);
    storage.setItem(key, "{invalid");
    expect(readRecentlyViewedProducts(storage, customerA)).toEqual([]);
    expect(recordRecentlyViewedProduct(storage, " ", { id: "p", name: "منتج" }, viewedAt)).toBe(false);
    expect(recordRecentlyViewedProduct(storage, customerA, { id: "", name: "منتج" }, viewedAt)).toBe(false);
  });

  it("supports removing one product and clearing one account only", () => {
    recordRecentlyViewedProduct(storage, customerA, { id: "one", name: "الأول" }, viewedAt);
    recordRecentlyViewedProduct(storage, customerA, { id: "two", name: "الثاني" }, viewedAt);
    recordRecentlyViewedProduct(storage, customerB, { id: "other", name: "حساب آخر" }, viewedAt);

    expect(removeRecentlyViewedProduct(storage, customerA, "one")).toBe(true);
    expect(readRecentlyViewedProducts(storage, customerA).map((item) => item.id)).toEqual(["two"]);
    expect(clearRecentlyViewedProducts(storage, customerA)).toBe(true);
    expect(readRecentlyViewedProducts(storage, customerA)).toEqual([]);
    expect(readRecentlyViewedProducts(storage, customerB).map((item) => item.id)).toEqual(["other"]);
  });
});
