import { describe, expect, it } from "vitest";
import type { CustomerDirectoryRow } from "./customer-directory";
import type { ProductWithInventory } from "./types";
import {
  mapOnyxProCustomerRecord,
  mapOnyxProProductRecord,
} from "./onyx-pro-live-export";

describe("Onyx Pro live export projections", () => {
  it("maps product identity and inventory thresholds without exposing prices or costs", () => {
    const product = {
      id: "3c1b9a6e-2ee7-4c45-a7a6-9ceef5f1ea10",
      item_code: "000125",
      name: "أرز بسمتي",
      name_en: "Basmati Rice",
      sku: "RICE-125",
      barcode: "6280000001250",
      unit: "كيس",
      description: "أرز طويل الحبة",
      image_url: "https://cdn.example.invalid/rice.webp",
      is_active: true,
      status: "active",
      min_stock_level: 8,
      created_at: "2026-11-01T10:00:00.000Z",
      updated_at: "2026-11-02T10:00:00.000Z",
      base_price: 42,
      price_retail: 44,
      price_wholesale: 41,
      price_wholesale_of_wholesale: 39,
      cost_price: 30,
      category: { id: "category-id", code: "FOOD", name: "مواد غذائية" },
      inventory: { reorder_point: 12, warehouse_id: "warehouse-internal-id" },
    } as unknown as ProductWithInventory;

    const row = mapOnyxProProductRecord(product);
    expect(row.product_id).toBe(product.id);
    expect(row.product_code).toBe("000125");
    expect(row.product_name).toBe("أرز بسمتي");
    expect(row.category_code).toBe("FOOD");
    expect(row.category_name).toBe("مواد غذائية");
    expect(row.reorder_point).toBe(12);
    expect(row.is_active).toBe("نعم");
    expect(Object.keys(row)).not.toContain("base_price");
    expect(Object.keys(row)).not.toContain("price_retail");
    expect(Object.keys(row)).not.toContain("price_wholesale");
    expect(Object.keys(row)).not.toContain("price_wholesale_of_wholesale");
    expect(Object.keys(row)).not.toContain("cost_price");
    expect(Object.keys(row)).not.toContain("warehouse_id");
  });

  it("rejects products without a stable item code instead of creating an invalid import row", () => {
    const product = {
      id: "3c1b9a6e-2ee7-4c45-a7a6-9ceef5f1ea10",
      item_code: " ",
      name: "صنف",
      unit: "قطعة",
      is_active: true,
    } as unknown as ProductWithInventory;
    expect(() => mapOnyxProProductRecord(product)).toThrow("رقم الصنف");
  });

  it("maps customer contact and tier without exporting account, balance or credit data", () => {
    const customer = {
      id: "0ad225f2-0f42-4c72-9479-c50be6c9a7be",
      business_name: "مؤسسة الاختبار",
      contact_name: "جهة الاتصال",
      phone: "777000000",
      email: "buyer@example.invalid",
      customer_code: "0007",
      tier: "wholesale",
      current_balance: 15000,
      credit_limit: 50000,
      status: "approved",
      created_at: "2026-11-12T10:00:00.000Z",
      profile_id: "auth-profile-id",
    } as CustomerDirectoryRow;

    const row = mapOnyxProCustomerRecord(customer);
    expect(row.customer_id).toBe(customer.id);
    expect(row.customer_code).toBe("0007");
    expect(row.customer_name).toBe("مؤسسة الاختبار");
    expect(row.phone).toBe("777000000");
    expect(row.price_level_code).toBe("wholesale");
    expect(row.customer_status).toBe("approved");
    expect(Object.keys(row)).not.toContain("current_balance");
    expect(Object.keys(row)).not.toContain("credit_limit");
    expect(Object.keys(row)).not.toContain("profile_id");
    expect(Object.keys(row)).not.toContain("contact_name");
  });

  it("rejects a customer without a valid creation timestamp", () => {
    const customer = {
      id: "0ad225f2-0f42-4c72-9479-c50be6c9a7be",
      business_name: "مؤسسة الاختبار",
      status: "approved",
      created_at: "not-a-date",
    } as CustomerDirectoryRow;
    expect(() => mapOnyxProCustomerRecord(customer)).toThrow("تاريخ إنشاء العميل");
  });
});
