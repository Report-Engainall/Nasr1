export type ProductImageBatchProduct = {
  id: string;
  item_code: string;
  name: string;
  image_url?: string | null;
  image_gallery_urls?: readonly string[] | null;
};

export type ProductImageBatchFile = {
  name: string;
};

export type ProductImageBatchPlacement = "primary" | "gallery";
export type ProductImageBatchStatus = "ready" | "unmatched" | "ambiguous" | "gallery_limit";

export type ProductImageBatchEntry<TFile extends ProductImageBatchFile> = {
  file: TFile;
  itemCode: string;
  product: ProductImageBatchProduct | null;
  placement: ProductImageBatchPlacement | null;
  status: ProductImageBatchStatus;
  message?: string;
};

const ALLOWED_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const MAX_GALLERY_IMAGES = 8;

export function normalizeProductImageItemCode(value: string): string {
  return value.trim().normalize("NFKC").toLocaleUpperCase("en-US");
}

/** Only a public HTTPS URL counts as a usable primary product image. */
export function hasSafePrimaryProductImageUrl(value: unknown): boolean {
  return typeof value === "string" && /^https:\/\//i.test(value.trim());
}

export type ProductImageDisplayStatus = {
  hasPrimary: boolean;
  galleryCount: number;
  totalCount: number;
};

