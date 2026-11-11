const SEARCH_FIELDS = ["name", "item_code", "sku", "barcode"] as const;
const MAX_SEARCH_LENGTH = 100;

/**
 * Build a PostgREST .or() filter from a bounded product search term.
 * Only letters, numbers, spaces and SKU-safe punctuation survive; syntax
 * delimiters, wildcards and quotes supplied by a user are never interpolated.
 */
export function buildProductAdminSearchFilter(value: string): string | null {
  if (typeof value !== "string") {
    throw new Error("قيمة البحث عن الصنف غير صالحة.");
  }

  const normalized = value.normalize("NFKC").trim();
  if (normalized.length > MAX_SEARCH_LENGTH) {
    throw new Error("عبارة البحث طويلة جدًا؛ الحد الأقصى 100 حرف.");
  }

  const safe = normalized
    .replace(/[^\p{L}\p{N}\s._/-]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();

  if (!safe) return null;

  // '_' is a SQL LIKE single-character wildcard; escape it so item-code search
  // remains literal while the surrounding '*' are PostgREST's contains pattern.
  const pattern = "*" + safe.replace(/_/gu, "\\_") + "*";
  return SEARCH_FIELDS.map((field) => field + ".ilike." + pattern).join(",");
}
