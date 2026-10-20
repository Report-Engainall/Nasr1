import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FinanceDocumentPrintActions } from "@/components/FinanceDocumentPrintActions";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

const customerId = "11111111-1111-4111-8111-111111111111";
const invoiceId = "22222222-2222-4222-8222-222222222222";
const memoId = "33333333-3333-4333-8333-333333333333";
const options = {
  customers: [{ id: customerId, customer_code: "000125", business_name: "متجر الاختبار", contact_name: null }],
  customers_has_more: false,
  invoices: [{
    id: invoiceId, invoice_number: "INV-TEST-0009", customer_id: customerId, customer_name: "متجر الاختبار",
    status: "issued", issued_at: "2026-10-19T00:00:00Z", currency: "YER",
  }],
  invoices_has_more: false,
  credit_memos: [{
    id: memoId, memo_number: "CRM-TEST-001", customer_id: customerId, customer_name: "متجر الاختبار",
    invoice_number: "INV-TEST-0009", status: "posted", created_at: "2026-10-20T00:00:00Z",
    currency: "YER", total_amount: "25.00",
  }],
  credit_memos_has_more: false,
  limit: 500,
};
const invoicePayload = {
  invoice: {
    id: invoiceId, invoice_number: "INV-TEST-0009", status: "issued", issued_at: "2026-10-19T00:00:00Z",
    due_at: "2026-10-30T00:00:00Z", currency: "YER", subtotal: "100.00", tax_amount: "0.00", total_amount: "100.00",
  },
  customer: { id: customerId, customer_code: "000125", business_name: "متجر الاختبار", contact_name: null },
  lines: [{
    id: "44444444-4444-4444-8444-444444444444", item_code: "000017", description: "صنف اختبار",
    unit: "قطعة", quantity: "1", unit_price: "100.00", line_total: "100.00",
  }],
};
const statementPayload = {
  customer: { id: customerId, customer_code: "000125", business_name: "متجر الاختبار", contact_name: null },
  invoices: [{
    id: invoiceId, invoice_number: "INV-TEST-0009", status: "issued", issued_at: "2026-10-19T00:00:00Z",
    due_at: "2026-10-30T00:00:00Z", currency: "YER", subtotal: "100.00", tax_amount: "0.00",
    total_amount: "100.00", paid_amount: "25.00", credit_memo_amount: "0.00", outstanding_amount: "75.00",
  }],
  payments: [{
    id: "55555555-5555-4555-8555-555555555555", invoice_id: invoiceId, invoice_number: "INV-TEST-0009",
    currency: "YER", amount: "25.00", paid_at: "2026-10-20T00:00:00Z", payment_method: "transfer", reference: "BANK-25",
  }],
  credits: [],
  summary: [{
    currency: "YER", invoiced: "100.00", paid: "25.00", credited: "0.00", outstanding: "75.00",
    overdue_invoice_count: 0, overdue_outstanding: "0.00", unknown_due_date_invoice_count: 0,
    unknown_due_date_outstanding: "0.00",
  }],
  summary_as_of_utc: "2026-10-20T00:00:00Z",
  truncated: { invoices: false, payments: false, credits: false },
};
const creditMemoPayload = {
  memo: { id: memoId, memo_number: "CRM-TEST-001", status: "posted", currency: "YER", subtotal_amount: 25, tax_amount: 0,
    total_amount: 25, created_at: "2026-10-20T00:00:00Z", posted_at: "2026-10-20T01:00:00Z" },
  customer: { id: customerId, name: "متجر الاختبار", contact_name: null },
  invoice: { id: invoiceId, invoice_number: "INV-TEST-0009", currency: "YER", issued_at: "2026-10-19T00:00:00Z",
    subtotal: 100, tax_amount: 0, total_amount: 100, order_number: "ORD-TEST-001" },
  return_request: { id: "66666666-6666-4666-8666-666666666666", request_number: "RET-TEST-001", status: "received", created_at: "2026-10-20T00:00:00Z" },
  journal: { id: "77777777-7777-4777-8777-777777777777", entry_number: "51", status: "posted", entry_date: "2026-10-20" },
  lines: [{
    id: "88888888-8888-4888-8888-888888888888", item_code: "000017", description: "صنف مرتجع", unit: "قطعة",
    returned_quantity: 0.25, credited_subtotal: 25, invoice_quantity: 1, invoice_unit_price: 100, invoice_line_total: 100,
  }],
};

