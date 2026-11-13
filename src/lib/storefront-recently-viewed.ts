import { normalizeSavedProductIds } from "@/lib/commerce-utils";

export const MAX_RECENTLY_VIEWED_PRODUCTS = 8;
const STORAGE_PREFIX = "aghbari:recently-viewed:v1";

export function recentlyViewedProductsStorageKey(
  profileId?: string | null,
  userId?: string | null,
): string {
  const profile = profileId?.trim();
  const user = userId?.trim();
  const scope = profile
    ? `profile:${profile}`
    : user
      ? `user:${user}`
      : "guest";
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope)}`;
}

/**
 * Move an item to the front of a bounded, de-duplicated local browsing history.
 * Only identifiers are persisted; product data is always re-read from the live
 * tenant-authorized catalogue before being displayed.
 */
export function moveRecentlyViewedProductToFront(
  currentIds: unknown,
  productId: string,
  maxItems = MAX_RECENTLY_VIEWED_PRODUCTS,
): string[] {
  const existing = normalizeSavedProductIds(currentIds, maxItems);
  const id = typeof productId === "string" ? productId.trim() : "";
  if (!Number.isSafeInteger(maxItems) || maxItems < 1 || !id || id.length > 128) return existing;
  return [id, ...existing.filter((candidate) => candidate !== id)].slice(0, maxItems);
}
