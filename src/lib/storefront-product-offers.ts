import type { Promotion } from "@/lib/types";

export type StorefrontProductOffer = Pick<
  Promotion,
  "id" | "title" | "description" | "start_date" | "end_date"
>;

type ProductOfferTarget = {
  id: string;
  category_id?: string | null;
};

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !DATE_ONLY.test(value)) return false;
  const date = new Date(value + "T12:00:00.000Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function currentStoreDate(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Aden",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
  return part("year") + "-" + part("month") + "-" + part("day");
}

/**
 * Project only published campaign copy explicitly linked to this product or its
 * category. The returned model excludes discount values/types and all financial
 * internals; checkout pricing remains server-authoritative.
 */
export function resolveActiveProductOffers(
  promotions: readonly Promotion[] | null | undefined,
  product: ProductOfferTarget,
  today = currentStoreDate(),
): StorefrontProductOffer[] {
  if (!Array.isArray(promotions)
      || typeof product.id !== "string"
      || !product.id.trim()
      || !isValidDateOnly(today)) return [];

  const seen = new Set<string>();
  const result: StorefrontProductOffer[] = [];

  for (const candidate of promotions) {
    if (!candidate || typeof candidate !== "object") continue;
    const row = candidate as unknown as Record<string, unknown>;
    if (
      row.is_active !== true
      || typeof row.id !== "string"
      || !row.id.trim()
      || seen.has(row.id)
      || typeof row.title !== "string"
      || !row.title.trim()
      || !isValidDateOnly(row.start_date)
      || !isValidDateOnly(row.end_date)
      || row.end_date < row.start_date
      || row.start_date > today
      || row.end_date < today
    ) continue;

    const productIds = Array.isArray(row.product_ids)
      ? row.product_ids.filter((value): value is string => typeof value === "string")
      : [];
    const categoryIds = Array.isArray(row.category_ids)
      ? row.category_ids.filter((value): value is string => typeof value === "string")
      : [];
    const directlyTargetsProduct = productIds.includes(product.id);
    const targetsProductCategory = typeof product.category_id === "string"
      && product.category_id.length > 0
      && categoryIds.includes(product.category_id);

    // Store-wide campaigns without explicit product/category targets are not
    // misrepresented as an offer attached to each individual product.
    if (!directlyTargetsProduct && !targetsProductCategory) continue;

    seen.add(row.id);
    result.push({
      id: row.id,
      title: row.title.trim(),
      description: typeof row.description === "string" && row.description.trim()
        ? row.description.trim()
        : null,
      start_date: row.start_date,
      end_date: row.end_date,
    });
    if (result.length >= 12) break;
  }

  return result;
}
