import { normalizeSavedProductIds } from "@/lib/commerce-utils";

export const STOREFRONT_COMPARE_GUEST_STORAGE_KEY = "aghbari:compare:v1";
export const STOREFRONT_COMPARE_MAX_ITEMS = 3;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/**
 * Keep anonymous compare choices compatible with the existing guest key while
 * isolating authenticated customers by verified profile id. The browser cache is
 * convenience state only: product data is always resolved from the live catalog.
 */
export function storefrontCompareStorageKey(profileId?: string | null): string {
  const normalizedProfileId = typeof profileId === "string" ? profileId.trim() : "";
  if (!normalizedProfileId) return STOREFRONT_COMPARE_GUEST_STORAGE_KEY;
  return `aghbari:compare:v2:${encodeURIComponent(normalizedProfileId)}`;
}

export function readStorefrontCompareIds(storage: StorageLike, storageKey: string): string[] {
  if (!storageKey) return [];
  try {
    const raw = storage.getItem(storageKey);
    return raw ? normalizeSavedProductIds(JSON.parse(raw) as unknown, STOREFRONT_COMPARE_MAX_ITEMS) : [];
  } catch {
    return [];
  }
}

export function writeStorefrontCompareIds(
  storage: StorageLike,
  storageKey: string,
  productIds: unknown,
): boolean {
  if (!storageKey) return false;
  try {
    const normalized = normalizeSavedProductIds(productIds, STOREFRONT_COMPARE_MAX_ITEMS);
    storage.setItem(storageKey, JSON.stringify(normalized));
    return true;
  } catch {
    return false;
  }
}
