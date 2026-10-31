import { describe, expect, it } from "vitest";
import { projectCustomerQuotePrintDocument } from "@/lib/customer-quote-print";

const quote = {
  id: "PRIVATE-QUOTE-ID",
  quote_number: "QT-20261031-0007",
  status: "quoted",
  notes: "توريد شهري",
  response_note: "الأسعار صالحة حتى التاريخ المحدد.",
  created_at: "2026-10-30T10:00:00.000Z",
  quoted_at: "2026-10-31T09:00:00.000Z",
  valid_until: "2026-11-15T23:59:59.000Z",
  customer_id: "PRIVATE-CUSTOMER-ID",
  organization_id: "PRIVATE-TENANT-ID",
  created_by: "PRIVATE-ACTOR-ID",
};
const lines = [{
  id: "PRIVATE-QUOTE-LINE-ID",
  quote_id: "PRIVATE-QUOTE-ID",
  product_id: "PRIVATE-PRODUCT-ID",
  organization_id: "PRIVATE-TENANT-ID",
  item_code: "000041",
  product_name_snapshot: "سكر",
  unit_snapshot: "كرتون",
  requested_quantity: 3,
  target_unit_price: 9999,
  quoted_unit_price: 125,
  cost_price: "PRIVATE-COST-SENTINEL",
  margin: "PRIVATE-MARGIN-SENTINEL",
}];

describe("customer quote print projection", () => {
  it("projects only persisted customer quote values, preserving item code and calculated totals", () => {
    const document = projectCustomerQuotePrintDocument(quote, lines);
    expect(document).not.toBeNull();
    expect(Object.keys(document!).sort()).toEqual([
      "createdAt", "customerNote", "items", "quotedAt", "quoteNumber",
      "responseNote", "status", "statusLabel", "totalAmount", "validUntil",
    ].sort());
    expect(Object.keys(document!.items[0]).sort()).toEqual([
      "itemCode", "lineTotal", "productName", "quantity", "unit", "unitPrice",
    ].sort());
    expect(document).toMatchObject({
      quoteNumber: "QT-20261031-0007",
      statusLabel: "تم التسعير",
      customerNote: "توريد شهري",
      responseNote: "الأسعار صالحة حتى التاريخ المحدد.",
      totalAmount: 375,
    });
    expect(document!.items[0]).toMatchObject({
      itemCode: "000041", quantity: 3, unitPrice: 125, lineTotal: 375,
    });
  });
  it("never includes quote, tenant, customer, product, item, actor, target price, cost or margin data", () => {
    const serialized = JSON.stringify(projectCustomerQuotePrintDocument(quote, lines));
    for (const privateValue of [
      "PRIVATE-QUOTE-ID", "PRIVATE-CUSTOMER-ID", "PRIVATE-TENANT-ID",
      "PRIVATE-ACTOR-ID", "PRIVATE-QUOTE-LINE-ID", "PRIVATE-PRODUCT-ID",
      "PRIVATE-COST-SENTINEL", "PRIVATE-MARGIN-SENTINEL", "9999",
    ]) expect(serialized).not.toContain(privateValue);
  });
  it("does not enable printing for an unpriced request or a quote missing any saved line price", () => {
    expect(projectCustomerQuotePrintDocument({ ...quote, status: "requested" }, lines)).toBeNull();
    expect(projectCustomerQuotePrintDocument(quote, [
      ...lines,
      { ...lines[0], item_code: "000042", quoted_unit_price: null },
    ])).toBeNull();
  });
  it("keeps a valid zero quote price as a genuine value rather than a missing-value sentinel", () => {
    const document = projectCustomerQuotePrintDocument(quote, [{ ...lines[0], quoted_unit_price: 0 }]);
    expect(document?.items[0].unitPrice).toBe(0);
    expect(document?.totalAmount).toBe(0);
  });
});
