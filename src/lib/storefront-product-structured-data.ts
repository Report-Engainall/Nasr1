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


export type StorefrontProductHeadMetadata = Readonly<{
  title: string;
  description: string;
  canonicalUrl: string | null;
  imageUrl: string | null;
}>;

/** Build product head metadata from the same safe public projection as JSON-LD. */
export function buildStorefrontProductHeadMetadata(
  structuredData: StorefrontProductStructuredData | null,
): StorefrontProductHeadMetadata | null {
  if (!structuredData) return null;
  const name = textValue(structuredData.name, 180);
  if (!name) return null;

  let canonicalUrl: string | null = null;
  if (typeof structuredData.url === "string" && structuredData.url.length <= 2_048) {
    try {
      const candidate = new URL(structuredData.url);
      if (
        candidate.protocol === "https:" &&
        !candidate.username &&
        !candidate.password &&
        !candidate.search &&
        !candidate.hash &&
        candidate.pathname.startsWith("/product/") &&
        candidate.pathname.length > "/product/".length
      ) canonicalUrl = candidate.toString();
    } catch {
      // Never emit an unverified canonical URL.
    }
  }

  const description = textValue(structuredData.description, 300)
    ?? "تفاصيل المنتج وبيانات العبوة والوحدات المتاحة في متجر الأغبري.";
  const images = Array.isArray(structuredData.image)
    ? structuredData.image
        .map((value) => safePublicImageUrl(value, null))
        .filter((value): value is string => Boolean(value))
    : [];

  return {
    title: name + " | متجر الأغبري",
    description,
    canonicalUrl,
    imageUrl: images[0] ?? null,
  };
}

type StorefrontHeadMetaEntry = Readonly<{
  attribute: "name" | "property";
  key: string;
  value: string | null;
}>;

/** Apply dynamic product metadata and restore it without overwriting newer route metadata. */
export function applyStorefrontProductHeadMetadata(
  metadata: StorefrontProductHeadMetadata,
  documentRef: Document,
): () => void {
  const previousTitle = documentRef.title;
  documentRef.title = metadata.title;

  const entries: StorefrontHeadMetaEntry[] = [
    { attribute: "name", key: "description", value: metadata.description },
    { attribute: "property", key: "og:type", value: "product" },
    { attribute: "property", key: "og:site_name", value: "متجر الأغبري" },
    { attribute: "property", key: "og:title", value: metadata.title },
    { attribute: "property", key: "og:description", value: metadata.description },
    { attribute: "property", key: "og:url", value: metadata.canonicalUrl },
    { attribute: "property", key: "og:image", value: metadata.imageUrl },
    { attribute: "name", key: "twitter:card", value: metadata.imageUrl ? "summary_large_image" : "summary" },
    { attribute: "name", key: "twitter:title", value: metadata.title },
    { attribute: "name", key: "twitter:description", value: metadata.description },
    { attribute: "name", key: "twitter:image", value: metadata.imageUrl },
  ];

  const metaSnapshots = entries.flatMap((entry) => {
    const selector = 'meta[' + entry.attribute + '="' + entry.key + '"]';
    let element = documentRef.head.querySelector<HTMLMetaElement>(selector);
    const existed = element !== null;
    if (!element && entry.value !== null) {
      element = documentRef.createElement("meta");
      element.setAttribute(entry.attribute, entry.key);
      documentRef.head.append(element);
    }
    if (!element) return [];

    const previousContent = element.getAttribute("content");
    if (entry.value === null) element.removeAttribute("content");
    else element.setAttribute("content", entry.value);
    return [{ element, existed, previousContent, appliedContent: entry.value }];
  });

  const existingCanonical = documentRef.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  const canonicalExisted = existingCanonical !== null;
  const canonicalElement = existingCanonical
    ?? (metadata.canonicalUrl ? documentRef.createElement("link") : null);
  const previousCanonicalHref = canonicalElement?.getAttribute("href") ?? null;
  if (canonicalElement) {
    canonicalElement.setAttribute("rel", "canonical");
    if (metadata.canonicalUrl) canonicalElement.setAttribute("href", metadata.canonicalUrl);
    else canonicalElement.removeAttribute("href");
    if (!canonicalExisted) documentRef.head.append(canonicalElement);
  }

  return () => {
    if (documentRef.title === metadata.title) documentRef.title = previousTitle;
    for (const snapshot of metaSnapshots) {
      if (snapshot.element.parentNode !== documentRef.head) continue;
      if (snapshot.element.getAttribute("content") !== snapshot.appliedContent) continue;
      if (snapshot.existed) {
        if (snapshot.previousContent === null) snapshot.element.removeAttribute("content");
        else snapshot.element.setAttribute("content", snapshot.previousContent);
      } else {
        snapshot.element.remove();
      }
    }
    if (canonicalElement?.parentNode === documentRef.head &&
        canonicalElement.getAttribute("href") === metadata.canonicalUrl) {
      if (canonicalExisted) {
        if (previousCanonicalHref === null) canonicalElement.removeAttribute("href");
        else canonicalElement.setAttribute("href", previousCanonicalHref);
      } else {
        canonicalElement.remove();
      }
    }
  };
}
