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

  it("drops private organization, cost, margin, and foreign-tier fields from staff credit memo print output", () => {
    const source = reversedCreditMemoFixture();
    const input = {
      ...source,
      organization_id: "FOREIGN-CREDIT-ORG-PRINT-SENTINEL",
      warehouse_id: "PRIVATE-CREDIT-WAREHOUSE-PRINT-SENTINEL",
      cost_price: "INTERNAL-CREDIT-COST-PRINT-SENTINEL",
      profit_margin: "INTERNAL-CREDIT-MARGIN-PRINT-SENTINEL",
      foreign_tier_price: "FOREIGN-CREDIT-TIER-PRINT-SENTINEL",
      memo: {
        ...source.memo,
        organization_id: "FOREIGN-MEMO-ORG-PRINT-SENTINEL",
        warehouse_id: "PRIVATE-MEMO-WAREHOUSE-PRINT-SENTINEL",
        cost_price: "INTERNAL-MEMO-COST-PRINT-SENTINEL",
        purchase_price: "INTERNAL-MEMO-PURCHASE-PRINT-SENTINEL",
        gross_profit: "INTERNAL-MEMO-GROSS-PROFIT-PRINT-SENTINEL",
        foreign_tier_price: "FOREIGN-MEMO-TIER-PRINT-SENTINEL",
      },
      customer: {
        ...source.customer,
        organization_id: "FOREIGN-CUSTOMER-ORG-PRINT-SENTINEL",
        internal_margin: "INTERNAL-CUSTOMER-MARGIN-PRINT-SENTINEL",
      },
      invoice: {
        ...source.invoice,
        organization_id: "FOREIGN-INVOICE-ORG-PRINT-SENTINEL",
        cost_price: "INTERNAL-INVOICE-COST-PRINT-SENTINEL",
        unit_cost: "INTERNAL-INVOICE-UNIT-COST-PRINT-SENTINEL",
        foreign_tier_price: "FOREIGN-INVOICE-TIER-PRINT-SENTINEL",
      },
      return_request: {
        ...source.return_request,
        organization_id: "FOREIGN-RETURN-ORG-PRINT-SENTINEL",
        cost_price: "INTERNAL-RETURN-COST-PRINT-SENTINEL",
      },
      journal: {
        ...source.journal,
        organization_id: "FOREIGN-JOURNAL-ORG-PRINT-SENTINEL",
        internal_cost: "INTERNAL-JOURNAL-COST-PRINT-SENTINEL",
      },
      lines: source.lines.map((line) => ({
        ...line,
        organization_id: "FOREIGN-LINE-ORG-PRINT-SENTINEL",
        warehouse_id: "PRIVATE-LINE-WAREHOUSE-PRINT-SENTINEL",
        cost_price: "INTERNAL-LINE-COST-PRINT-SENTINEL",
        purchase_price: "INTERNAL-LINE-PURCHASE-PRINT-SENTINEL",
        profit_margin: "INTERNAL-LINE-MARGIN-PRINT-SENTINEL",
        foreign_tier_price: "FOREIGN-LINE-TIER-PRINT-SENTINEL",
        internal_cost_amount: "987654.32",
      })),
    };

    const parsed = readPrintableCreditMemo(input);
    const serialized = JSON.stringify(parsed);
    const secrets = [
      "FOREIGN-CREDIT-ORG-PRINT-SENTINEL",
      "PRIVATE-CREDIT-WAREHOUSE-PRINT-SENTINEL",
      "INTERNAL-CREDIT-COST-PRINT-SENTINEL",
      "INTERNAL-CREDIT-MARGIN-PRINT-SENTINEL",
      "FOREIGN-CREDIT-TIER-PRINT-SENTINEL",
      "FOREIGN-MEMO-ORG-PRINT-SENTINEL",
      "PRIVATE-MEMO-WAREHOUSE-PRINT-SENTINEL",
      "INTERNAL-MEMO-COST-PRINT-SENTINEL",
      "INTERNAL-MEMO-PURCHASE-PRINT-SENTINEL",
      "INTERNAL-MEMO-GROSS-PROFIT-PRINT-SENTINEL",
      "FOREIGN-MEMO-TIER-PRINT-SENTINEL",
      "FOREIGN-CUSTOMER-ORG-PRINT-SENTINEL",
      "INTERNAL-CUSTOMER-MARGIN-PRINT-SENTINEL",
      "FOREIGN-INVOICE-ORG-PRINT-SENTINEL",
      "INTERNAL-INVOICE-COST-PRINT-SENTINEL",
      "INTERNAL-INVOICE-UNIT-COST-PRINT-SENTINEL",
      "FOREIGN-INVOICE-TIER-PRINT-SENTINEL",
      "FOREIGN-RETURN-ORG-PRINT-SENTINEL",
      "INTERNAL-RETURN-COST-PRINT-SENTINEL",
      "FOREIGN-JOURNAL-ORG-PRINT-SENTINEL",
      "INTERNAL-JOURNAL-COST-PRINT-SENTINEL",
      "FOREIGN-LINE-ORG-PRINT-SENTINEL",
      "PRIVATE-LINE-WAREHOUSE-PRINT-SENTINEL",
      "INTERNAL-LINE-COST-PRINT-SENTINEL",
      "INTERNAL-LINE-PURCHASE-PRINT-SENTINEL",
      "INTERNAL-LINE-MARGIN-PRINT-SENTINEL",
      "FOREIGN-LINE-TIER-PRINT-SENTINEL",
      "987654.32",
    ];
    for (const secret of secrets) expect(serialized).not.toContain(secret);

    const doc = document.implementation.createHTMLDocument("");
    renderCreditMemoDocument(doc, parsed, "مؤسسة الاختبار");
    expect(doc.body.textContent).toContain("CRM-REV-0001");
    expect(doc.body.textContent).toContain("INV-0009");
    expect(doc.body.textContent).toContain("Correction approved by finance.");
    expect(doc.body.textContent).toContain("52");
    for (const secret of secrets) expect(doc.body.textContent).not.toContain(secret);
    expect(doc.documentElement.dir).toBe("rtl");
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

  it("drops unexpected internal cost, margin, and foreign-tier fields from staff invoice print output", () => {
    const source = invoiceFixture();
    const input = {
      ...source,
      invoice: {
        ...source.invoice,
        internal_cost_sentinel: "INTERNAL-COST-SENTINEL",
        foreign_tier_sentinel: "FOREIGN-TIER-SENTINEL",
      },
      customer: {
        ...source.customer,
        internal_margin_sentinel: "INTERNAL-MARGIN-SENTINEL",
        foreign_tier_sentinel: "FOREIGN-TIER-SENTINEL",
      },
      lines: source.lines.map((line) => ({
        ...line,
        internal_cost_sentinel: "INTERNAL-COST-SENTINEL",
        internal_margin_sentinel: "INTERNAL-MARGIN-SENTINEL",
        foreign_tier_sentinel: "FOREIGN-TIER-SENTINEL",
        internal_cost_amount: "987654.32",
      })),
    };

    const parsed = readStaffInvoicePrintPayload(input);
    expect(Object.keys(parsed.invoice)).toEqual([
      "id", "invoice_number", "status", "issued_at", "due_at", "currency",
      "subtotal", "tax_amount", "total_amount",
    ]);
    expect(Object.keys(parsed.customer)).toEqual([
      "id", "customer_code", "business_name", "contact_name",
    ]);
    expect(Object.keys(parsed.lines[0])).toEqual([
      "id", "item_code", "description", "unit", "quantity", "unit_price", "line_total",
    ]);
    const serialized = JSON.stringify(parsed);
    for (const secret of [
      "INTERNAL-COST-SENTINEL",
      "INTERNAL-MARGIN-SENTINEL",
      "FOREIGN-TIER-SENTINEL",
      "987654.32",
    ]) {
      expect(serialized).not.toContain(secret);
    }

    const doc = document.implementation.createHTMLDocument("");
    renderStaffInvoiceDocument(doc, parsed, "مؤسسة الاختبار");
    for (const secret of [
      "INTERNAL-COST-SENTINEL",
      "INTERNAL-MARGIN-SENTINEL",
      "FOREIGN-TIER-SENTINEL",
      "987654.32",
    ]) {
      expect(doc.body.textContent).not.toContain(secret);
    }
  });

  it("drops private organization, cost, margin, warehouse, and foreign-tier fields from staff statement print output", () => {
    const source = statementFixture();
    const input = {
      ...source,
      organization_id: "FOREIGN-ORG-STATEMENT-SENTINEL",
      warehouse_id: "PRIVATE-STATEMENT-WAREHOUSE-SENTINEL",
      cost_price: "INTERNAL-STATEMENT-COST-SENTINEL",
      profit_margin: "INTERNAL-STATEMENT-MARGIN-SENTINEL",
      foreign_tier_price: "FOREIGN-STATEMENT-TIER-SENTINEL",
      customer: {
        ...source.customer,
        organization_id: "FOREIGN-CUSTOMER-ORGANIZATION-STATEMENT-SENTINEL",
        cost_price: "INTERNAL-CUSTOMER-COST-STATEMENT-SENTINEL",
        profit_margin: "INTERNAL-CUSTOMER-MARGIN-STATEMENT-SENTINEL",
      },
      invoices: source.invoices.map((invoice) => ({
        ...invoice,
        organization_id: "FOREIGN-INVOICE-ORGANIZATION-STATEMENT-SENTINEL",
        cost_price: "INTERNAL-INVOICE-COST-STATEMENT-SENTINEL",
        purchase_price: "INTERNAL-INVOICE-PURCHASE-STATEMENT-SENTINEL",
        gross_profit: "INTERNAL-INVOICE-GROSS-PROFIT-STATEMENT-SENTINEL",
        foreign_tier_price: "FOREIGN-INVOICE-TIER-STATEMENT-SENTINEL",
      })),
      payments: source.payments.map((payment) => ({
        ...payment,
        organization_id: "FOREIGN-PAYMENT-ORGANIZATION-STATEMENT-SENTINEL",
        customer_id: "FOREIGN-CUSTOMER-PAYMENT-STATEMENT-SENTINEL",
        cost_price: "INTERNAL-PAYMENT-COST-STATEMENT-SENTINEL",
        profit_margin: "INTERNAL-PAYMENT-MARGIN-STATEMENT-SENTINEL",
        foreign_tier_price: "FOREIGN-PAYMENT-TIER-STATEMENT-SENTINEL",
        internal_cost_amount: "987654.32",
      })),
      credits: source.credits.map((credit) => ({
        ...credit,
        organization_id: "FOREIGN-CREDIT-ORGANIZATION-STATEMENT-SENTINEL",
        warehouse_id: "PRIVATE-CREDIT-WAREHOUSE-STATEMENT-SENTINEL",
        cost_price: "INTERNAL-CREDIT-COST-STATEMENT-SENTINEL",
        unit_cost: "INTERNAL-CREDIT-UNIT-COST-STATEMENT-SENTINEL",
        gross_profit: "INTERNAL-CREDIT-GROSS-PROFIT-STATEMENT-SENTINEL",
        foreign_tier_price: "FOREIGN-CREDIT-TIER-STATEMENT-SENTINEL",
        internal_credit_amount: "123456.78",
      })),
      summary: source.summary.map((row) => ({
        ...row,
        organization_id: "FOREIGN-SUMMARY-ORGANIZATION-STATEMENT-SENTINEL",
        cost_price: "INTERNAL-SUMMARY-COST-STATEMENT-SENTINEL",
        gross_profit: "INTERNAL-SUMMARY-GROSS-PROFIT-STATEMENT-SENTINEL",
      })),
    };

    const parsed = readStaffStatementPrintPayload(input);
    expect(parsed.customer.customer_code).toBe("000125");
    expect(parsed.invoices[0].invoice_number).toBe("INV-0009");
    expect(parsed.payments[0].reference).toBe("BANK-25");
    expect(parsed.credits[0].memo_number).toBe("CRM-0001");

    const secrets = [
      "FOREIGN-ORG-STATEMENT-SENTINEL",
      "PRIVATE-STATEMENT-WAREHOUSE-SENTINEL",
      "INTERNAL-STATEMENT-COST-SENTINEL",
      "INTERNAL-STATEMENT-MARGIN-SENTINEL",
      "FOREIGN-STATEMENT-TIER-SENTINEL",
      "FOREIGN-CUSTOMER-ORGANIZATION-STATEMENT-SENTINEL",
      "INTERNAL-CUSTOMER-COST-STATEMENT-SENTINEL",
      "INTERNAL-CUSTOMER-MARGIN-STATEMENT-SENTINEL",
      "FOREIGN-INVOICE-ORGANIZATION-STATEMENT-SENTINEL",
      "INTERNAL-INVOICE-COST-STATEMENT-SENTINEL",
      "INTERNAL-INVOICE-PURCHASE-STATEMENT-SENTINEL",
      "INTERNAL-INVOICE-GROSS-PROFIT-STATEMENT-SENTINEL",
      "FOREIGN-INVOICE-TIER-STATEMENT-SENTINEL",
      "FOREIGN-PAYMENT-ORGANIZATION-STATEMENT-SENTINEL",
      "FOREIGN-CUSTOMER-PAYMENT-STATEMENT-SENTINEL",
      "INTERNAL-PAYMENT-COST-STATEMENT-SENTINEL",
      "INTERNAL-PAYMENT-MARGIN-STATEMENT-SENTINEL",
      "FOREIGN-PAYMENT-TIER-STATEMENT-SENTINEL",
      "PRIVATE-CREDIT-WAREHOUSE-STATEMENT-SENTINEL",
      "FOREIGN-CREDIT-ORGANIZATION-STATEMENT-SENTINEL",
      "INTERNAL-CREDIT-COST-STATEMENT-SENTINEL",
      "INTERNAL-CREDIT-UNIT-COST-STATEMENT-SENTINEL",
      "INTERNAL-CREDIT-GROSS-PROFIT-STATEMENT-SENTINEL",
      "FOREIGN-CREDIT-TIER-STATEMENT-SENTINEL",
      "FOREIGN-SUMMARY-ORGANIZATION-STATEMENT-SENTINEL",
      "INTERNAL-SUMMARY-COST-STATEMENT-SENTINEL",
      "INTERNAL-SUMMARY-GROSS-PROFIT-STATEMENT-SENTINEL",
      "987654.32",
      "123456.78",
    ];
    const serialized = JSON.stringify(parsed);
    for (const secret of secrets) expect(serialized).not.toContain(secret);

    const doc = document.implementation.createHTMLDocument("");
    renderStaffStatementDocument(doc, parsed, "مؤسسة الاختبار");
    expect(doc.body.textContent).toContain("INV-0009");
    expect(doc.body.textContent).toContain("BANK-25");
    expect(doc.body.textContent).toContain("CRM-0001");
    for (const secret of secrets) expect(doc.body.textContent).not.toContain(secret);
    expect(doc.documentElement.dir).toBe("rtl");
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
