const SEARCH_FIELDS = ["name", "item_code", "sku", "barcode"] as const;
const MAX_SEARCH_LENGTH = 100;

/**
 * Normalize a bounded product search term before it reaches the database.
 * Only letters, numbers, spaces and SKU-safe punctuation survive.
 */
export function normalizeProductAdminSearchTerm(value: string): string | null {
  if (typeof value !== "string") throw new Error("قيمة البحث عن الصنف غير صالحة.");
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length > MAX_SEARCH_LENGTH) throw new Error("عبارة البحث طويلة جدًا؛ الحد الأقصى 100 حرف.");
  const safe = normalized
    .replace(/[^\\p{L}\\p{N}\\s._/-]/gu, " ")
    .replace(/\\s+/gu, " ")
    .trim();
  return safe || null;
}

/** Compatibility helper for the existing PostgREST option selectors. */
export function buildProductAdminSearchFilter(value: string): string | null {
  const safe = normalizeProductAdminSearchTerm(value);
  if (!safe) return null;
  const pattern = "*" + safe.replace(/_/gu, "\\\\_") + "*";
  return SEARCH_FIELDS.map((field) => field + ".ilike." + pattern).join(",");
}


const PRODUCT_CATEGORY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accept only a canonical UUID before it is used as a PostgREST equality filter. */
export function isValidProductAdminCategoryId(value: unknown): value is string {
  return typeof value === "string" && PRODUCT_CATEGORY_UUID.test(value);
}
