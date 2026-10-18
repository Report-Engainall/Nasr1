import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  buildCustomerInvoicePdf,
  buildCustomerStatementPdf,
  resolveCustomerStatementInvoiceStatus,
} from "./finance-document-pdf";
import { loadArabicDocumentFont, getFinanceDocumentClient } from "./finance-pdf-server";

const fontBytes = () => loadArabicDocumentFont();
const generatedAt = new Date("2026-10-15T12:00:00.000Z");
const invoiceId = "11111111-1111-4111-8111-111111111111";

describe("Arabic customer finance PDFs", () => {
  it("generates a statement PDF from scoped statement data and preserves separate currencies", async () => {
    const bytes = await buildCustomerStatementPdf(
      {
        invoices: [
          {
            id: invoiceId,
            invoice_number: "INV-2026-001",
            status: "partially_paid",
            issued_at: "2026-10-15T09:00:00.000Z",
            due_at: "2026-10-30T00:00:00.000Z",
            currency: "YER",
            total_amount: "100.10",
          },
          {
            id: "22222222-2222-4222-8222-222222222222",
            invoice_number: "INV-2026-002",
            status: "unpaid",
            issued_at: "2026-10-14T09:00:00.000Z",
            due_at: null,
            currency: "USD",
            total_amount: "7.25",
          },
          {
            id: "33333333-3333-4333-8333-333333333333",
            invoice_number: "INV-VOID",
            status: "void",
            issued_at: "2026-10-13T09:00:00.000Z",
            currency: "YER",
            total_amount: "500.00",
          },
        ],
        payments: [
          {
            id: "44444444-4444-4444-8444-444444444444",
            invoice_id: invoiceId,
            amount: "25.05",
            paid_at: "2026-10-15T10:00:00.000Z",
          },
        ],
      },
      fontBytes(),
      generatedAt,
    );

    expect(new TextDecoder().decode(bytes.slice(0, 8))).toMatch(/^%PDF-1\./);
    expect(bytes.byteLength).toBeGreaterThan(2_000);
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(document.getTitle()).toContain("كشف الحساب");
  });

  it("derives overdue statement labels from due date and outstanding ledger balance", () => {
    const generatedAt = new Date("2026-10-18T12:00:00.000Z");
    const invoice = {
      status: "issued",
      due_at: "2026-10-10T00:00:00.000Z",
      total_amount: "100.00",
    };

    expect(resolveCustomerStatementInvoiceStatus(invoice, 0n, generatedAt)).toBe("متأخرة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, status: "partially_paid" },
      2500n,
      generatedAt,
    )).toBe("متأخرة جزئيًا");

    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, due_at: "2026-10-20T00:00:00.000Z" },
      0n,
      generatedAt,
    )).toBe("مستحقة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, due_at: null },
      0n,
      generatedAt,
    )).toBe("مستحقة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, status: "paid" },
      10000n,
      generatedAt,
    )).toBe("مدفوعة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, status: "issued" },
      10000n,
      generatedAt,
    )).toBe("مدفوعة");
    expect(resolveCustomerStatementInvoiceStatus(
      { ...invoice, status: "void" },
      0n,
      generatedAt,
    )).toBe("ملغاة");
  });

  it("creates a customer invoice PDF with financial amounts from the scoped RPC payload", async () => {
    const bytes = await buildCustomerInvoicePdf(
      {
        id: invoiceId,
        invoice_number: "INV-2026-001",
        customer_id: "55555555-5555-4555-8555-555555555555",
        status: "issued",
        issued_at: "2026-10-15T09:00:00.000Z",
        due_at: "2026-10-30T00:00:00.000Z",
        currency: "YER",
        subtotal: "25.00",
        tax_amount: "0.00",
        total_amount: "25.00",
      },
      [
        {
          id: "66666666-6666-4666-8666-666666666666",
          item_code: "000125",
          description: "سكر أبيض",
          unit: "كرتون",
          quantity: "2",
          unit_price: "12.50",
          line_total: "25.00",
        },
      ],
      {
        customer_code: "000042",
        business_name: "متجر الاختبار",
        contact_name: "مستخدم اختبار",
      },
      fontBytes(),
      generatedAt,
    );

    expect(new TextDecoder().decode(bytes.slice(0, 8))).toMatch(/^%PDF-1\./);
    expect(bytes.byteLength).toBeGreaterThan(2_000);
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(1);
    expect(document.getTitle()).toContain("INV-2026-001");
  });

  it("rejects invoice PDFs when the source totals do not reconcile", async () => {
    const invoice = {
      id: invoiceId,
      invoice_number: "INV-2026-MISMATCH",
      customer_id: "55555555-5555-4555-8555-555555555555",
      status: "issued",
      issued_at: "2026-10-15T09:00:00.000Z",
      currency: "YER",
      subtotal: "25.00",
      tax_amount: "0.00",
      total_amount: "25.00",
    };
    const line = {
      id: "66666666-6666-4666-8666-666666666666",
      item_code: "000125",
      description: "سكر أبيض",
      unit: "كرتون",
      quantity: "2",
      unit_price: "12.50",
      line_total: "25.00",
    };
    const customer = { customer_code: "000042", business_name: "متجر الاختبار" };

    await expect(buildCustomerInvoicePdf(
      { ...invoice, total_amount: "26.00", tax_amount: "0.00" },
      [line], customer, fontBytes(), generatedAt,
    )).rejects.toThrow("subtotal plus tax does not equal the invoice total");

    await expect(buildCustomerInvoicePdf(
      invoice, [{ ...line, line_total: "24.00" }],
      customer, fontBytes(), generatedAt,
    )).rejects.toThrow("line totals do not equal the invoice subtotal");
  });

  it("rejects a customer invoice PDF payload with missing or negative monetary fields", async () => {
    const invoice = {
      id: invoiceId,
      invoice_number: "INV-2026-BAD",
      customer_id: "55555555-5555-4555-8555-555555555555",
      status: "issued",
      issued_at: "2026-10-15T09:00:00.000Z",
      currency: "YER",
      subtotal: "25.00",
      tax_amount: "0.00",
      total_amount: "25.00",
    };
    const line = {
      id: "66666666-6666-4666-8666-666666666666",
      item_code: "000125",
      description: "سكر أبيض",
      unit: "كرتون",
      quantity: "2",
      unit_price: "12.50",
      line_total: "25.00",
    };
    const customer = { customer_code: "000042", business_name: "متجر الاختبار" };

    await expect(buildCustomerInvoicePdf(
      { ...invoice, total_amount: "-1.00" }, [line], customer, fontBytes(), generatedAt,
    )).rejects.toThrow("negative monetary value");
    await expect(buildCustomerInvoicePdf(
      invoice, [{ ...line, line_total: "-1.00" }], customer, fontBytes(), generatedAt,
    )).rejects.toThrow("negative monetary value");
    await expect(buildCustomerInvoicePdf(
      { ...invoice, total_amount: undefined }, [line], customer, fontBytes(), generatedAt,
    )).rejects.toThrow("non-standard monetary value");
  });

  it("rejects invoice PDFs when subtotal plus tax does not equal the total", async () => {
    const invoice = {
      id: invoiceId,
      invoice_number: "INV-2026-TAX-MISMATCH",
      customer_id: "55555555-5555-4555-8555-555555555555",
      status: "issued",
      issued_at: "2026-10-15T09:00:00.000Z",
      currency: "YER",
      subtotal: "25.00",
      tax_amount: "1.00",
      total_amount: "25.00",
    };
    const line = {
      id: "66666666-6666-4666-8666-666666666666",
      item_code: "000125",
      description: "سكر أبيض",
      unit: "كرتون",
      quantity: "2",
      unit_price: "12.50",
      line_total: "25.00",
    };
    const customer = { customer_code: "000042", business_name: "متجر الاختبار" };

    await expect(buildCustomerInvoicePdf(invoice, [line], customer, fontBytes(), generatedAt))
      .rejects.toThrow("Invoice subtotal plus tax does not equal the invoice total.");

    await expect(buildCustomerInvoicePdf(
      { ...invoice, total_amount: "26.00" }, [line], customer, fontBytes(), generatedAt,
    )).resolves.toBeInstanceOf(Uint8Array);
  });

  it("rejects negative invoice totals and non-positive statement payments", async () => {
    const invoice = {
      id: invoiceId,
      invoice_number: "INV-STATEMENT-INVALID-AMOUNT",
      status: "issued",
      issued_at: "2026-10-15T09:00:00.000Z",
      currency: "YER",
      total_amount: "10.00",
    };

    await expect(buildCustomerStatementPdf(
      { invoices: [{ ...invoice, total_amount: "-1.00" }], payments: [] },
      fontBytes(),
      generatedAt,
    )).rejects.toThrow("negative invoice total");

    await expect(buildCustomerStatementPdf(
      {
        invoices: [invoice],
        payments: [{ invoice_id: invoiceId, amount: "0.00", paid_at: "2026-10-15T10:00:00.000Z" }],
      },
      fontBytes(),
      generatedAt,
    )).rejects.toThrow("non-positive payment amount");

    await expect(buildCustomerStatementPdf(
      {
        invoices: [invoice],
        payments: [{ invoice_id: invoiceId, amount: "-0.01", paid_at: "2026-10-15T10:00:00.000Z" }],
      },
      fontBytes(),
      generatedAt,
    )).rejects.toThrow("non-positive payment amount");
  });

  it("rejects malformed financial amounts rather than issuing a misleading statement", async () => {
    await expect(
      buildCustomerStatementPdf(
        {
          invoices: [
            {
              id: invoiceId,
              invoice_number: "INV-BAD",
              status: "issued",
              issued_at: "2026-10-15T09:00:00.000Z",
              currency: "YER",
              total_amount: "12.345",
            },
          ],
          payments: [],
        },
        fontBytes(),
        generatedAt,
      ),
    ).rejects.toThrow("non-standard monetary value");
  });

  it("rejects an unauthenticated request before querying Supabase", async () => {
    const result = await getFinanceDocumentClient(
      new Request("https://example.test/api/statement-pdf"),
    );

    expect(result.response?.status).toBe(401);
    expect(await result.response?.json()).toEqual({
      error: "سجّل الدخول لتنزيل المستند المالي.",
    });
  });
});