function popupWindow() {
  const fake = {
    document: document.implementation.createHTMLDocument(""),
    closed: false,
    opener: null as Window | null,
    focus: vi.fn(),
    print: vi.fn(),
    close: vi.fn(),
    onafterprint: null as (() => void) | null,
  };
  fake.close.mockImplementation(() => { fake.closed = true; });
  return fake as unknown as Window & { print: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
}

describe("finance document printing UI", () => {
  let popup: ReturnType<typeof popupWindow>;
  beforeEach(() => {
    popup = popupWindow();
    vi.spyOn(window, "open").mockReturnValue(popup);
    mocks.rpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "get_finance_document_print_options") return { data: options, error: null };
      if (name === "get_staff_customer_invoice_print_data") return { data: invoicePayload, error: null };
      if (name === "get_staff_customer_account_statement") return { data: statementPayload, error: null };
      if (name === "get_customer_return_credit_memo_pdf") return { data: creditMemoPayload, error: null };
      return { data: null, error: { message: "unexpected RPC " + name } };
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("prints a reconciled staff invoice from the server RPC", async () => {
    render(<FinanceDocumentPrintActions />);
    await screen.findByRole("option", { name: /INV-TEST-0009/ });
    fireEvent.click(screen.getByRole("button", { name: /فتح نافذة الطباعة/ }));
    expect(await screen.findByText(/تم تجهيز المستند/)).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_staff_customer_invoice_print_data", { p_invoice_id: invoiceId });
    expect(popup.document.body.textContent).toContain("INV-TEST-0009");
    expect(popup.document.body.textContent).toContain("000017");
    expect(popup.document.documentElement.dir).toBe("rtl");
    await waitFor(() => expect(popup.print).toHaveBeenCalled());
  });

  it("prints a staff account statement with the server-computed remaining balance", async () => {
    render(<FinanceDocumentPrintActions />);
    await screen.findByRole("option", { name: /INV-TEST-0009/ });
    fireEvent.change(screen.getByLabelText("نوع المستند المالي"), { target: { value: "statement" } });
    await screen.findByRole("option", { name: /متجر الاختبار/ });
    fireEvent.click(screen.getByRole("button", { name: /فتح نافذة الطباعة/ }));
    expect(await screen.findByText(/تم تجهيز المستند/)).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_staff_customer_account_statement", { p_customer_id: customerId });
    expect(popup.document.body.textContent).toContain("كشف حساب العميل");
    expect(popup.document.body.textContent).toContain("٧٥٫٠٠");
    expect(popup.document.body.textContent).toContain("INV-TEST-0009");
  });

  it("uses the finance-authorized credit memo RPC and renders posted status", async () => {
    render(<FinanceDocumentPrintActions />);
    await screen.findByRole("option", { name: /INV-TEST-0009/ });
    fireEvent.change(screen.getByLabelText("نوع المستند المالي"), { target: { value: "credit_memo" } });
    await screen.findByRole("option", { name: /CRM-TEST-001/ });
    fireEvent.click(screen.getByRole("button", { name: /فتح نافذة الطباعة/ }));
    expect(await screen.findByText(/تم تجهيز المستند/)).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_return_credit_memo_pdf", { p_credit_memo_id: memoId });
    expect(popup.document.body.textContent).toContain("CRM-TEST-001");
    expect(popup.document.body.textContent).toContain("مُرحّل محاسبيًا");
  });

  it("closes the print popup and reports a server authorization failure", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "get_finance_document_print_options") return { data: options, error: null };
      if (name === "get_staff_customer_invoice_print_data") return { data: null, error: { message: "finance permission required" } };
      return { data: null, error: { message: "unexpected RPC " + name } };
    });
    render(<FinanceDocumentPrintActions />);
    await screen.findByRole("option", { name: /INV-TEST-0009/ });
    fireEvent.click(screen.getByRole("button", { name: /فتح نافذة الطباعة/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("finance permission required");
    expect(popup.close).toHaveBeenCalled();
  });
});
