import { describe, expect, it } from "vitest";
import { normalizeLocalizedBarcodeInput } from "./localized-barcode-input";

describe("normalizeLocalizedBarcodeInput", () => {
  it("leaves ASCII barcodes and SKU codes unchanged", () => {
    expect(normalizeLocalizedBarcodeInput("6291041500213")).toBe("6291041500213");
    expect(normalizeLocalizedBarcodeInput("SKU-AGH/24-A")).toBe("SKU-AGH/24-A");
  });

  it("normalizes Arabic-Indic digits", () => {
    expect(normalizeLocalizedBarcodeInput("٦٢٩١٠٤١٥٠٠٢١٣")).toBe("6291041500213");
  });

  it("normalizes Persian digits", () => {
    expect(normalizeLocalizedBarcodeInput("۶۲۹۱۰۴۱۵۰۰۲۱۳")).toBe("6291041500213");
  });

  it("preserves QR payload punctuation and non-digit content", () => {
    const payload = "aghbari://product/١٢٣?batch=٤٥٦&ref=SKU-٧";
    expect(normalizeLocalizedBarcodeInput(payload)).toBe(
      "aghbari://product/123?batch=456&ref=SKU-7",
    );
  });

  it("trims surrounding whitespace without changing internal separators", () => {
    expect(normalizeLocalizedBarcodeInput("  ١٢٣-ABC / ٤٥٦  ")).toBe("123-ABC / 456");
  });
});
