import { describe, expect, it } from "vitest";
import { ONYX_PRO_DATASETS, getOnyxProHeaders } from "./onyx-pro-schema";
import { parseXlsxFirstWorksheet } from "./unified-import";
import {
  buildOnyxProWorkbook,
  onyxProDatasetCsvFilename,
  onyxProWorkbookFilename,
} from "./onyx-pro-workbook";

function findAscii(bytes: Uint8Array, value: string): boolean {
  const expected = new TextEncoder().encode(value);
  outer: for (let start = 0; start <= bytes.length - expected.length; start += 1) {
    for (let offset = 0; offset < expected.length; offset += 1) {
      if (bytes[start + offset] !== expected[offset]) continue outer;
    }
    return true;
  }
  return false;
}

describe("Onyx Pro multi-sheet XLSX exchange template", () => {
  it("creates all entity worksheets in one valid OOXML package", () => {
    const bytes = buildOnyxProWorkbook();
    expect(bytes.length).toBeGreaterThan(1000);
    expect(findAscii(bytes, "xl/workbook.xml")).toBe(true);
    expect(findAscii(bytes, "xl/_rels/workbook.xml.rels")).toBe(true);
    for (const dataset of ONYX_PRO_DATASETS) {
      expect(findAscii(bytes, 'name="' + dataset.sheetName + '"')).toBe(true);
    }
    for (let index = 1; index <= ONYX_PRO_DATASETS.length; index += 1) {
      expect(findAscii(bytes, "xl/worksheets/sheet" + index + ".xml")).toBe(true);
    }
  });

  it("round-trips the first generated sheet through the existing XLSX import parser", async () => {
    const bytes = buildOnyxProWorkbook(["products", "customers"]);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const rows: string[][] = [];
    const parsed = await parseXlsxFirstWorksheet(new Blob([buffer]), (values) => rows.push(values));
    expect(parsed.worksheetName).toBe("Products");
    expect(rows[0]).toEqual(getOnyxProHeaders("products"));
    expect(parsed.rowCount).toBe(1);
  });

  it("selects the Products worksheet by name when it is not the first visible tab", async () => {
    const bytes = buildOnyxProWorkbook(["orders", "products", "stock_balances"]);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const rows: string[][] = [];
    const parsed = await parseXlsxFirstWorksheet(
      new Blob([buffer]),
      (values) => rows.push(values),
      { preferredWorksheetNames: ["Products"] },
    );
    expect(parsed.worksheetNames).toEqual(["Orders", "Products", "StockBalances"]);
    expect(parsed.worksheetName).toBe("Products");
    expect(rows[0]).toEqual(getOnyxProHeaders("products"));
  });

  it("supports a selected subset without silently adding unrequested sheets", () => {
    const bytes = buildOnyxProWorkbook(["customers", "price_list_lines"]);
    expect(findAscii(bytes, 'name="Customers"')).toBe(true);
    expect(findAscii(bytes, 'name="PriceListLines"')).toBe(true);
    expect(findAscii(bytes, 'name="Orders"')).toBe(false);
  });

  it("rejects empty, duplicate and unknown dataset selections", () => {
    expect(() => buildOnyxProWorkbook([])).toThrow();
    expect(() => buildOnyxProWorkbook(["customers", "customers"])).toThrow();
    expect(() => buildOnyxProWorkbook(["not_a_dataset"])).toThrow();
  });

  it("uses safe and predictable template filenames", () => {
    expect(onyxProWorkbookFilename()).toBe("Aghbari-Onyx-Pro-Exchange-Template.xlsx");
    expect(onyxProDatasetCsvFilename("stock_balances")).toContain("StockBalances");
    expect(() => onyxProDatasetCsvFilename("missing")).toThrow();
  });
});
