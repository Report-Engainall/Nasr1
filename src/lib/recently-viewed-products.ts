export const MAX_RECENTLY_VIEWED_PRODUCTS = 12;

export type RecentlyViewedProduct = {
  id: string;
  name: string;
  itemCode: string;
  imageUrl: string | null;
  viewedAt: string;
};

export type RecentlyViewedProductInput = {
  id: string;
  name: string;
  itemCode?: string | null;
  imageUrl?: string | null;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function canRecordRecentlyViewedProducts(input: {
  authReady: boolean;
  profileId?: string | null;
  isStaff?: boolean;
  roles?: unknown;
}): boolean {
  return input.authReady
    && typeof input.profileId === "string"
    && input.profileId.trim().length > 0
    && input.isStaff !== true
    && Array.isArray(input.roles)
    && input.roles.includes("customer");
}

export function recentlyViewedProductsStorageKey(profileId: string): string {
  const normalizedProfileId = profileId.trim();
  return normalizedProfileId ? `aghbari:recently-viewed:v1:${normalizedProfileId}` : "";
}

const SENSITIVE_IMAGE_QUERY_KEYS = new Set([
  "token", "signature", "sig", "apikey", "api_key", "authorization",
  "x-amz-signature", "x-goog-signature",
]);

function hasSensitiveImageQuery(url: URL): boolean {
  let sensitive = false;
  url.searchParams.forEach((_value, key) => {
    if (SENSITIVE_IMAGE_QUERY_KEYS.has(key.toLowerCase())) sensitive = true;
  });
  return sensitive;
}

function safePublicImageUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048) return null;
  const candidate = value.trim();

  try {
    if (candidate.startsWith("/") && !candidate.startsWith("//")) {
      const relativeUrl = new URL(candidate, "https://nasr1.local");
      return hasSensitiveImageQuery(relativeUrl) ? null : candidate;
    }

    const url = new URL(candidate);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (url.username || url.password || hasSensitiveImageQuery(url)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeProduct(value: unknown): RecentlyViewedProduct | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || !row.id.trim() || row.id.length > 128) return null;
  if (typeof row.name !== "string" || !row.name.trim() || row.name.length > 180) return null;
  if (typeof row.viewedAt !== "string" || !Number.isFinite(Date.parse(row.viewedAt))) return null;

  return {
    id: row.id.trim(),
    name: row.name.trim(),
    itemCode: typeof row.itemCode === "string" ? row.itemCode.trim().slice(0, 80) : "",
    imageUrl: safePublicImageUrl(row.imageUrl),
    viewedAt: new Date(row.viewedAt).toISOString(),
  };
}

export function normalizeRecentlyViewedProducts(
  value: unknown,
  limit = MAX_RECENTLY_VIEWED_PRODUCTS,
): RecentlyViewedProduct[] {
  if (!Array.isArray(value)) return [];
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.min(50, Math.floor(limit))) : MAX_RECENTLY_VIEWED_PRODUCTS;
  if (safeLimit === 0) return [];

  const seen = new Set<string>();
  const normalized: RecentlyViewedProduct[] = [];
  for (const candidate of value) {
    const product = normalizeProduct(candidate);
    if (!product || seen.has(product.id)) continue;
    seen.add(product.id);
    normalized.push(product);
    if (normalized.length >= safeLimit) break;
  }
  return normalized;
}

export function readRecentlyViewedProducts(storage: StorageLike, profileId: string): RecentlyViewedProduct[] {
  const key = recentlyViewedProductsStorageKey(profileId);
  if (!key) return [];
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    return normalizeRecentlyViewedProducts(JSON.parse(raw) as unknown);
  } catch {
    return [];
  }
}

export function recordRecentlyViewedProduct(
  storage: StorageLike,
  profileId: string,
  product: RecentlyViewedProductInput,
  viewedAt = new Date().toISOString(),
): boolean {
  const key = recentlyViewedProductsStorageKey(profileId);
  if (!key) return false;
  const entry = normalizeProduct({ ...product, viewedAt });
  if (!entry) return false;

  try {
    const previous = readRecentlyViewedProducts(storage, profileId);
    const next = [entry, ...previous.filter((item) => item.id !== entry.id)]
      .slice(0, MAX_RECENTLY_VIEWED_PRODUCTS);
    storage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function removeRecentlyViewedProduct(storage: StorageLike, profileId: string, productId: string): boolean {
  const key = recentlyViewedProductsStorageKey(profileId);
  if (!key || !productId.trim()) return false;
  try {
    const next = readRecentlyViewedProducts(storage, profileId).filter((item) => item.id !== productId);
    storage.setItem(key, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function clearRecentlyViewedProducts(storage: StorageLike, profileId: string): boolean {
  const key = recentlyViewedProductsStorageKey(profileId);
  if (!key) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}