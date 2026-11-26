export const AGHBARI_BRAND_NAME_AR = "متجر الأغبري";
export const AGHBARI_BRAND_NAME_EN = "Aghbari Commerce";

/**
 * Builds a document title around the one canonical product identity.
 * Page-specific wording is a descriptor, never a second product/brand name.
 */
export function buildAghbariDocumentTitle(section?: string): string {
  const descriptor = section?.trim();
  return descriptor
    ? `${AGHBARI_BRAND_NAME_AR} | ${descriptor} — ${AGHBARI_BRAND_NAME_EN}`
    : `${AGHBARI_BRAND_NAME_AR} — ${AGHBARI_BRAND_NAME_EN}`;
}
