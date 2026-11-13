import { describe, expect, it } from "vitest";
import { normalizeLocalizedDecimalInput } from "./localized-number-input";

describe("normalizeLocalizedDecimalInput", () => {
  it("normalizes Arabic-Indic whole and decimal digits", () => {
    expect(normalizeLocalizedDecimalInput("١٢٣٫٤٥")).toBe("123.45");
  });

  it("normalizes Eastern Arabic-Indic (Persian) digits", () => {
    expect(normalizeLocalizedDecimalInput("۱۲۳۴٫۵۶")).toBe("1234.56");
  });

  it("removes supported thousands separators without changing the value", () => {
    expect(normalizeLocalizedDecimalInput("١٬٢٣٤٫٥٦")).toBe("1234.56");
    expect(normalizeLocalizedDecimalInput("1,234.56")).toBe("1234.56");
  });

  it("preserves an in-progress decimal and an empty input", () => {
    expect(normalizeLocalizedDecimalInput("")).toBe("");
    expect(normalizeLocalizedDecimalInput("١٢٫")).toBe("12.");
  });

  it("does not silently discard unsupported characters", () => {
    const normalized = normalizeLocalizedDecimalInput("١٢x٣");
    expect(normalized).toBe("12x3");
    expect(Number.isNaN(Number(normalized))).toBe(true);
  });
});
