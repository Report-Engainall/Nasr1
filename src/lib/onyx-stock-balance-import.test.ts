import { describe, expect, it } from "vitest";
import { buildOnyxWarehouseItemKey, validateOnyxStockBalanceRow } from "./onyx-stock-balance-import";

const validRow = {
  item_code: "000125",
  warehouse_code: "WH-01",
  quantity: "125.375",
  as_of_date: "2026-11-17",
};

describe("Onyx StockBalances validation", () => {
  it("accepts a warehouse-scoped whole-product balance with a real ISO date", () => {
    expect(validateOnyxStockBalanceRow(validRow)).toEqual([]);
  });

  it.each(["-1", "+1", "00", "1,000", "1e3", "1.1234", "Infinity", "NaN", ".5", "5."])(
    "rejects quantity values outside the reconciliation grammar: %s",
    (quantity) => {
      expect(validateOnyxStockBalanceRow({ ...validRow, quantity }).join(" "))
        .toContain("كمية الرصيد");
    },
  );

  it.each(["", "2026-2-03", "2026-02-30", "2026-13-01", "0000-01-01", "17/11/2026"])(
    "rejects absent or impossible as-of dates: %s",
    (as_of_date) => {
      expect(validateOnyxStockBalanceRow({ ...validRow, as_of_date }).join(" "))
        .toContain("as_of_date");
    },
  );

  it("requires bounded item and warehouse identities", () => {
    expect(validateOnyxStockBalanceRow({ ...validRow, item_code: "" }).join(" "))
      .toContain("item_code");
    expect(validateOnyxStockBalanceRow({ ...validRow, warehouse_code: "" }).join(" "))
      .toContain("warehouse_code");
    expect(validateOnyxStockBalanceRow({ ...validRow, item_code: "X".repeat(201) }).join(" "))
      .toContain("item_code");
  });

  it("rejects granularity that the current warehouse reconciliation cannot represent", () => {
    expect(validateOnyxStockBalanceRow({ ...validRow, batch_number: "B-01" }).join(" "))
      .toContain("batch_number");
    expect(validateOnyxStockBalanceRow({ ...validRow, unit_code: "CASE" }).join(" "))
      .toContain("unit_code");
  });

  it("builds a case-insensitive composite identity scoped to warehouse and item", () => {
    expect(buildOnyxWarehouseItemKey(" item-01 ", " wh-a ")).toBe("WH-A::ITEM-01");
    expect(buildOnyxWarehouseItemKey("ITEM-01", "WH-B")).not.toBe(
      buildOnyxWarehouseItemKey("ITEM-01", "WH-A"),
    );
  });
});
