import { describe, expect, it } from "vitest";
import { BUSINESS_BRAND_NAME } from "@/lib/brand";
import {
  readFinancePrintOptions,
  readPrintableCreditMemo,
  readStaffInvoicePrintPayload,
  readStaffStatementPrintPayload,
  renderCreditMemoDocument,
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
    full_statement: true,
    record_counts: { invoices: 1, payments: 1, credits: 1, total: 3 },
  };
}

function reversedCreditMemoFixture() {
  return {
    memo: {
      id: "44444444-4444-4444-8444-444444444444",
      memo_number: "CRM-REV-0001",
      status: "reversed",
      currency: "YER",
      subtotal_amount: 125,
      tax_amount: 0,
      total_amount: 125,
      created_at: "2026-10-20T01:00:00.000Z",
      posted_at: "2026-10-20T02:00:00.000Z",
      reversed_at: "2026-10-20T03:00:00.000Z",
      reversal_reason: "Correction approved by finance.",
      reversal_journal_entry_number: "52",
      reversal_journal_status: "posted",
    },
    customer: { id: customerId, name: "عميل الإشعار", contact_name: null },
    invoice: {
      id: invoiceId, invoice_number: "INV-0009", currency: "YER", issued_at: "2026-10-19T00:00:00.000Z",
      subtotal: 500, tax_amount: 0, total_amount: 500, order_number: "ORD-0009",
    },
    return_request: {
      id: "55555555-5555-4555-8555-555555555555", request_number: "RET-0009",
      status: "received", created_at: "2026-10-20T00:00:00.000Z",
    },
    journal: {
      id: "66666666-6666-4666-8666-666666666666", entry_number: "51",
      status: "posted", entry_date: "2026-10-20",
    },
    lines: [{
      id: "77777777-7777-4777-8777-777777777777",
      item_code: "000017", description: "صنف مرتجع", unit: "كرتون",
      returned_quantity: 1.25, credited_subtotal: 125, invoice_quantity: 5,
      invoice_unit_price: 100, invoice_line_total: 500,
    }],
  };
}

describe("finance document print contracts", () => {
  it("validates role-scoped document options and preserves IDs such as leading-zero customer codes", () => {
    const parsed = readFinancePrintOptions({
      organization_name: "مؤسسة الاختبار",
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
    expect(parsed.organization_name).toBe("مؤسسة الاختبار");
    expect(parsed.customers[0].customer_code).toBe("000125");
    expect(() => readFinancePrintOptions({
      customers: [], customers_has_more: false, invoices: [], invoices_has_more: false,
      credit_memos: [], credit_memos_has_more: false, limit: 500,
    })).toThrow(/organization_name/);
    expect(parsed.invoices[0].invoice_number).toBe("INV-0009");
    expect(() => readFinancePrintOptions({ customers: [{}], invoices: [], credit_memos: [], limit: 500 })).toThrow();
  });

  it("allows a reversed credit memo only with a posted, identified counter-entry and prints its reversal", () => {
    const options = readFinancePrintOptions({
      organization_name: "مؤسسة الاختبار",
      customers: [], customers_has_more: false, invoices: [], invoices_has_more: false,
      credit_memos: [{
        id: "44444444-4444-4444-8444-444444444444",
        memo_number: "CRM-REV-0001", customer_id: customerId, customer_name: "عميل الإشعار",
        invoice_number: "INV-0009", status: "reversed", created_at: "2026-10-20T01:00:00.000Z",
        currency: "YER", total_amount: "125.00",
      }],
      credit_memos_has_more: false, limit: 500,
    });
    expect(options.credit_memos[0].status).toBe("reversed");

    const fixture = reversedCreditMemoFixture();
    const parsed = readPrintableCreditMemo(fixture);
    const doc = document.implementation.createHTMLDocument("");
    renderCreditMemoDocument(doc, parsed, "مؤسسة الاختبار");
    expect(doc.body.textContent).toContain("معكوس ماليًا");
    expect(doc.body.textContent).toContain("52");
    expect(doc.body.textContent).toContain("Correction approved by finance.");
    expect(doc.body.textContent).toContain("لا يمثل رصيدًا دائنًا قائمًا");
    expect(() => readPrintableCreditMemo({
      ...fixture,
      memo: { ...fixture.memo, reversal_journal_entry_number: null },
    })).toThrow(/يفتقد دليل قيد العكس المرحّل/);
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
    renderStaffInvoiceDocument(doc, readStaffInvoicePrintPayload(invoiceFixture()), "مؤسسة الاختبار <img src=x onerror=alert(1)>");
    expect(doc.title).toContain(BUSINESS_BRAND_NAME);
    expect(doc.querySelector("header > div[aria-label]")?.getAttribute("aria-label")).toBe(BUSINESS_BRAND_NAME);
    expect(doc.querySelector("script, img")).toBeNull();
    expect(doc.body.textContent).toContain("<img src=x onerror=alert(1)> منتج");
    expect(doc.body.textContent).toContain("000017");
    expect(doc.body.textContent).toContain("مؤسسة الاختبار <img src=x onerror=alert(1)>");
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.documentElement.dir).toBe("rtl");
    expect(doc.body.textContent).toContain("متجر الأغبري");
    expect(doc.body.textContent).toContain("AGHBARI COMMERCE");
  });

  it("rejects legacy truncated statement payloads rather than printing an incomplete ledger", () => {
    const payload = statementFixture();
    payload.truncated.invoices = true;
    expect(() => readStaffStatementPrintPayload(payload)).toThrow(/لا تطابق أعداد السجلات الكاملة/);
  });

  it("requires server-declared full statement counts to match all returned details", () => {
    const payload = statementFixture();
    expect(() => readStaffStatementPrintPayload({ ...payload, full_statement: false }))
      .toThrow(/ليس معلّمًا من الخادم ككشف كامل/);
    expect(() => readStaffStatementPrintPayload({
      ...payload,
      record_counts: { ...payload.record_counts, invoices: 2, total: 4 },
    })).toThrow(/لا تطابق أعداد السجلات الكاملة/);
  });


});
