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
