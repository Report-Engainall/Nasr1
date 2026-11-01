import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    rpc: mocks.rpc,
    auth: { getSession: mocks.getSession },
  },
}));

import {
  fetchStorefrontSavedProductIds,
  readPendingSavedProductChanges,
  savedProductCacheKey,
  setStorefrontSavedProduct,
  syncStorefrontSavedProducts,
} from "@/lib/saved-products";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const PROFILE_ID = "f1111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "a1000000-0000-0000-0000-000000000001";
const SECOND_PRODUCT_ID = "a1000000-0000-0000-0000-000000000002";

function createCurrentUserSession() {
  return { data: { session: { user: { id: USER_ID } } }, error: null };
}

describe("storefront saved products client", () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    mocks.rpc.mockReset();
    mocks.getSession.mockReset();
    mocks.getSession.mockResolvedValue(createCurrentUserSession());
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("loads only validated, unique product UUIDs from the tenant-derived RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: [PRODUCT_ID, PRODUCT_ID], error: null });

    await expect(fetchStorefrontSavedProductIds()).resolves.toEqual([PRODUCT_ID]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_storefront_saved_products");
  });

  it("fails closed when the RPC response violates the saved-product contract", async () => {
    mocks.rpc.mockResolvedValue({ data: { product_id: PRODUCT_ID }, error: null });

    await expect(fetchStorefrontSavedProductIds()).rejects.toThrow(/قائمة مفضلة غير صالحة/);
  });

  it("sends an idempotent desired-state command and clears that profile's pending change", async () => {
    localStorage.setItem(
      "aghbari:wishlist-pending:v1:" + PROFILE_ID,
      JSON.stringify({ [PRODUCT_ID]: true }),
    );
    mocks.rpc.mockResolvedValue({
      data: { product_id: PRODUCT_ID, saved: true, changed: true },
      error: null,
    });

    await expect(setStorefrontSavedProduct(USER_ID, PROFILE_ID, PRODUCT_ID, true)).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith("set_storefront_saved_product", {
      p_product_id: PRODUCT_ID,
      p_saved: true,
    });
    expect(readPendingSavedProductChanges(PROFILE_ID)).toEqual({});
  });

  it("does not send an operation under a different currently signed-in account", async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: OTHER_USER_ID } } },
      error: null,
    });

    await expect(setStorefrontSavedProduct(USER_ID, PROFILE_ID, PRODUCT_ID, false)).resolves.toBe(false);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(readPendingSavedProductChanges(PROFILE_ID)).toEqual({ [PRODUCT_ID]: false });
  });

  it("replays offline desired-state changes, returns the visible state and clears successful queue entries", async () => {
    localStorage.setItem(
      "aghbari:wishlist-pending:v1:" + PROFILE_ID,
      JSON.stringify({ [PRODUCT_ID]: true, [SECOND_PRODUCT_ID]: false }),
    );
    mocks.rpc
      .mockResolvedValueOnce({ data: [SECOND_PRODUCT_ID], error: null })
      .mockResolvedValueOnce({ data: { product_id: PRODUCT_ID, saved: true, changed: true }, error: null })
      .mockResolvedValueOnce({ data: { product_id: SECOND_PRODUCT_ID, saved: false, changed: true }, error: null });

    const result = await syncStorefrontSavedProducts(USER_ID, PROFILE_ID);

    expect(result.productIds).toContain(PRODUCT_ID);
    expect(result.productIds).not.toContain(SECOND_PRODUCT_ID);
    expect(result.pendingCount).toBe(0);
    expect(readPendingSavedProductChanges(PROFILE_ID)).toEqual({});
    expect(mocks.rpc).toHaveBeenCalledTimes(3);
  });

  it("uses a profile-specific cache namespace rather than the legacy shared guest key", () => {
    expect(savedProductCacheKey(PROFILE_ID)).toBe("aghbari:wishlist:v2:" + PROFILE_ID);
    expect(savedProductCacheKey(PROFILE_ID)).not.toBe("aghbari:wishlist:v1");
  });
});
