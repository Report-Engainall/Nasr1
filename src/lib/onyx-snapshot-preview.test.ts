import { describe, expect, it } from "vitest";
import type { OnyxSnapshotRow } from "./api";
import { projectOnyxSnapshotPreviewRow } from "./onyx-snapshot-preview";

function snapshotRow(overrides: Partial<OnyxSnapshotRow> = {}): OnyxSnapshotRow {
  return {
    id: "row-1",
    snapshot_id: "snapshot-1",
    row_number: 7,
    canonical_key: null,
    row_hash: "hash-1",
    status: "valid",
    data: {},
    errors: null,
    created_at: "2026-11-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("safe Onyx snapshot row preview", () => {
  it("projects product identifiers, the three explicit source prices and unapproved stock labels", () => {
    const preview = projectOnyxSnapshotPreviewRow(snapshotRow({
      canonical_key: "000125",
      data: {
        item_code: "999999",
        product_name: "دقيق فاخر",
        unit: "كيس",
        barcode: "6280001",
        category_name: "الدقيق",
        price_wholesale_of_wholesale: 10,
        price_wholesale: 11,
        price_retail: 12,
        warehouse_name: "المخزن الرئيسي",
        quantity: 40,
        cost: 7,
      },
    }), "products");

    expect(preview.matchingCode).toBe("000125");
    expect(preview.title).toBe("دقيق فاخر");
    expect(preview.facts).toContainEqual({ label: "جملة الجملة", value: "10" });
    expect(preview.facts).toContainEqual({ label: "الجملة", value: "11" });
    expect(preview.facts).toContainEqual({ label: "التجزئة", value: "12" });
    expect(preview.facts).toContainEqual({ label: "رصيد المصدر — غير معتمد", value: "40" });
    expect(JSON.stringify(preview)).not.toContain("cost");
    expect(preview.facts.some((fact) => fact.value === "7")).toBe(false);
  });

  it("does not substitute missing prices with zero or another tier", () => {
    const preview = projectOnyxSnapshotPreviewRow(snapshotRow({
      data: { item_code: "P-1", product_name: "سكر", price_wholesale: 15 },
    }), "products");

    expect(preview.facts).toEqual([{ label: "الجملة", value: "15" }]);
  });

  it("projects customer identity and contact fields without source tier or credit data", () => {
    const preview = projectOnyxSnapshotPreviewRow(snapshotRow({
      canonical_key: "C-001",
      data: {
        customer_code: "C-002",
        business_name: "مؤسسة تجارية",
        contact_name: "مسؤول المشتريات",
        phone: "777000000",
        email: "buyer@example.test",
        address: "صنعاء",
        source_customer_tier: "vip",
        tier: "wholesale",
        credit_limit: 50000,
        account_balance: 2000,
      },
    }), "customers");

    expect(preview.matchingCode).toBe("C-001");
    expect(preview.title).toBe("مؤسسة تجارية");
    expect(preview.facts).toContainEqual({ label: "الهاتف", value: "777000000" });
    expect(JSON.stringify(preview)).not.toContain("vip");
    expect(JSON.stringify(preview)).not.toContain("wholesale");
    expect(JSON.stringify(preview)).not.toContain("50000");
    expect(JSON.stringify(preview)).not.toContain("2000");
  });

  it("projects ProductUnits conversion identity while omitting per-unit prices and operational flags", () => {
    const preview = projectOnyxSnapshotPreviewRow(snapshotRow({
      canonical_key: "P-001::BOX",
      data: {
        item_code: "P-001",
        unit_code: "BOX",
        unit_name: "كرتون",
        conversion_factor: 24,
        is_base_unit: false,
        unit_cost_price: 8,
        unit_selling_price: 12,
        barcode: "6280000001",
        sales_allowed: true,
        purchase_allowed: true,
      },
    }), "product_units");

    expect(preview.matchingCode).toBe("P-001::BOX");
    expect(preview.title).toBe("كرتون");
    expect(preview.subtitle).toBe("BOX");
    expect(preview.facts).toContainEqual({ label: "كود الصنف", value: "P-001" });
    expect(preview.facts).toContainEqual({ label: "كود الوحدة", value: "BOX" });
    expect(preview.facts).toContainEqual({ label: "معامل التحويل", value: "24" });
    expect(JSON.stringify(preview)).not.toContain("unit_cost_price");
    expect(JSON.stringify(preview)).not.toContain("unit_selling_price");
    expect(JSON.stringify(preview)).not.toContain("6280000001");
    expect(JSON.stringify(preview)).not.toContain("sales_allowed");
  });

  it("keeps rejected-row reasons but bounds their count and length", () => {
    const preview = projectOnyxSnapshotPreviewRow(snapshotRow({
      status: "rejected",
      errors: [
        "سبب أول",
        { reason: "سبب ثان" },
        { message: "سبب ثالث" },
        "سبب رابع",
        "سبب خامس",
        "سبب سادس",
        "x".repeat(300),
      ],
    }), "products");

    expect(preview.status).toBe("rejected");
    expect(preview.errors).toHaveLength(5);
    expect(preview.errors[0]).toBe("سبب أول");
    expect(preview.errors.every((error) => error.length <= 240)).toBe(true);
  });

  it("does not infer row success from an unknown source status", () => {
    const preview = projectOnyxSnapshotPreviewRow(snapshotRow({ status: "applied" }), "customers");
    expect(preview.status).toBe("unknown");
  });
});
