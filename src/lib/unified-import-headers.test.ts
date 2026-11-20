import { describe, expect, it } from "vitest";
import { ONYX_ORDER_COLUMNS } from "@/lib/onyx-export";
import { detectImportDatasetKind, normalizeHeader, normalizeOnyxStockBalanceHeader, resolveImportProfileMapping } from "@/lib/unified-import";

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
      ["base_unit_name", "unit"],
      ["اسم الوحدة الأساسية", "unit"],
      ["quantity_on_hand", "quantity"],
      ["quantity_reserved", "reserved_quantity"],
      ["quantity_available", "available_quantity"],
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

  it("detects product files from Arabic/English item identity and product descriptors", () => {
    expect(detectImportDatasetKind(["رقم الصنف", "اسم الصنف", "الوحدة", "سعر التجزئة"]).kind).toBe("products");
    expect(detectImportDatasetKind(["item_code", "product_name", "unit", "price_retail"]).kind).toBe("products");
    expect(detectImportDatasetKind(["product_code", "product_name", "base_unit_name", "price_retail"]).kind).toBe("products");
  });

  it("detects customer master files without trusting a source tier", () => {
    expect(detectImportDatasetKind(["رقم العميل", "اسم المؤسسة", "رقم الجوال", "فئة العميل"]).kind).toBe("customers");
  });

  it("detects order headers and the legacy 27-column Onyx order detail layout separately from products", () => {
    expect(detectImportDatasetKind(["رقم الطلب", "رقم العميل", "رقم الصنف", "اسم الصنف"]).kind).toBe("orders");
    expect(detectImportDatasetKind([...ONYX_ORDER_COLUMNS]).kind).toBe("orders");
  });

  it("detects price lists and price lines separately from product catalog rows", () => {
    expect(normalizeHeader("كود قائمة الأسعار")).toBe("price_list_code");
    expect(normalizeHeader("سعر الوحدة")).toBe("unit_price");
    expect(detectImportDatasetKind(["كود قائمة الأسعار", "رقم الصنف", "الوحدة", "سعر الوحدة", "العملة"]).kind).toBe("pricing");
  });

  it("adds non-conflicting Onyx field names without changing legacy ambiguous headers", () => {
    expect(normalizeHeader("رقم الطلب")).toBe("order_number");
    expect(normalizeHeader("كود المخزن")).toBe("warehouse_code");
    expect(normalizeHeader("رقم الصنف")).toBe("item_code");
    expect(normalizeHeader("البيان")).toBe("description");
    expect(normalizeHeader("product_code")).toBe("item_code");
  });

  it("detects inventory-only sheets before they can enter the product apply path", () => {
    expect(detectImportDatasetKind(["رقم الصنف", "المخزن", "الرصيد الافتتاحي"]).kind).toBe("inventory");
    expect(detectImportDatasetKind(["warehouse_code", "item_code", "quantity"]).kind).toBe("inventory");
    expect(detectImportDatasetKind(["item_code", "quantity"]).kind).toBe("inventory");
  });

  it("keeps product sheets with product details and optional warehouse quantities in the product path", () => {
    expect(detectImportDatasetKind(["item_code", "product_name", "unit", "warehouse_name", "quantity"]).kind).toBe("products");
  });

  it("fails closed when a file mixes product/customer identities or customer and stock columns", () => {
    expect(detectImportDatasetKind(["item_code", "product_name", "customer_code", "business_name"]).kind).toBe("ambiguous");
    expect(detectImportDatasetKind(["customer_code", "warehouse_name", "quantity"]).kind).toBe("ambiguous");
  });

  it("requires a manual type selection when headers do not establish a known dataset", () => {
    expect(detectImportDatasetKind(["document_date", "amount", "notes"]).kind).toBe("unknown");
  });


  it("classifies Onyx ProductUnits as a dedicated import instead of product or inventory rows", () => {
    const headers = ["item_code", "unit_code", "unit_name", "conversion_factor"];
    expect(detectImportDatasetKind(headers).kind).toBe("product_units");
    expect(resolveImportProfileMapping("product_units", [], undefined)).toEqual({
      requiredColumns: ["item_code", "unit_code", "unit_name", "conversion_factor"],
      matchingKey: "product_unit_key",
    });
  });

  it("normalizes StockBalances worksheet headers and scopes the key to warehouse plus item", () => {
    expect(normalizeOnyxStockBalanceHeader("product_code")).toBe("item_code");
    expect(normalizeOnyxStockBalanceHeader("quantity_on_hand")).toBe("quantity");
    expect(normalizeOnyxStockBalanceHeader("رقم الصنف")).toBe("item_code");
    expect(resolveImportProfileMapping("inventory", [], undefined)).toEqual({
      requiredColumns: ["item_code", "quantity", "warehouse_code", "as_of_date"],
      matchingKey: "warehouse_item_key",
    });
  });

  it("does not classify unit conversion rows as StockBalances when warehouse is absent", () => {
    expect(detectImportDatasetKind(["product_code", "unit_code", "unit_name", "conversion_factor"]).kind)
      .toBe("product_units");
  });

  it("preserves the active product profile rules for product files", () => {
    expect(resolveImportProfileMapping("products", ["item_code", "unit"], "item_code"))
      .toEqual({ requiredColumns: ["item_code", "unit"], matchingKey: "item_code" });
  });
});
