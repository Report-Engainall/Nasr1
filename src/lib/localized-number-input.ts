/**
 * Normalize decimal quantities typed in Arabic-first interfaces.
 *
 * Arabic-Indic and Eastern Arabic-Indic digits are mapped to ASCII. The Arabic
 * decimal separator is mapped to ".", and Arabic/Western grouping separators
 * are removed. Other characters are preserved so the caller's numeric
 * validation rejects malformed input instead of silently changing it.
 */
export function normalizeLocalizedDecimalInput(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[٬,]/g, "")
    .trim();
}
