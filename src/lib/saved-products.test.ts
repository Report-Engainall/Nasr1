import { describe, expect, it } from "vitest";
import { savedProductCacheKey, storefrontWishlistStorageKey } from "./saved-products";

const PROFILE_A = "a1000000-0000-0000-0000-000000000001";
const PROFILE_B = "b1000000-0000-0000-0000-000000000001";
const USER_A = "a2000000-0000-0000-0000-000000000001";
const USER_B = "b2000000-0000-0000-0000-000000000001";

describe("storefront wishlist storage identity", () => {
  it("preserves the existing verified-profile cache key", () => {
    expect(storefrontWishlistStorageKey(PROFILE_A, USER_A)).toBe(savedProductCacheKey(PROFILE_A));
  });

  it("isolates authenticated users who do not yet have a verified profile mapping", () => {
    const userAKey = storefrontWishlistStorageKey(null, USER_A);
    const userBKey = storefrontWishlistStorageKey(null, USER_B);

    expect(userAKey).not.toBe("aghbari:wishlist:v1");
    expect(userBKey).not.toBe("aghbari:wishlist:v1");
    expect(userAKey).not.toBe(userBKey);
    expect(userAKey).toBe(`aghbari:wishlist:auth:v1:${USER_A}`);
  });

  it("uses the authenticated identity when the supplied profile identifier is malformed", () => {
    expect(storefrontWishlistStorageKey("not-a-profile-id", USER_A))
      .toBe(`aghbari:wishlist:auth:v1:${USER_A}`);
  });

  it("retains the legacy guest key only when no authenticated identity is present", () => {
    expect(storefrontWishlistStorageKey(null, null)).toBe("aghbari:wishlist:v1");
    expect(storefrontWishlistStorageKey("", "")).toBe("aghbari:wishlist:v1");
  });
});
