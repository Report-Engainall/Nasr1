export type StorefrontProductStructuredDataInput = {
  id: string;
  name: string;
  description?: string | null;
  sku?: string | null;
  itemCode?: string | null;
  categoryName?: string | null;
  imageUrls?: readonly (string | null | undefined)[];
  pageOrigin?: string | null;
  priceVisible: boolean;
  displayPrice?: number | null;
  availableQuantity?: number | null;
  minimumOrderQuantity?: number | null;
};

export type StorefrontProductStructuredData = Record<string, unknown>;

const PRIVATE_IMAGE_QUERY_KEYS = new Set([
  "token", "signature", "sig", "apikey", "api_key", "authorization",
  "access_token", "refresh_token", "x-amz-signature", "x-amz-credential",
  "x-goog-signature", "x-goog-credential",
]);

function textValue(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return normalized && normalized.length <= maxLength ? normalized : null;
}

function safePublicImageUrl(value: unknown, pageOrigin?: string | null): string | null {
  if (typeof value !== "string" || !value.trim() || value.length > 2_048) return null;
  const candidate = value.trim();
  try {
    if (candidate.startsWith("//")) return null;
    const base = pageOrigin && /^https:\/\//i.test(pageOrigin) ? pageOrigin : undefined;
    if (!/^https:\/\//i.test(candidate) && !(base && candidate.startsWith("/"))) return null;
    const url = new URL(candidate, base);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    let hasPrivateParameter = false;
    url.searchParams.forEach((_value, key) => {
      if (PRIVATE_IMAGE_QUERY_KEYS.has(key.toLowerCase())) hasPrivateParameter = true;
    });
    if (hasPrivateParameter) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Build Schema.org Product data only from values currently resolved for this customer. */
export function buildStorefrontProductStructuredData(
  input: StorefrontProductStructuredDataInput,
): StorefrontProductStructuredData | null {
  const id = textValue(input.id, 128);
  const name = textValue(input.name, 180);
  if (!id || !name) return null;

  const product: StorefrontProductStructuredData = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
  };
  const description = textValue(input.description, 5_000);
  const sku = textValue(input.sku, 100);
  const itemCode = textValue(input.itemCode, 100);
  const category = textValue(input.categoryName, 180);
  if (description) product.description = description;
  if (sku) product.sku = sku;
  if (itemCode) product.identifier = { "@type": "PropertyValue", name: "رمز المنتج", value: itemCode };
  if (category) product.category = category;

  const pageOrigin = input.pageOrigin && /^https:\/\//i.test(input.pageOrigin) ? input.pageOrigin : null;
  if (pageOrigin) {
    try {
      product.url = new URL(`/product/${encodeURIComponent(id)}`, pageOrigin).toString();
    } catch {
      // Do not emit an unverified canonical URL.
    }
  }

  const images = [...new Set((input.imageUrls ?? [])
    .map((value) => safePublicImageUrl(value, pageOrigin))
    .filter((value): value is string => Boolean(value)))]
    .slice(0, 8);
  if (images.length) product.image = images;

  const price = input.displayPrice;
  if (input.priceVisible && typeof price === "number" && Number.isFinite(price) && price >= 0) {
    const offer: Record<string, unknown> = {
      "@type": "Offer",
      price: String(price),
      priceCurrency: "YER",
    };
    if (typeof product.url === "string") offer.url = product.url;
    const available = input.availableQuantity;
    if (typeof available === "number" && Number.isFinite(available) && available >= 0) {
      const minimum = typeof input.minimumOrderQuantity === "number" &&
        Number.isSafeInteger(input.minimumOrderQuantity) && input.minimumOrderQuantity >= 1
        ? input.minimumOrderQuantity
        : 1;
      offer.availability = available === 0
        ? "https://schema.org/OutOfStock"
        : available < minimum
          ? "https://schema.org/LimitedAvailability"
          : "https://schema.org/InStock";
    }
    product.offers = offer;
  }
  return product;
}

/** Prevent HTML script-closing text from escaping the JSON-LD script element. */
export function serializeStorefrontProductStructuredData(
  structuredData: StorefrontProductStructuredData,
): string {
  return JSON.stringify(structuredData)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
