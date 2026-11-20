import { describe, expect, it } from "vitest";
import { normalizeLocalizedDecimalInput, parseLocalizedQuantityInput } from "./localized-number-input";

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

describe("parseLocalizedQuantityInput", () => {
  it.each([
    ["Arabic-Indic decimal", "١٢٥٫٥", 125.5],
    ["Persian decimal", "۱۲۵.۵", 125.5],
    ["Arabic thousands separator", "١٬٢٣٤٫٥", 1234.5],
    ["Western thousands separator", "1,234.5", 1234.5],
    ["leading decimal separator", "٫٥", 0.5],
    ["zero", "٠", 0],
    ["integer with grouping", "1,234", 1234],
  ])("parses %s without changing its quantity", (_label, draft, expected) => {
    expect(parseLocalizedQuantityInput(draft)).toBe(expected);
  });
  it.each(["١٢٬٣٫٥","١٢٥٫١٢٣٤","1e3",".","٫","-1","1,23","1٬234,567","1.2٫3"])(
    "rejects malformed or unsupported quantity input: %s",
    (draft) => expect(parseLocalizedQuantityInput(draft)).toBeNull(),
  );
  it("accepts a completed integer followed by a decimal mark", () => {
    expect(parseLocalizedQuantityInput("١٢٫")).toBe(12);
  });
});
