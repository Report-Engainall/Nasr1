export type StorefrontArtworkKey = "food" | "beverage" | "cleaning" | "personal-care" | "electrical" | "tools" | "stationery" | "general";
export const STOREFRONT_ARTWORK_OPTIONS: ReadonlyArray<{ value: StorefrontArtworkKey; label: string }> = [
  { value: "food", label: "أغذية ومواد تموينية" }, { value: "beverage", label: "مشروبات ومياه" },
  { value: "cleaning", label: "منظفات وعناية منزلية" }, { value: "personal-care", label: "عناية شخصية" },
  { value: "electrical", label: "كهربائيات" }, { value: "tools", label: "أدوات ومستلزمات" },
  { value: "stationery", label: "قرطاسية" }, { value: "general", label: "توريد عام" },
];
const ALLOWED = new Set<StorefrontArtworkKey>(STOREFRONT_ARTWORK_OPTIONS.map((item) => item.value));
export function isStorefrontArtworkKey(value: unknown): value is StorefrontArtworkKey {
  return typeof value === "string" && ALLOWED.has(value as StorefrontArtworkKey);
}
export function normalizeStorefrontArtworkKey(value: unknown, fallback: StorefrontArtworkKey = "general"): StorefrontArtworkKey {
  return isStorefrontArtworkKey(value) ? value : fallback;
}
