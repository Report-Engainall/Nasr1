import { describe, expect, it } from "vitest";
import {
  buildOrdersCsv,
  validateOrdersExportFilters,
  type AsyncOrderCsvRow,
} from "./async-export-csv";

const expectedHeaders = [
  "رقم الطلب",
  "تاريخ الطلب",
  "الحالة",
  "رقم العميل",
  "اسم العميل",
  "رقم الصنف",
  "اسم الصنف",
  "الوحدة",
  "الكمية",
  "سعر الوحدة",
  "الخصم",
  "صافي البند",
  "إجمالي الطلب",
];

const orderRow = {
  orderNumber: "ORD-00012",
  createdAt: "2026-10-25T10:00:00.000Z",
  status: "confirmed",
  customerCode: "000125",
  customerName: "متجر الاختبار",
  itemCode: "000017",
  itemName: "صنف اختبار",
  unit: "قطعة",
  quantity: 2,
  unitPrice: "125.00",
  discount: "0.00",
  lineTotal: "250.00",
  orderTotal: "250.00",
} satisfies AsyncOrderCsvRow;

describe("async order CSV output field allowlist", () => {
  it("emits the approved 13-column transaction schema and preserves zero-padded identifiers", () => {
    const csv = buildOrdersCsv([orderRow]);
    const [header, row] = csv.split("\r\n");

    expect(header).toBe("\uFEFF" + expectedHeaders.map((value) => '"' + value + '"').join(","));
    expect(row).toBe(
      ['"ORD-00012"', '"2026-10-25T10:00:00.000Z"', '"confirmed"', '"000125"',
        '"متجر الاختبار"', '"000017"', '"صنف اختبار"', '"قطعة"', "2", "125", "0", "250", "250"].join(","),
    );
    expect(row?.split(",")).toHaveLength(13);
  });

  it("drops cost, margin, hidden catalog-price, warehouse, and foreign-tenant fields even if present at runtime", () => {
    const untrustedRuntimeRow = {
      ...orderRow,
      organization_id: "FOREIGN_ORGANIZATION_SENTINEL",
      warehouse_id: "PRIVATE_WAREHOUSE_SENTINEL",
      inventory_row_id: "PRIVATE_INVENTORY_ID_SENTINEL",
      quantity_on_hand: "PRIVATE_ON_HAND_SENTINEL",
      base_price: "BASE_PRICE_SENTINEL",
      display_price: "HIDDEN_CATALOG_PRICE_SENTINEL",
      price_wholesale_of_wholesale: "FOREIGN_TIER_SENTINEL",
      price_wholesale: "FOREIGN_WHOLESALE_PRICE_SENTINEL",
      price_retail: "FOREIGN_RETAIL_PRICE_SENTINEL",
      cost_price: "INTERNAL_COST_SENTINEL",
      purchase_price: "INTERNAL_PURCHASE_PRICE_SENTINEL",
      unit_cost: "INTERNAL_UNIT_COST_SENTINEL",
      profit_margin: "INTERNAL_PROFIT_MARGIN_SENTINEL",
      gross_profit: "INTERNAL_GROSS_PROFIT_SENTINEL",
      margin: "INTERNAL_MARGIN_SENTINEL",
      hidden_price: "HIDDEN_PRICE_SENTINEL",
    } as AsyncOrderCsvRow;

    const csv = buildOrdersCsv([untrustedRuntimeRow]);

    for (const sentinel of [
      "FOREIGN_ORGANIZATION_SENTINEL",
      "PRIVATE_WAREHOUSE_SENTINEL",
      "PRIVATE_INVENTORY_ID_SENTINEL",
      "PRIVATE_ON_HAND_SENTINEL",
      "BASE_PRICE_SENTINEL",
      "HIDDEN_CATALOG_PRICE_SENTINEL",
      "FOREIGN_TIER_SENTINEL",
      "FOREIGN_WHOLESALE_PRICE_SENTINEL",
      "FOREIGN_RETAIL_PRICE_SENTINEL",
      "INTERNAL_COST_SENTINEL",
      "INTERNAL_PURCHASE_PRICE_SENTINEL",
      "INTERNAL_UNIT_COST_SENTINEL",
      "INTERNAL_PROFIT_MARGIN_SENTINEL",
      "INTERNAL_GROSS_PROFIT_SENTINEL",
      "INTERNAL_MARGIN_SENTINEL",
      "HIDDEN_PRICE_SENTINEL",
    ]) {
      expect(csv).not.toContain(sentinel);
    }

    // The export is for authorized staff roles, so historical order price/discount/total
    // snapshots are allowed. Catalog tier/cost fields above are not part of that contract.
    expect(csv).toContain('"سعر الوحدة"');
    expect(csv).toContain(",125,0,250,250");
  });

  it("rejects invalid monetary values instead of emitting false numeric cells", () => {
    expect(() => buildOrdersCsv([{ ...orderRow, unitPrice: Number.NaN }])).toThrow(/سعر الوحدة/);
    expect(() => buildOrdersCsv([{ ...orderRow, lineTotal: -0.01 }])).toThrow(/صافي البند/);
  });

  it("rejects caller-supplied organization filters instead of allowing cross-tenant scope selection", () => {
    expect(validateOrdersExportFilters({
      date_from: "2026-10-01",
      date_to: "2026-10-31",
    })).toEqual({ date_from: "2026-10-01", date_to: "2026-10-31" });

    expect(() => validateOrdersExportFilters({
      date_from: "2026-10-01",
      date_to: "2026-10-31",
      organization_id: "FOREIGN_ORGANIZATION_SENTINEL",
    })).toThrow(/مرشحات التصدير غير مدعومة/);
  });
});
