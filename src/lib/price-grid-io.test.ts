// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { ProductPriceGridRow } from "@/lib/api";
import {
  buildPriceGridCsv,
  parsePriceGridCsv,
  parsePriceGridRecords,
  PRICE_GRID_EXPORT_HEADERS,
} from "@/lib/price-grid-csv";
import { buildPriceGridXlsx } from "@/lib/price-grid-xlsx";
import { parseXlsxFirstWorksheet } from "@/lib/unified-import";

const product: ProductPriceGridRow = {
  id: "b3c97302-9f92-47e2-8b37-bc601c13c246",
  item_code: "000041",
  name: "طحين فاخر",
  unit: "كيس",
  is_active: true,
  category_id: "c4c2b301-7e55-4bc4-9e84-776e4511c8e5",
  category_name: "الدقيق",
  base_price: 125.5,
  price_wholesale_of_wholesale: 118.25,
  price_wholesale: 121,
  price_retail: 130,
  quantity_on_hand_total: 40.125,
  quantity_reserved_total: 2.5,
  quantity_available_total: 37.625,
  reorder_point_total: 12,
  inventory_warehouse_count: 2,
};

const expectedHeaders = [
  "م",
  "كود الصنف",
  "اسم الصنف",
  "الوحدة",
  "",
  "السعر الأساسي",
  "جملة الجملة",
  "الجملة",
  "التجزئة",
  "إجمالي الرصيد الفعلي",
  "إجمالي الكمية المحجوزة",
  "إجمالي المتاح",
  "إجمالي حد إعادة الطلب",
  "عدد المخازن ذات الرصيد",
  "التصنيف",
];

describe("price-grid CSV/XLSX export-import contract", () => {
  it("uses the agreed column positions and does not export internal database IDs", () => {
    expect([...PRICE_GRID_EXPORT_HEADERS]).toEqual(expectedHeaders);
    expect(PRICE_GRID_EXPORT_HEADERS[1]).toBe("كود الصنف");
    expect(PRICE_GRID_EXPORT_HEADERS[4]).toBe("");
    expect(PRICE_GRID_EXPORT_HEADERS[5]).toBe("السعر الأساسي");

    const csv = buildPriceGridCsv([product]);
    expect(csv).toContain('"1","000041","طحين فاخر","كيس","","125.50"');
    expect(csv).not.toContain(product.id);

    const imported = parsePriceGridCsv(csv, [product]);
    expect(imported.itemCount).toBe(1);
    expect(imported.drafts[product.id]).toEqual({
      basePrice: "125.5",
      wholesaleOfWholesale: "118.25",
      wholesale: "121",
      retail: "130",
    });
  });

  it("round-trips the XLSX worksheet columns into the same unsaved price drafts", async () => {
    const records: string[][] = [];
    const result = await parseXlsxFirstWorksheet(
      buildPriceGridXlsx([product]),
      (values) => { records.push(values); },
      { preferredWorksheetNames: ["شبكة الأسعار"] },
    );

    expect(result.worksheetName).toBe("شبكة الأسعار");
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(expectedHeaders);
    expect(records[1]).toEqual([
      "1",
      "000041",
      "طحين فاخر",
      "كيس",
      "",
      "125.50",
      "118.25",
      "121.00",
      "130.00",
      "40.125",
      "2.5",
      "37.625",
      "12",
      "2",
      "الدقيق",
    ]);
    expect(records[1]).not.toContain(product.id);

    const imported = parsePriceGridRecords(records, [product]);
    expect(imported.itemCount).toBe(1);
    expect(imported.drafts[product.id]).toEqual({
      basePrice: "125.5",
      wholesaleOfWholesale: "118.25",
      wholesale: "121",
      retail: "130",
    });
  });
});
