import { describe, expect, it } from "vitest";
import { ONYX_PRO_DATASETS, getOnyxProHeaders } from "./onyx-pro-schema";
import { parseXlsxFirstWorksheet } from "./unified-import";
import {
  buildOnyxProDataCsv,
  buildOnyxProDataWorkbook,
  getOnyxProLiveHeaders,
  buildOnyxProWorkbook,
  onyxProDatasetCsvFilename,
  onyxProLiveDatasetCsvFilename,
  onyxProLiveWorkbookFilename,
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
    const parsed = await parseXlsxFirstWorksheet(new Blob([buffer]), (values) => { rows.push(values); });
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
      (values) => { rows.push(values); },
      { preferredWorksheetNames: ["Products"] },
    );
    expect(parsed.worksheetNames).toEqual(["Orders", "Products", "StockBalances"]);
    expect(parsed.worksheetName).toBe("Products");
    expect(rows[0]).toEqual(getOnyxProHeaders("products"));

    const customerBytes = buildOnyxProWorkbook(["orders", "customers"]);
    const customerBuffer = new ArrayBuffer(customerBytes.byteLength);
    new Uint8Array(customerBuffer).set(customerBytes);
    const customerRows: string[][] = [];
    const customerParsed = await parseXlsxFirstWorksheet(
      new Blob([customerBuffer]),
      (values) => { customerRows.push(values); },
      { preferredWorksheetNames: ["Customers"] },
    );
    expect(customerParsed.worksheetName).toBe("Customers");
    expect(customerRows[0]).toEqual(getOnyxProHeaders("customers"));
  });

  it("supports a selected subset without silently adding unrequested sheets", () => {
    const bytes = buildOnyxProWorkbook(["customers", "price_list_lines"]);
    expect(findAscii(bytes, 'name="Customers"')).toBe(true);
    expect(findAscii(bytes, 'name="PriceListLines"')).toBe(true);
    expect(findAscii(bytes, 'name="Orders"')).toBe(false);
  });

  it("embeds live product and customer rows in their selected Excel worksheets", async () => {
    const bytes = buildOnyxProDataWorkbook(["products", "customers"], {
      products: [{ product_id: "product-1", product_code: "000125", product_name: "أرز بسمتي" }],
      customers: [{ customer_id: "customer-1", customer_code: "0007", customer_name: "مؤسسة اختبار" }],
    });
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const products: string[][] = [];
    const productResult = await parseXlsxFirstWorksheet(new Blob([buffer]), (row) => { products.push(row); });
    expect(productResult.rowCount).toBe(2);
    expect(products[0]).toEqual(getOnyxProLiveHeaders("products"));
    expect(products[1][getOnyxProLiveHeaders("products").indexOf("رقم الصنف")]).toBe("000125");
    expect(products[1][getOnyxProLiveHeaders("products").indexOf("اسم الصنف")]).toBe("أرز بسمتي");
    expect(getOnyxProLiveHeaders("products")).not.toContain(
      ONYX_PRO_DATASETS.find((dataset) => dataset.id === "products")?.fields.find((field) => field.field === "cost_price")?.header,
    );

    const customers: string[][] = [];
    const customerResult = await parseXlsxFirstWorksheet(
      new Blob([buffer]),
      (row) => { customers.push(row); },
      { preferredWorksheetNames: ["Customers"] },
    );
    expect(customerResult.rowCount).toBe(2);
    expect(customers[0]).toEqual(getOnyxProLiveHeaders("customers"));
    expect(customers[1][getOnyxProLiveHeaders("customers").indexOf("رقم العميل")]).toBe("0007");
    expect(customers[1][getOnyxProLiveHeaders("customers").indexOf("اسم العميل")]).toBe("مؤسسة اختبار");
    expect(getOnyxProLiveHeaders("customers")).not.toContain(
      ONYX_PRO_DATASETS.find((dataset) => dataset.id === "customers")?.fields.find((field) => field.field === "credit_limit")?.header,
    );
  });



  it("exports active warehouse business identity without internal IDs or sensitive location data", async () => {
    const dataset = ONYX_PRO_DATASETS.find((item) => item.id === "warehouses");
    const fields = getOnyxProLiveHeaders("warehouses");
    expect(fields).toContain(dataset?.fields.find((field) => field.field === "warehouse_code")?.header);
    expect(fields).toContain(dataset?.fields.find((field) => field.field === "warehouse_name")?.header);
    for (const forbidden of ["warehouse_id", "address", "manager_name", "phone"]) {
      const header = dataset?.fields.find((field) => field.field === forbidden)?.header;
      if (header) expect(fields).not.toContain(header);
    }

    const bytes = buildOnyxProDataWorkbook(["warehouses"], {
      warehouses: [{
        warehouse_code: "WH-01",
        warehouse_name: "المستودع الرئيسي",
        is_active: "نعم",
      }],
    });
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const rows: string[][] = [];
    const parsed = await parseXlsxFirstWorksheet(
      new Blob([buffer]),
      (row) => { rows.push(row); },
      { preferredWorksheetNames: ["Warehouses"] },
    );
    expect(parsed.worksheetName).toBe("Warehouses");
    expect(parsed.rowCount).toBe(2);
    expect(rows[0]).toEqual(fields);
    expect(rows[1][fields.indexOf(dataset?.fields.find((field) => field.field === "warehouse_code")?.header ?? "")]).toBe("WH-01");
    expect(rows[1][fields.indexOf(dataset?.fields.find((field) => field.field === "warehouse_name")?.header ?? "")]).toBe("المستودع الرئيسي");
    expect(() => buildOnyxProDataCsv("warehouses", [{
      warehouse_code: "WH-01",
      warehouse_name: "مستودع",
      address: "عنوان داخلي",
    }])).toThrow("حقل غير معتمد");
  });

  it("exports live stock balances with quantity-only columns and an explicit source-read timestamp", async () => {
    const fields = getOnyxProLiveHeaders("stock_balances");
    const stockDataset = ONYX_PRO_DATASETS.find((dataset) => dataset.id === "stock_balances");
    expect(fields).toContain(stockDataset?.fields.find((field) => field.field === "quantity_on_hand")?.header);
    expect(fields).toContain(stockDataset?.fields.find((field) => field.field === "warehouse_code")?.header);
    for (const forbidden of ["opening_cost", "average_unit_cost", "total_stock_value", "warehouse_id", "snapshot_id"]) {
      const header = stockDataset?.fields.find((field) => field.field === forbidden)?.header;
      if (header) expect(fields).not.toContain(header);
    }

    const bytes = buildOnyxProDataWorkbook(["stock_balances"], {
      stock_balances: [{
        product_code: "000125",
        warehouse_code: "WH-01",
        quantity_on_hand: 12.5,
        quantity_reserved: 2,
        quantity_available: 10.5,
        last_movement_date: "2026-11-26T10:00:00.000Z",
        as_of_date: "2026-11-27T01:00:00.000Z",
      }],
    });
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const rows: string[][] = [];
    const parsed = await parseXlsxFirstWorksheet(
      new Blob([buffer]),
      (row) => { rows.push(row); },
      { preferredWorksheetNames: ["StockBalances"] },
    );
    expect(parsed.worksheetName).toBe("StockBalances");
    expect(parsed.rowCount).toBe(2);
    expect(rows[0]).toEqual(fields);
    expect(rows[1][fields.indexOf(stockDataset?.fields.find((field) => field.field === "product_code")?.header ?? "")]).toBe("000125");
    expect(rows[1][fields.indexOf(stockDataset?.fields.find((field) => field.field === "quantity_on_hand")?.header ?? "")]).toBe("12.5");
    expect(() => buildOnyxProDataCsv("stock_balances", [{
      product_code: "000125",
      warehouse_code: "WH-01",
      quantity_on_hand: 12.5,
      opening_cost: 45,
    }])).toThrow("حقل غير معتمد");
  });

  it("rejects unapproved fields and invalid cell values instead of silently exporting them", () => {
    expect(() => buildOnyxProDataWorkbook(["products"], {
      products: [{ product_code: "P-1", cost_price: 20 }],
    })).toThrow("حقل غير معتمد");
    expect(() => buildOnyxProDataWorkbook(["customers"], {
      customers: [{ customer_code: "C-1", credit_limit: 50_000 }],
    })).toThrow("حقل غير معتمد");
    expect(() => buildOnyxProDataCsv("products", [
      { product_code: "P-1", price_wholesale: 10 },
    ])).toThrow("حقل غير معتمد");
    expect(() => buildOnyxProDataWorkbook(["price_lists"], {
      price_lists: [],
    })).toThrow("لا يتوفر تصدير سجلات حية آمن");
    expect(() => buildOnyxProDataWorkbook(["products"], {
      products: [{ product_code: "P-1", product_name: { internal: true } as never }],
    })).toThrow("قيمة غير صالحة");
    expect(() => buildOnyxProDataWorkbook(["products"], {
      products: Array.from({ length: 10_001 }, () => ({})),
    })).toThrow("حد ملف Excel الآمن");
  });

  it("neutralizes spreadsheet formula injection in live CSV text fields", () => {
    const csv = buildOnyxProDataCsv("products", [
      { product_code: "=HYPERLINK(\"https://example.invalid\",\"open\")", product_name: "صنف" },
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("صنف");
    expect(csv).not.toContain(
      ONYX_PRO_DATASETS.find((dataset) => dataset.id === "products")?.fields.find((field) => field.field === "price_wholesale")?.header ?? "",
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("keeps live and header-template filenames distinct", () => {
    expect(onyxProWorkbookFilename()).toBe("Aghbari-Onyx-Pro-Exchange-Template.xlsx");
    expect(onyxProDatasetCsvFilename("stock_balances")).toContain("StockBalances-Headers.csv");
    expect(onyxProLiveDatasetCsvFilename("products")).toContain("Products-Data.csv");
    expect(onyxProLiveWorkbookFilename(new Date("2026-11-27T00:00:00.000Z"))).toBe("Aghbari-Onyx-Pro-Live-Export-2026-11-27.xlsx");
    expect(() => onyxProDatasetCsvFilename("missing")).toThrow();
  });

  it("rejects empty, duplicate and unknown template selections", () => {
    expect(() => buildOnyxProWorkbook([])).toThrow();
    expect(() => buildOnyxProWorkbook(["customers", "customers"])).toThrow();
    expect(() => buildOnyxProWorkbook(["not_a_dataset"])).toThrow();
  });
});
