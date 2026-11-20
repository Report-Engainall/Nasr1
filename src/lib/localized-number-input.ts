/**
 * Normalize decimal quantities typed in Arabic-first interfaces.
 *
 * Arabic-Indic and Eastern Arabic-Indic digits are mapped to ASCII. The Arabic
 * decimal separator is mapped to ".", and Arabic/Western grouping separators
 * are removed. Other characters are preserved so caller validation rejects
 * malformed input instead of silently changing it.
 */
export function normalizeLocalizedDecimalInput(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/٫/g, ".")
    .replace(/[٬,]/g, "")
    .trim();
}

/**
 * Parse a non-negative stock quantity typed in an Arabic-first interface.
 * Grouping separators are validated before removal; malformed input is never
 * silently transformed into a different quantity.
 */
export function parseLocalizedQuantityInput(value: string): number | null {
  let normalized = value.trim();
  if (!normalized) return null;
  normalized = normalized
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));

  const decimalSeparators = normalized.match(/[.٫]/g) ?? [];
  if (decimalSeparators.length > 1) return null;
  const decimalIndex = Math.max(normalized.indexOf("."), normalized.indexOf("٫"));
  let integerPart = decimalIndex < 0 ? normalized : normalized.slice(0, decimalIndex);
  const fractionPart = decimalIndex < 0 ? undefined : normalized.slice(decimalIndex + 1);
  const groupSeparator = integerPart.includes("٬") ? "٬" : integerPart.includes(",") ? "," : null;
  if (groupSeparator) {
    const otherSeparator = groupSeparator === "٬" ? "," : "٬";
    const groups = integerPart.split(groupSeparator);
    if (
      integerPart.includes(otherSeparator) ||
      !/^\d{1,3}$/.test(groups[0]) ||
      groups.slice(1).some((group) => !/^\d{3}$/.test(group))
    ) return null;
    integerPart = groups.join("");
  }
  if (!integerPart && fractionPart !== undefined && fractionPart.length === 0) return null;
  if (!integerPart && fractionPart !== undefined) integerPart = "0";
  if (!/^\d+$/.test(integerPart)) return null;
  if (fractionPart !== undefined && !/^\d{0,3}$/.test(fractionPart)) return null;
  const parsed = Number(integerPart + (fractionPart === undefined ? "" : "." + fractionPart));
  if (
    !Number.isFinite(parsed) || parsed < 0 || parsed > 999999999999.999 ||
    !Number.isSafeInteger(Math.round(parsed * 1000)) ||
    Math.abs(Math.round(parsed * 1000) / 1000 - parsed) >= 1e-9
  ) return null;
  return parsed;
}
