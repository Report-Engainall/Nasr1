import { describe, expect, it } from "vitest";
import { ONYX_ORDER_COLUMNS } from "@/lib/onyx-export";
import { normalizeHeader, resolveImportProfileMapping, resolveSnapshotImportKind } from "@/lib/unified-import";

describe("default Onyx and bulk business import headers", () => {
  it("maps every one of the 27 official Onyx order-template column labels", () => {
    const expected = [
      "item_code", "product_name", "unit", "warehouse_name", "quantity",
      "free_quantity", "price", "batch_number", "expiry_date", "beneficiary_id",
      "cost_center", "project", "activity", "quotation_number", "numeric_unit",
      "discount_1", "discount_2", "discount_3", "discount_type", "reserve_quantities",
      "reservation_until", "reserved_quantity", "description", "length", "width",
      "height", "count",
    ];
    expect(ONYX_ORDER_COLUMNS).toHaveLength(27);
    expect(ONYX_ORDER_COLUMNS.map((header) => normalizeHeader(header))).toEqual(expected);
  });

  it("recognizes common Arabic and English customer master-data columns", () => {
    const pairs: Array<[string, string]> = [
      ["رقم العميل", "customer_code"],
      ["كود الزبون", "customer_code"],
      ["اسم العميل", "customer_name"],
      ["اسم المؤسسة", "business_name"],
      ["الاسم التجاري", "business_name"],
      ["اسم المسؤول", "contact_name"],
      ["رقم الجوال", "phone"],
      ["البريد الالكتروني", "email"],
      ["العنوان", "address"],
      ["الرقم الضريبي", "tax_number"],
    ];
    for (const [header, canonical] of pairs) {
      expect(normalizeHeader(header), header).toBe(canonical);
    }
  });

  it("does not treat a source customer tier as an approved Nasr1 commercial tier", () => {
    expect(normalizeHeader("فئة العميل")).toBe("source_customer_tier");
    expect(normalizeHeader("شريحة العميل")).toBe("source_customer_tier");
  });

  it("keeps product identifiers and leading-zero codes as string-valued field names", () => {
    expect(normalizeHeader("رقم الصنف")).toBe("item_code");
    expect(normalizeHeader("رمز المنتج")).toBe("item_code");
    expect(normalizeHeader("باركود")).toBe("barcode");
  });

  it("uses customer_code instead of the product profile key for customer files", () => {
    expect(resolveImportProfileMapping("customers", ["item_code"], "item_code"))
      .toEqual({ requiredColumns: ["customer_code"], matchingKey: "customer_code" });
  });

  it("preserves the active product profile rules for product files", () => {
    expect(resolveImportProfileMapping("products", ["item_code", "unit"], "item_code"))
      .toEqual({ requiredColumns: ["item_code", "unit"], matchingKey: "item_code" });
  });

  it("binds snapshot application to the source job type and fails closed on unknown jobs", () => {
    expect(resolveSnapshotImportKind("unified_import_customers")).toBe("customers");
    expect(resolveSnapshotImportKind("unified_import_products")).toBe("products");
    expect(resolveSnapshotImportKind("unified_import")).toBe("products");
    expect(resolveSnapshotImportKind("inventory_import")).toBeNull();
    expect(resolveSnapshotImportKind(null)).toBeNull();
  });
});