/** Counts only distinct HTTPS media references returned for this product. */
export function getProductImageDisplayStatus(
  primaryImageUrl: unknown,
  galleryImageUrls: readonly unknown[] | null | undefined,
): ProductImageDisplayStatus {
  const hasPrimary = hasSafePrimaryProductImageUrl(primaryImageUrl);
  const galleryCount = new Set(
    (Array.isArray(galleryImageUrls) ? galleryImageUrls : [])
      .filter((url): url is string => typeof url === "string" && /^https:\/\//i.test(url.trim()))
      .map((url) => url.trim()),
  ).size;
  return {
    hasPrimary,
    galleryCount,
    totalCount: galleryCount + (hasPrimary ? 1 : 0),
  };
}

/** Uses the exact item code first. Numbered suffixes such as SKU__2 or SKU (2) are fallback aliases only. */
export function productImageItemCodeFromFilename(fileName: string): string | null {
  const basename = fileName.replace(/^.*[\\/]/, "").trim();
  const extensionIndex = basename.lastIndexOf(".");
  if (extensionIndex <= 0) return null;

  const extension = basename.slice(extensionIndex + 1).toLocaleLowerCase("en-US");
  if (!ALLOWED_EXTENSIONS.has(extension)) return null;

  const itemCode = basename.slice(0, extensionIndex).trim();
  return itemCode || null;
}

function resolveProductCode(
  itemCode: string,
  productsByCode: ReadonlyMap<string, readonly ProductImageBatchProduct[]>,
): { matches: readonly ProductImageBatchProduct[]; matchedCode: string } {
  const exactKey = normalizeProductImageItemCode(itemCode);
  const exactMatches = productsByCode.get(exactKey);
  if (exactMatches?.length) return { matches: exactMatches, matchedCode: itemCode };

  const numberedSuffix = itemCode.match(/(?:__|\s*\()\s*([2-9]\d*)\)?$/u);
  if (numberedSuffix?.index !== undefined) {
    const fallbackCode = itemCode.slice(0, numberedSuffix.index).trim();
    const fallbackMatches = productsByCode.get(normalizeProductImageItemCode(fallbackCode));
    if (fallbackMatches?.length) return { matches: fallbackMatches, matchedCode: fallbackCode };
  }

  return { matches: [], matchedCode: itemCode };
}

function productImageFilenameOrder(fileName: string, productItemCode: string): readonly [number, number] {
  const fileCode = productImageItemCodeFromFilename(fileName);
  if (!fileCode) return [2, 0];

  const productKey = normalizeProductImageItemCode(productItemCode);
  if (normalizeProductImageItemCode(fileCode) === productKey) return [0, 0];

  const numberedSuffix = fileCode.match(/(?:__|\\s*\\()\\s*([2-9]\\d*)\\)?$/u);
  if (numberedSuffix?.index !== undefined) {
    const baseCode = fileCode.slice(0, numberedSuffix.index).trim();
    if (normalizeProductImageItemCode(baseCode) === productKey) {
      const number = Number(numberedSuffix[1]);
      return [1, Number.isSafeInteger(number) ? number : Number.MAX_SAFE_INTEGER];
    }
  }

  return [2, 0];
}

/**
 * Plans a safe, deterministic batch:
 * - exact SKU/item-code match wins over numbered image suffixes;
 * - duplicate product codes are never guessed;
 * - an existing primary image is never replaced by a batch;
 * - gallery capacity is checked before any file is uploaded.
 */
export function matchProductImagesByCode<TFile extends ProductImageBatchFile>(
  products: readonly ProductImageBatchProduct[],
  files: readonly TFile[],
): ProductImageBatchEntry<TFile>[] {
  const productsByCode = new Map<string, ProductImageBatchProduct[]>();
  for (const product of products) {
    const key = normalizeProductImageItemCode(product.item_code);
    if (!key) continue;
    const bucket = productsByCode.get(key) ?? [];
    bucket.push(product);
    productsByCode.set(key, bucket);
  }

  const entries: ProductImageBatchEntry<TFile>[] = files.map((file) => {
    const itemCode = productImageItemCodeFromFilename(file.name);
    if (!itemCode) {
      return {
        file,
        itemCode: "",
        product: null,
        placement: null,
        status: "unmatched",
        message: "اسم الملف يجب أن يكون كود الصنف متبوعًا بامتداد JPG أو PNG أو WebP.",
      };
    }

    const resolved = resolveProductCode(itemCode, productsByCode);
    if (resolved.matches.length === 0) {
      return {
        file,
        itemCode: resolved.matchedCode,
        product: null,
        placement: null,
        status: "unmatched",
        message: "لا يوجد صنف بهذا الكود.",
      };
    }
    if (resolved.matches.length > 1) {
      return {
        file,
        itemCode: resolved.matchedCode,
        product: null,
        placement: null,
        status: "ambiguous",
        message: "كود الصنف مكرر؛ لم تُربط الصورة بأي سجل.",
      };
    }

    return {
      file,
      itemCode: resolved.matchedCode,
      product: resolved.matches[0],
      placement: null,
      status: "ready",
    };
  });

  const grouped = new Map<string, ProductImageBatchEntry<TFile>[]>();
  for (const entry of entries) {
    if (entry.status !== "ready" || !entry.product) continue;
    const group = grouped.get(entry.product.id) ?? [];
    group.push(entry);
    grouped.set(entry.product.id, group);
  }

  for (const group of grouped.values()) {
    const product = group[0].product;
    if (!product) continue;

    // The exact SKU filename (SKU.png) is the primary candidate. Numbered
    // aliases (SKU__2.png, SKU (3).webp) are gallery candidates and sort by
    // their numeric suffix, regardless of the order files were selected.
    group.sort((left, right) => {
      const [leftRank, leftNumber] = productImageFilenameOrder(left.file.name, product.item_code);
      const [rightRank, rightNumber] = productImageFilenameOrder(right.file.name, product.item_code);
      if (leftRank !== rightRank) return leftRank - rightRank;
      if (leftNumber !== rightNumber) return leftNumber - rightNumber;
      return left.file.name.localeCompare(right.file.name, "en", { numeric: true, sensitivity: "base" });
    });

    let primaryAssigned = hasSafePrimaryProductImageUrl(product.image_url);
    let galleryCount = product.image_gallery_urls?.length ?? 0;

    for (const entry of group) {
      if (!primaryAssigned) {
        entry.placement = "primary";
        primaryAssigned = true;
      } else if (galleryCount < MAX_GALLERY_IMAGES) {
        entry.placement = "gallery";
        galleryCount += 1;
      } else {
        entry.status = "gallery_limit";
        entry.placement = null;
        entry.message = "وصل معرض هذا الصنف إلى الحد الأقصى؛ لم تُرفع هذه الصورة.";
      }
    }
  }

  return entries;
}
