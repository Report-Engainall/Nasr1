import { describe, expect, it } from "vitest";
import { parseCustomerInvoicePdfPayload } from "@/lib/customer-invoice-pdf-contract";

const validHiddenTierPayload = {
  invoice: { id: "invoice-1" },
  lines: [{ id: "line-1" }],
  customer: { customer_code: "C-1", business_name: "شركة الاختبار" },
  financial_details_visible: false,
  customer_tier_visible: false,
};

describe("customer invoice PDF RPC payload contract", () => {
  it("accepts a complete hidden-tier projection only when protected tier data is absent", () => {
    expect(parseCustomerInvoicePdfPayload(validHiddenTierPayload)).toMatchObject({
      invoice: { id: "invoice-1" },
      lines: [{ id: "line-1" }],
      customer_tier_visible: false,
    });
  });

  it("rejects a hidden-tier projection that still contains tier_label", () => {
    expect(parseCustomerInvoicePdfPayload({
      ...validHiddenTierPayload,
      customer: { ...validHiddenTierPayload.customer, tier_label: "جملة" },
    })).toBeNull();
  });

  it("requires a non-empty tier label when the server explicitly allows tier visibility", () => {
    expect(parseCustomerInvoicePdfPayload({
      ...validHiddenTierPayload,
      customer: { ...validHiddenTierPayload.customer, tier_label: "  " },
      customer_tier_visible: true,
    })).toBeNull();
    expect(parseCustomerInvoicePdfPayload({
      ...validHiddenTierPayload,
      customer: { ...validHiddenTierPayload.customer, tier_label: "تجزئة" },
      customer_tier_visible: true,
    })).not.toBeNull();
  });

  it.each([
    null,
    [],
    { ...validHiddenTierPayload, lines: null },
    { ...validHiddenTierPayload, customer: [] },
    { ...validHiddenTierPayload, financial_details_visible: "false" },
    { ...validHiddenTierPayload, customer_tier_visible: null },
  ])("rejects malformed or incomplete RPC projection: %j", (value) => {
    expect(parseCustomerInvoicePdfPayload(value)).toBeNull();
  });
});
