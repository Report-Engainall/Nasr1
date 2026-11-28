import { describe, expect, it } from "vitest";
import { buildOnyxProductUnitKey, validateOnyxProductUnitRow } from "./onyx-product-unit-import";

const validRow = {
  item_code: "000125",
  unit_code: "BOX",
  unit_name: "كرتون",
  conversion_factor: "24",
  is_base_unit: "لا",
};

describe("Onyx ProductUnits validation", () => {
  it("accepts a bounded alternate unit with a positive integer conversion factor", () => {
    expect(validateOnyxProductUnitRow(validRow)).toEqual([]);
  });

  it.each(["", "0", "-1", "+2", "1.5", "2.25", "1e3", "1000001", "99999999", "NaN"] )(
    "rejects invalid conversion factors: %s",
    (conversion_factor) => {
      expect(validateOnyxProductUnitRow({ ...validRow, conversion_factor }).join(" "))
        .toContain("معامل التحويل");
    },
  );

  it("requires a base-unit row to use factor one", () => {
    expect(validateOnyxProductUnitRow({
      ...validRow,
      is_base_unit: "نعم",
      conversion_factor: "24",
    }).join(" ")).toContain("الوحدة الأساسية");
    expect(validateOnyxProductUnitRow({
      ...validRow,
      is_base_unit: "true",
      conversion_factor: "1",
    })).toEqual([]);
  });

  it("rejects malformed base-unit flags", () => {
    expect(validateOnyxProductUnitRow({ ...validRow, is_base_unit: "maybe" }).join(" "))
      .toContain("is_base_unit");
  });

  it("limits item, unit code and unit name lengths to the database command contract", () => {
    expect(validateOnyxProductUnitRow({ ...validRow, item_code: "I".repeat(101) }).join(" "))
      .toContain("item_code");
    expect(validateOnyxProductUnitRow({ ...validRow, unit_code: "U".repeat(81) }).join(" "))
      .toContain("unit_code");
    expect(validateOnyxProductUnitRow({ ...validRow, unit_name: "N".repeat(41) }).join(" "))
      .toContain("unit_name");
  });

  it("builds a stable case-insensitive key per product and unit", () => {
    expect(buildOnyxProductUnitKey(" item-01 ", " box ")).toBe("ITEM-01::BOX");
    expect(buildOnyxProductUnitKey("ITEM-01", "PACK")).not.toBe(
      buildOnyxProductUnitKey("ITEM-01", "BOX"),
    );
  });
});