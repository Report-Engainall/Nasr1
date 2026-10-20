import { describe, expect, it } from "vitest";
import {
  readFinancePrintOptions,
  readStaffInvoicePrintPayload,
  readStaffStatementPrintPayload,
  renderStaffInvoiceDocument,
  renderStaffStatementDocument,
} from "@/lib/finance-document-print";

const customerId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const itemId = "33333333-3333-4333-8333-333333333333";

function invoiceFixture() {
  return {
    invoice: {
      id: invoiceId, invoice_number: "INV-0009", status: "issued",
      issued_at: "2026-10-19T00:00:00.000Z", due_at: "2026-10-30T00:00:00.000Z",
      currency: "YER", subtotal: "125.00", tax_amount: "0.00", total_amount: "125.00",
    },
    customer: { id: customerId, customer_code: "000125", business_name: "عميل <script>ضار</script>", contact_name: null },
    lines: [{
      id: itemId, item_code: "000017", description: "<img src=x onerror=alert(1)> منتج",
      unit: "كرتون", quantity: "1.250", unit_price: "100.00", line_total: "125.00",
    }],
  };
}

function statementFixture() {
  return {
    customer: { id: customerId, customer_code: "000125", business_name: "عميل الاختبار", contact_name: null },
    invoices: [{
      id: invoiceId, invoice_number: "INV-0009", status: "issued", issued_at: "2026-10-19T00:00:00.000Z",
      due_at: "2026-10-30T00:00:00.000Z", currency: "YER", subtotal: "500.00", tax_amount: "0.00",
      total_amount: "500.00", paid_amount: "0.00", credit_memo_amount: "125.00", outstanding_amount: "375.00",
    }],
    payments: [{
      id: "55555555-5555-4555-8555-555555555555", invoice_id: invoiceId, invoice_number: "INV-0009",
      currency: "YER", amount: "25.00", paid_at: "2026-10-20T01:30:00.000Z", payment_method: "transfer", reference: "BANK-25",
    }],
    credits: [{
      id: "44444444-4444-4444-8444-444444444444", memo_number: "CRM-0001", invoice_id: invoiceId,
      invoice_number: "INV-0009", currency: "YER", subtotal_amount: "125.00", tax_amount: "0.00",
      total_amount: "125.00", created_at: "2026-10-20T01:00:00.000Z", posted_at: "2026-10-20T02:00:00.000Z",
    }],
    summary: [{
      currency: "YER", invoiced: "500.00", paid: "0.00", credited: "125.00", outstanding: "375.00",
      overdue_invoice_count: 0, overdue_outstanding: "0.00", unknown_due_date_invoice_count: 0,
      unknown_due_date_outstanding: "0.00",
    }],
    summary_as_of_utc: "2026-10-20T03:00:00.000Z",
    truncated: { invoices: false, payments: false, credits: false },
  };
}

describe("finance document print contracts", () => {
  it("validates role-scoped document options and preserves IDs such as leading-zero customer codes", () => {
    const parsed = readFinancePrintOptions({
      customers: [{ id: customerId, customer_code: "000125", business_name: "متجر اختبار", contact_name: null }],
      customers_has_more: false,
      invoices: [{
        id: invoiceId, invoice_number: "INV-0009", customer_id: customerId, customer_name: "متجر اختبار",
        status: "issued", issued_at: "2026-10-19T00:00:00.000Z", currency: "YER",
      }],
      invoices_has_more: false,
      credit_memos: [],
      credit_memos_has_more: false,
      limit: 500,
    });
    expect(parsed.customers[0].customer_code).toBe("000125");
    expect(parsed.invoices[0].invoice_number).toBe("INV-0009");
    expect(() => readFinancePrintOptions({ customers: [{}], invoices: [], credit_memos: [], limit: 500 })).toThrow();
  });

  it("rejects invoices whose source lines or tax do not reconcile", () => {
    const valid = readStaffInvoicePrintPayload(invoiceFixture());
    expect(valid.lines[0].item_code).toBe("000017");
    expect(valid.invoice.total_amount).toBe("125.00");
    expect(() => readStaffInvoicePrintPayload({
      ...invoiceFixture(), invoice: { ...invoiceFixture().invoice, total_amount: "126.00" },
    })).toThrow(/لا تتطابق/);
    expect(() => readStaffInvoicePrintPayload({
      ...invoiceFixture(), lines: [{ ...invoiceFixture().lines[0], line_total: "124.00" }],
    })).toThrow(/لا تتطابق/);
  });

  it("accepts zero aging counts and uses posted credit memos in the customer balance", () => {
    const parsed = readStaffStatementPrintPayload(statementFixture());
    expect(parsed.summary[0].overdue_invoice_count).toBe(0);
    expect(parsed.invoices[0].credit_memo_amount).toBe("125.00");
    expect(parsed.invoices[0].outstanding_amount).toBe("375.00");
    expect(parsed.credits[0].memo_number).toBe("CRM-0001");
    expect(parsed.payments[0].invoice_number).toBe("INV-0009");
    expect(parsed.payments[0].currency).toBe("YER");
    expect(() => readStaffStatementPrintPayload({
      ...statementFixture(),
      summary: [{ ...statementFixture().summary[0], overdue_outstanding: "376.00" }],
    })).toThrow(/شرائح أعمار الذمم/);
  });

  it("renders untrusted invoice descriptions as text nodes, not executable HTML", () => {
    const doc = document.implementation.createHTMLDocument("");
    renderStaffInvoiceDocument(doc, readStaffInvoicePrintPayload(invoiceFixture()));
    expect(doc.querySelector("script, img")).toBeNull();
    expect(doc.body.textContent).toContain("<img src=x onerror=alert(1)> منتج");
    expect(doc.body.textContent).toContain("000017");
    expect(doc.documentElement.dir).toBe("rtl");
  });

  it("prints a full-ledger statement summary while clearly labelling limited detail arrays", () => {
    const payload = statementFixture();
    payload.truncated.invoices = true;
    const doc = document.implementation.createHTMLDocument("");
    renderStaffStatementDocument(doc, readStaffStatementPrintPayload(payload));
    expect(doc.body.textContent).toContain("٣٧٥٫٠٠");
    expect(doc.body.textContent).toContain("الإشعارات الدائنة المرحلة");
    expect(doc.body.textContent).toContain("أحدث 200");
  });
});
