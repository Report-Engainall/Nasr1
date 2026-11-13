import { describe, expect, it } from "vitest";
import {
  MAX_RECENTLY_VIEWED_PRODUCTS,
  moveRecentlyViewedProductToFront,
  recentlyViewedProductsStorageKey,
} from "./storefront-recently-viewed";

describe("storefront recently viewed history", () => {
  it("isolates histories by profile, user and guest identity", () => {
    const firstProfile = recentlyViewedProductsStorageKey("profile-a", "user-a");
    const secondProfile = recentlyViewedProductsStorageKey("profile-b", "user-a");
    const userOnly = recentlyViewedProductsStorageKey(null, "user-a");
    const guest = recentlyViewedProductsStorageKey(null, null);

    expect(firstProfile).not.toBe(secondProfile);
    expect(firstProfile).not.toBe(userOnly);
    expect(userOnly).not.toBe(guest);
    expect(guest).toContain(":guest");
  });

  it("moves a reopened product to the front and removes duplicate IDs", () => {
    expect(moveRecentlyViewedProductToFront(
      ["product-a", "product-b", "product-a"],
      "product-b",
    )).toEqual(["product-b", "product-a"]);
  });

  it("keeps only the eight newest product identifiers", () => {
    const ids = Array.from({ length: 10 }, (_, index) => `product-${index}`);
    expect(moveRecentlyViewedProductToFront(ids, "product-new")).toEqual([
      "product-new", "product-0", "product-1", "product-2",
      "product-3", "product-4", "product-5", "product-6",
    ]);
    expect(MAX_RECENTLY_VIEWED_PRODUCTS).toBe(8);
  });

  it("rejects blank and oversized new IDs and ignores non-string stored entries", () => {
    expect(moveRecentlyViewedProductToFront(
      ["product-a", 42, null, { id: "product-b" }],
      "  ",
    )).toEqual(["product-a"]);
    expect(moveRecentlyViewedProductToFront(["product-a"], "x".repeat(129)))
      .toEqual(["product-a"]);
  });

  it("clamps custom retention bounds to a safe finite range", () => {
    const ids = ["a", "b", "c"];
    expect(moveRecentlyViewedProductToFront(ids, "d", Number.NaN)).toEqual([
      "d", "a", "b", "c",
    ]);
    expect(moveRecentlyViewedProductToFront(ids, "d", 1000)).toHaveLength(4);
    const oversizedHistory = Array.from({ length: 120 }, (_, index) => `item-${index}`);
    const bounded = moveRecentlyViewedProductToFront(oversizedHistory, "new-item", 1000);
    expect(bounded).toHaveLength(100);
    expect(bounded[0]).toBe("new-item");
  });
});
