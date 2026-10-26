import { describe, expect, it } from "vitest";
import { parseStaffCustomer360Summary } from "@/lib/customer-360-summary";

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    generated_at: "2026-10-26T20:00:00.000Z",
    customer: {
      id: "customer-a",
      customer_code: "000125",
      business_name: "عميل الاختبار",
      contact_name: null,
      phone: null,
      email: null,
      tier: "retail",
      status: "approved",
      current_balance: null,
      credit_limit: null,
    },
    order_summary: {
      order_count: 0,
      pending_order_count: 0,
      fulfilled_order_count: 0,
      cancelled_order_count: 0,
      non_cancelled_order_value: 0,
      average_order_value: null,
      invalid_order_amount_count: 0,
      last_order_at: null,
      days_since_last_order: null,
      average_days_between_orders: null,
      status_distribution: [],
    },
    finance_by_currency: [{
      currency: "YER",
      invoice_count: 1,
      invoiced_total: 500,
      paid_total: 300,
      credit_memo_total: 125,
      outstanding_total: 75,
      overdue_invoice_count: 0,
      overdue_outstanding: 0,
      unknown_due_date_invoice_count: 0,
      unknown_due_date_outstanding: 0,
      invalid_total_amount_count: 0,
    }],
    recent_invoices: [{
      id: "invoice-a",
      invoice_number: "INV-000125",
      status: "issued",
      issued_at: "2026-10-01T00:00:00.000Z",
      due_at: null,
      currency: "YER",
      total_amount: 500,
      paid_amount: 300,
      credit_memo_amount: 125,
      outstanding_amount: 75,
    }],
    top_products: [],
    recommendations: [],
    ...overrides,
  };
}

describe("Customer 360 credit-memo money contract", () => {
  it("parses posted credit totals and invoice-level credit/outstanding values", () => {
    const parsed = parseStaffCustomer360Summary(fixture());
    expect(parsed.finance_by_currency[0]).toMatchObject({
      currency: "YER",
      invoiced_total: 500,
      paid_total: 300,
      credit_memo_total: 125,
      outstanding_total: 75,
    });
    expect(parsed.recent_invoices[0]).toMatchObject({
      id: "invoice-a",
      total_amount: 500,
      paid_amount: 300,
      credit_memo_amount: 125,
      outstanding_amount: 75,
    });
  });

  it("preserves unknown invoice totals as null rather than converting them to zero", () => {
    const raw = fixture({
      finance_by_currency: [{
        currency: "YER",
        invoice_count: 1,
        invoiced_total: null,
        paid_total: 0,
        credit_memo_total: 0,
        outstanding_total: null,
        overdue_invoice_count: 0,
        overdue_outstanding: null,
        unknown_due_date_invoice_count: 1,
        unknown_due_date_outstanding: null,
        invalid_total_amount_count: 1,
      }],
      recent_invoices: [{
        id: "invoice-unknown",
        invoice_number: "INV-UNKNOWN",
        status: "issued",
        issued_at: null,
        due_at: null,
        currency: "YER",
        total_amount: null,
        paid_amount: 0,
        credit_memo_amount: 0,
        outstanding_amount: null,
      }],
    });
    const parsed = parseStaffCustomer360Summary(raw);
    expect(parsed.finance_by_currency[0].invoiced_total).toBeNull();
    expect(parsed.finance_by_currency[0].outstanding_total).toBeNull();
    expect(parsed.finance_by_currency[0].credit_memo_total).toBe(0);
    expect(parsed.recent_invoices[0].total_amount).toBeNull();
    expect(parsed.recent_invoices[0].outstanding_amount).toBeNull();
    expect(parsed.recent_invoices[0].credit_memo_amount).toBe(0);
  });
});
