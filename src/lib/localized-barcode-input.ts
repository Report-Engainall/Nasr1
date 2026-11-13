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
