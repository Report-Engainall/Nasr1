const PRIVATE_IMAGE_QUERY_KEYS = new Set([
  "token",
  "signature",
  "sig",
  "apikey",
  "api_key",
  "authorization",
  "access_token",
  "refresh_token",
  "jwt",
  "credential",
  "x-amz-signature",
  "x-amz-credential",
  "x-goog-signature",
  "x-goog-credential",
]);

/**
 * Only expose stable public HTTPS image URLs in storefront markup and metadata.
 * Signed/private URLs must never be copied into public image requests or JSON-LD.
 */
export function isSafeStorefrontImageUrl(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    value.length > 2048
  ) {
    return false;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;

    for (const key of url.searchParams.keys()) {
      if (PRIVATE_IMAGE_QUERY_KEYS.has(key.toLowerCase())) return false;
    }

    return true;
  } catch {
    return false;
  }
}
