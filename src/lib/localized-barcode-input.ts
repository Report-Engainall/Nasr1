/**
 * Normalize locale-specific digits in barcode and QR input.
 *
 * Unlike decimal-number normalization, this deliberately preserves every
 * non-digit character because SKU and QR payloads may contain punctuation.
 */
export function normalizeLocalizedBarcodeInput(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .trim();
}

export const DEFAULT_BARCODE_DETECTOR_FORMATS = Object.freeze([
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "code_93",
  "itf",
  "codabar",
  "qr_code",
  "data_matrix",
  "aztec",
  "pdf417",
] as const);

/**
 * Use only formats reported by the browser when the BarcodeDetector API
 * exposes format discovery. Older implementations fall back to the default
 * list and keep manual entry available if detector construction is rejected.
 */
export function resolveSupportedBarcodeFormats(
  supportedFormats?: readonly string[] | null,
): string[] {
  const available = supportedFormats ?? DEFAULT_BARCODE_DETECTOR_FORMATS;
  return DEFAULT_BARCODE_DETECTOR_FORMATS.filter((format) => available.includes(format));
}

/**
 * Return the next valid cart total after one more barcode scan.
 * A scan adds the product's minimum quantity on the first add, then advances
 * by the server-defined quantity multiple. Invalid policies and totals above
 * the cart's 10,000-unit bound fail closed.
 */
export function nextBarcodeScanQuantity(
  currentQuantity: number,
  minimumQuantity: number,
  quantityMultiple: number,
): number | null {
  const MAX_QUANTITY = 10_000;
  if (
    !Number.isSafeInteger(currentQuantity) || currentQuantity < 0 || currentQuantity > MAX_QUANTITY ||
    !Number.isSafeInteger(minimumQuantity) || minimumQuantity < 1 || minimumQuantity > MAX_QUANTITY ||
    !Number.isSafeInteger(quantityMultiple) || quantityMultiple < 1 || quantityMultiple > MAX_QUANTITY
  ) {
    return null;
  }

  const nextQuantity = currentQuantity < minimumQuantity
    ? minimumQuantity
    : currentQuantity + (
      (currentQuantity - minimumQuantity) % quantityMultiple === 0
        ? quantityMultiple
        : quantityMultiple - ((currentQuantity - minimumQuantity) % quantityMultiple)
    );
  return nextQuantity <= MAX_QUANTITY ? nextQuantity : null;
}
