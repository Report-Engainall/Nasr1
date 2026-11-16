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


describe("resolveSupportedBarcodeFormats", () => {
  it("keeps only formats the browser reports as supported", async () => {
    const { resolveSupportedBarcodeFormats } = await import("./localized-barcode-input");
    expect(resolveSupportedBarcodeFormats(["qr_code", "ean_13", "data_matrix"])).toEqual([
      "ean_13",
      "qr_code",
      "data_matrix",
    ]);
  });

  it("uses the supported default set when format discovery is unavailable", async () => {
    const { DEFAULT_BARCODE_DETECTOR_FORMATS, resolveSupportedBarcodeFormats } =
      await import("./localized-barcode-input");
    expect(resolveSupportedBarcodeFormats()).toEqual([...DEFAULT_BARCODE_DETECTOR_FORMATS]);
  });

  it("returns no camera formats when the browser reports none", async () => {
    const { resolveSupportedBarcodeFormats } = await import("./localized-barcode-input");
    expect(resolveSupportedBarcodeFormats([])).toEqual([]);
  });
});
