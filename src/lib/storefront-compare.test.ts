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
  it("keeps the existing guest key but isolates each customer profile", () => {
    expect(storefrontCompareStorageKey()).toBe(STOREFRONT_COMPARE_GUEST_STORAGE_KEY);
    expect(storefrontCompareStorageKey(" profile-a ")).toBe("aghbari:compare:v2:profile-a");
    expect(storefrontCompareStorageKey("profile-a")).not.toBe(storefrontCompareStorageKey("profile-b"));
    expect(storefrontCompareStorageKey("profile/a")).toBe("aghbari:compare:v2:profile%2Fa");
  });

  it("does not expose guest or another customer's saved products to a different profile", () => {
    const storage = memoryStorage({
      [STOREFRONT_COMPARE_GUEST_STORAGE_KEY]: JSON.stringify(["guest-product"]),
      "aghbari:compare:v2:profile-a": JSON.stringify(["customer-a-product"]),
    });

    expect(readStorefrontCompareIds(storage, storefrontCompareStorageKey("profile-a")))
      .toEqual(["customer-a-product"]);
    expect(readStorefrontCompareIds(storage, storefrontCompareStorageKey("profile-b"))).toEqual([]);
    expect(readStorefrontCompareIds(storage, storefrontCompareStorageKey())).toEqual(["guest-product"]);
  });

  it("normalizes the list and enforces the three-product cap on writes and reads", () => {
    const storage = memoryStorage();
    const key = storefrontCompareStorageKey("profile-a");

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
