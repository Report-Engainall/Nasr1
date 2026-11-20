import { describe, expect, it } from "vitest";
import {
  readStorefrontCompareIds,
  STOREFRONT_COMPARE_GUEST_STORAGE_KEY,
  storefrontCompareStorageKey,
  writeStorefrontCompareIds,
} from "./storefront-compare";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    values,
  };
}

describe("profile-scoped storefront compare storage", () => {
  it("keeps the existing guest key and isolates authenticated users without a profile mapping", () => {
    const userA = "a2000000-0000-0000-0000-000000000001";
    const userB = "b2000000-0000-0000-0000-000000000001";
    const userAKey = storefrontCompareStorageKey(null, userA);
    const userBKey = storefrontCompareStorageKey(null, userB);

    expect(userAKey).not.toBe(STOREFRONT_COMPARE_GUEST_STORAGE_KEY);
    expect(userBKey).not.toBe(STOREFRONT_COMPARE_GUEST_STORAGE_KEY);
    expect(userAKey).not.toBe(userBKey);
    expect(userAKey).toBe(`aghbari:compare:auth:v1:${userA}`);
  });

  it("uses the authenticated identity when a profile identifier is malformed", () => {
    const userId = "a2000000-0000-0000-0000-000000000001";
    expect(storefrontCompareStorageKey("not-a-profile-id", userId))
      .toBe(`aghbari:compare:auth:v1:${userId}`);
  });

  it("keeps the existing guest key but isolates each customer profile", () => {
    expect(storefrontCompareStorageKey()).toBe(STOREFRONT_COMPARE_GUEST_STORAGE_KEY);
    expect(storefrontCompareStorageKey(" a1000000-0000-0000-0000-000000000001 ")).toBe("aghbari:compare:v2:a1000000-0000-0000-0000-000000000001");
    expect(storefrontCompareStorageKey("a1000000-0000-0000-0000-000000000001")).not.toBe(storefrontCompareStorageKey("b1000000-0000-0000-0000-000000000001"));
    expect(storefrontCompareStorageKey("profile/a")).toBe("aghbari:compare:v2:a1000000-0000-0000-0000-000000000001%2Fextra");
  });

  it("does not expose guest or another customer's saved products to a different profile", () => {
    const storage = memoryStorage({
      [STOREFRONT_COMPARE_GUEST_STORAGE_KEY]: JSON.stringify(["guest-product"]),
      "aghbari:compare:v2:a1000000-0000-0000-0000-000000000001": JSON.stringify(["customer-a-product"]),
    });

    expect(readStorefrontCompareIds(storage, storefrontCompareStorageKey("a1000000-0000-0000-0000-000000000001")))
      .toEqual(["customer-a-product"]);
    expect(readStorefrontCompareIds(storage, storefrontCompareStorageKey("b1000000-0000-0000-0000-000000000001"))).toEqual([]);
    expect(readStorefrontCompareIds(storage, storefrontCompareStorageKey())).toEqual(["guest-product"]);
  });

  it("normalizes the list and enforces the three-product cap on writes and reads", () => {
    const storage = memoryStorage();
    const key = storefrontCompareStorageKey("a1000000-0000-0000-0000-000000000001");

    expect(writeStorefrontCompareIds(storage, key, ["a", "b", "a", "", "c", "d", 4])).toBe(true);
    expect(readStorefrontCompareIds(storage, key)).toEqual(["a", "b", "c"]);
  });

  it("fails closed for corrupt persisted JSON and inaccessible storage", () => {
    const storage = memoryStorage({ "broken": "{not-json" });
    expect(readStorefrontCompareIds(storage, "broken")).toEqual([]);
    const unavailableStorage = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
    };
    expect(readStorefrontCompareIds(unavailableStorage, "profile")).toEqual([]);
    expect(writeStorefrontCompareIds(unavailableStorage, "profile", ["a"])).toBe(false);
  });
});
