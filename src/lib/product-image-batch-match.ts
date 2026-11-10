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

    // Stable ordering makes the chosen primary image predictable across runs.
    group.sort((left, right) =>
      left.file.name.localeCompare(right.file.name, "en", { numeric: true, sensitivity: "base" }),
    );

    let primaryAssigned = Boolean(product.image_url?.trim());
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
