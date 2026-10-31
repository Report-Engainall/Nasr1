import { describe, expect, it } from "vitest";
import { projectCustomerQuotePrintDocument } from "@/lib/customer-quote-print";

const quote = {
  id: "PRIVATE-QUOTE-ID",
  quote_number: "QT-20261031-0017",
  status: "quoted",
  notes: "ملاحظة العميل",
  response_note: "العرض صالح حسب التاريخ المحدد.",
  created_at: "2026-10-31T09:00:00.000Z",
  quoted_at: "2026-10-31T09:15:00.000Z",
  valid_until: "2026-11-07T23:59:59.000Z",
  organization_id: "PRIVATE-TENANT-ID",
  created_by: "PRIVATE-ACTOR-ID",
  internal_notes: "PRIVATE-INTERNAL-NOTE",
};

const lines = [{
  id: "PRIVATE-LINE-ID",
  quote_id: "PRIVATE-QUOTE-ID",
  product_id: "PRIVATE-PRODUCT-ID",
  item_code: "000041",
  product_name_snapshot: "سكر",
  unit_snapshot: "كرتون",
  requested_quantity: 5,
  target_unit_price: 987654,
  quoted_unit_price: 125.5,
  cost_price: "PRIVATE-COST",
  margin: "PRIVATE-MARGIN",
}];

describe("customer quote print projection", () => {
  it("projects only the customer-facing quote and server-issued prices", () => {
    const document = projectCustomerQuotePrintDocument(quote, lines);
    expect(document).not.toBeNull();
    expect(Object.keys(document!).sort()).toEqual([
      "createdAt", "customerNotes", "items", "quoteNumber", "quotedAt",
      "responseNote", "statusLabel", "validUntil",
    ].sort());
    expect(Object.keys(document!.items[0]).sort()).toEqual([
      "itemCode", "productName", "quantity", "quotedUnitPrice", "unit",
    ].sort());
    expect(document).toMatchObject({
      quoteNumber: "QT-20261031-0017",
      statusLabel: "تم التسعير",
      customerNotes: "ملاحظة العميل",
      responseNote: "العرض صالح حسب التاريخ المحدد.",
    });
    expect(document!.items[0]).toMatchObject({
      itemCode: "000041", productName: "سكر", unit: "كرتون",
      quantity: 5, quotedUnitPrice: 125.5,
    });
    const serialized = JSON.stringify(document);
    for (const sentinel of [
      "PRIVATE-QUOTE-ID", "PRIVATE-TENANT-ID", "PRIVATE-ACTOR-ID",
      "PRIVATE-INTERNAL-NOTE", "PRIVATE-LINE-ID", "PRIVATE-PRODUCT-ID",
      "PRIVATE-COST", "PRIVATE-MARGIN", "987654", "target_unit_price",
    ]) expect(serialized).not.toContain(sentinel);
  });

  it("does not print a pending quote or a partially priced offer", () => {
    expect(projectCustomerQuotePrintDocument({ ...quote, status: "requested" }, lines)).toBeNull();
    expect(projectCustomerQuotePrintDocument(quote, [])).toBeNull();
    expect(projectCustomerQuotePrintDocument(quote, [{ ...lines[0], quoted_unit_price: null }])).toBeNull();
  });

  it("keeps malformed quantities and prices unavailable instead of zero sentinels", () => {
    expect(projectCustomerQuotePrintDocument(quote, [{
      ...lines[0], requested_quantity: 0,
    }])).toBeNull();
    expect(projectCustomerQuotePrintDocument(quote, [{
      ...lines[0], quoted_unit_price: "not-a-price",
    }])).toBeNull();
  });
});
