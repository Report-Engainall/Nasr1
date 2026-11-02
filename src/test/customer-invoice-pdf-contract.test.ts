import { describe, expect, it } from "vitest";
import { parseCustomerInvoicePdfPayload } from "@/lib/customer-invoice-pdf-contract";

const invoice = { id: "invoice-1", invoice_number: "INV-001", currency: "YER" };
const line = { id: "line-1", item_code: "000041", description: "سكر", unit: "كرتون", quantity: "1" };
const customer = { customer_code: "C-1", business_name: "شركة الاختبار", contact_name: "مسؤول الحساب" };
const validHiddenPayload = {
  invoice,
  lines: [line],
  customer,
  financial_details_visible: false,
  customer_tier_visible: false,
};

describe("customer invoice PDF RPC payload contract", () => {
  it("accepts the metadata-only projection when money and tier are hidden", () => {
    expect(parseCustomerInvoicePdfPayload(validHiddenPayload)).toMatchObject({
      invoice,
      lines: [line],
      customer,
      financial_details_visible: false,
      customer_tier_visible: false,
    });
  });

  it.each(["subtotal", "tax_amount", "total_amount"])(
    "rejects hidden invoice amount field %s before rendering",
    (field) => {
      expect(parseCustomerInvoicePdfPayload({
        ...validHiddenPayload,
        invoice: { ...invoice, [field]: "987654.00" },
      })).toBeNull();
    },
  );

  it.each(["unit_price", "line_total"])(
    "rejects hidden line amount field %s before rendering",
    (field) => {
      expect(parseCustomerInvoicePdfPayload({
        ...validHiddenPayload,
        lines: [{ ...line, [field]: "987654.00" }],
      })).toBeNull();
    },
  );

  it("accepts the financial projection only when the server explicitly enables visibility", () => {
    expect(parseCustomerInvoicePdfPayload({
      ...validHiddenPayload,
      invoice: { ...invoice, subtotal: "10.00", tax_amount: "0.00", total_amount: "10.00" },
      lines: [{ ...line, unit_price: "10.00", line_total: "10.00" }],
      financial_details_visible: true,
    })).not.toBeNull();
  });

  it.each([
    ["invoice", { ...invoice, cost_price: "1.00" }],
    ["line", { ...line, margin: "90" }],
    ["customer", { ...customer, internal_notes: "private" }],
  ])("rejects unexpected sensitive projection fields on %s", (target, leakedValue) => {
    expect(parseCustomerInvoicePdfPayload({
      ...validHiddenPayload,
      ...(target === "invoice" ? { invoice: leakedValue } : {}),
      ...(target === "line" ? { lines: [leakedValue] } : {}),
      ...(target === "customer" ? { customer: leakedValue } : {}),
    })).toBeNull();
  });

  it("rejects a hidden-tier projection that still contains tier_label", () => {
    expect(parseCustomerInvoicePdfPayload({
      ...validHiddenPayload,
      customer: { ...customer, tier_label: "جملة" },
    })).toBeNull();
  });

  it("requires a non-empty tier label when the server explicitly allows tier visibility", () => {
    expect(parseCustomerInvoicePdfPayload({
      ...validHiddenPayload,
      customer: { ...customer, tier_label: "  " },
      customer_tier_visible: true,
    })).toBeNull();
    expect(parseCustomerInvoicePdfPayload({
      ...validHiddenPayload,
      customer: { ...customer, tier_label: "تجزئة" },
      customer_tier_visible: true,
    })).not.toBeNull();
  });

  it.each([
    null,
    [],
    { ...validHiddenPayload, lines: null },
    { ...validHiddenPayload, lines: [null] },
    { ...validHiddenPayload, lines: [{ ...line, tenant_id: "foreign-tenant" }] },
    { ...validHiddenPayload, customer: [] },
    { ...validHiddenPayload, financial_details_visible: "false" },
    { ...validHiddenPayload, customer_tier_visible: null },
    { ...validHiddenPayload, organization_id: "foreign-tenant" },
  ])("rejects malformed or out-of-scope RPC projection: %j", (value) => {
    expect(parseCustomerInvoicePdfPayload(value)).toBeNull();
  });
});
