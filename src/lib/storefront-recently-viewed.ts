import { normalizeSavedProductIds } from "@/lib/commerce-utils";

export const MAX_RECENTLY_VIEWED_PRODUCTS = 8;
const STORAGE_PREFIX = "aghbari:recently-viewed:v1";

/** Build a separate local history key for each account, falling back to auth user then guest. */
export function recentlyViewedProductsStorageKey(
  profileId?: string | null,
  userId?: string | null,
): string {
  const profile = profileId?.trim();
  const user = userId?.trim();
  const scope = profile ? `profile:${profile}` : user ? `user:${user}` : "guest";
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope)}`;
}

/**
 * Move a product ID to the front of a bounded history. Only identifiers are stored;
 * all display data is resolved again from the current authorized catalog.
 */
export function moveRecentlyViewedProductToFront(
  currentIds: unknown,
  productId: string,
  maxItems = MAX_RECENTLY_VIEWED_PRODUCTS,
): string[] {
  const limit = Number.isSafeInteger(maxItems) && maxItems > 0
    ? Math.min(maxItems, 100)
    : MAX_RECENTLY_VIEWED_PRODUCTS;
  const existing = normalizeSavedProductIds(currentIds, limit);
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!id || id.length > 128) return existing;
  return [id, ...existing.filter((candidate) => candidate !== id)].slice(0, limit);
}
