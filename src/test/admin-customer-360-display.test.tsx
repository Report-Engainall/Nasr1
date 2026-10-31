import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffCustomer360Summary } from "@/lib/customer-360-summary";
import { projectStaffCustomer360PrintDocument } from "@/lib/customer-360-print";
import type { Customer } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  fetchSummary: vi.fn(),
  scopedCustomerId: "customer-360-1" as string | null,
}));

vi.mock("@/lib/api", () => ({
  fetchStaffCustomer360Summary: mocks.fetchSummary,
}));

vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: vi.fn(async () => ({ organizationId: "org-customer-360" })),
  supabase: {
    from: vi.fn(() => {
      const query = {
        select: vi.fn(),
        eq: vi.fn(),
        maybeSingle: vi.fn(async () => ({
          data: mocks.scopedCustomerId ? { id: mocks.scopedCustomerId } : null,
          error: null,
        })),
      };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      return query;
    }),
  },
}));

vi.mock("@/lib/format", () => ({
  formatCurrency: vi.fn((value: number) => "amount:" + String(value)),
  formatDateShort: vi.fn((value: string) => value),
  formatNumber: vi.fn((value: number) => "count:" + String(value)),
}));

vi.mock("@/lib/customer-360-xlsx", () => ({
  downloadStaffCustomer360WorkbookXlsx: vi.fn(),
}));

vi.mock("@/components/AdminPages", () => ({
  Button: ({ children, onClick, disabled }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
  Empty: ({ text }: { text: string }) => <p>{text}</p>,
  ErrorBox: ({ message }: { message: string }) => <div role="alert">{message}</div>,
  Loading: () => <div role="status">loading</div>,
  Modal: ({ title, children }: { title: string; children: ReactNode; onClose: () => void }) =>
    <div role="dialog" aria-label={title}>{children}</div>,
  TableWrap: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import { AdminCustomer360 } from "@/components/AdminCustomer360";

const customer = {
  id: "customer-360-1",
  user_id: "user-360-1",
  full_name: "عميل الاختبار",
  company_name: "مؤسسة الاختبار",
  business_name: "مؤسسة الاختبار",
  contact_name: "اسم جهة الاتصال السري",
  phone: "777000111",
  email: null,
  address: null,
  city: null,
  customer_tier: 1,
  customer_code: "000123",
  status: "approved",
  credit_limit: 1000,
  current_balance: 0,
  notes: null,
} as unknown as Customer;

const summary: StaffCustomer360Summary = {
  generated_at: "2026-10-30T04:00:00.000Z",
  customer: {
    id: customer.id,
    customer_code: "000123",
    business_name: "مؤسسة الاختبار",
    contact_name: null,
    phone: null,
    email: null,
    tier: "retail",
    status: "approved",
    current_balance: 0,
    credit_limit: 1000,
  },
  order_summary: {
    order_count: 1,
    pending_order_count: 0,
    fulfilled_order_count: 1,
    cancelled_order_count: 0,
    non_cancelled_order_value: 50,
    average_order_value: 50,
    invalid_order_amount_count: 0,
    last_order_at: "2026-10-29T10:00:00.000Z",
    days_since_last_order: 1,
    average_days_between_orders: null,
    status_distribution: [{ status: "delivered", count: 1 }],
  },
  recent_orders: [],
  recent_invoices: [],
  recent_payments: [{
    id: "payment-older-invoice-1",
    invoice_id: "invoice-internal-id-older-than-window",
    amount: 25,
    paid_at: "2026-10-28T11:00:00.000Z",
    payment_method: "cash",
  }],
  finance_by_currency: [{
    currency: "USD",
    invoice_count: 1,
    invoiced_total: 50,
    paid_total: 25,
    credit_memo_total: 0,
    outstanding_total: 25,
    overdue_invoice_count: 2,
    overdue_outstanding: null,
    unknown_due_date_invoice_count: 1,
    unknown_due_date_outstanding: null,
    invalid_total_amount_count: 0,
  }],
  top_products: [],
  recommendations: [{
    type: "overdue_invoice",
    priority: "medium",
    title: "متابعة فاتورة ذات استحقاق غير مؤكد",
    description: "يوجد مبلغ غير متاح ضمن دفتر العميل.",
    action: "راجع دفتر الفواتير.",
    currency: "USD",
    overdue_outstanding: null,
  }],
};

describe("Admin Customer 360 source-lineage display", () => {
  beforeEach(() => {
    mocks.scopedCustomerId = "customer-360-1";
    mocks.fetchSummary.mockReset().mockResolvedValue(summary);
  });

  afterEach(() => cleanup());

  it("does not invent invoice numbers or currencies for payments outside the recent-20 invoice window", async () => {
    render(<AdminCustomer360 customer={customer} onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog", { name: /ملف العميل 360/ });
    const unknownAmount = await within(dialog).findByText("غير متاح — عملة الفاتورة خارج أحدث 20 فاتورة");
    const paymentRow = unknownAmount.closest("tr");

    expect(paymentRow).not.toBeNull();
    expect(paymentRow).toHaveTextContent("خارج أحدث 20 فاتورة");
    expect(paymentRow).not.toHaveTextContent("invoice-internal-id-older-than-window");
    expect(paymentRow).not.toHaveTextContent("YER");
  });

  it("keeps an omitted recommendation count unavailable while preserving the full-ledger count", async () => {
    render(<AdminCustomer360 customer={customer} onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog", { name: /ملف العميل 360/ });
    expect(await within(dialog).findByText(/فواتير: غير متاح/)).toBeInTheDocument();
    const fullLedgerOverdueCount = within(dialog).getByText(/فواتير متأخرة من الدفتر الكامل:/);
    expect(fullLedgerOverdueCount).toHaveTextContent("count:2");
    expect(within(dialog).queryByText(/فواتير: count:0/)).not.toBeInTheDocument();
  });

  it("does not render caller-provided customer identity when the active tenant scope rejects the customer", async () => {
    mocks.scopedCustomerId = "foreign-customer-2";
    render(<AdminCustomer360 customer={customer} onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog", { name: "ملف العميل 360" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("العميل غير موجود في المؤسسة الحالية؛ تم إيقاف عرض ملفه.");
    expect(within(dialog).queryByText("مؤسسة الاختبار")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("اسم جهة الاتصال السري")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("777000111")).not.toBeInTheDocument();
    expect(mocks.fetchSummary).not.toHaveBeenCalled();
  });

  it("redacts service diagnostics, clears stale details, and recovers through the visible retry action", async () => {
    mocks.fetchSummary
      .mockRejectedValueOnce(new Error("permission denied for function fetch_staff_customer_360_summary; internal SQL detail"))
      .mockResolvedValueOnce(summary);
    render(<AdminCustomer360 customer={customer} onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog", { name: "ملف العميل 360" });
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("تعذر تحميل ملف العميل. تحقق من الاتصال والصلاحية ثم أعد المحاولة.");
    expect(alert).not.toHaveTextContent("fetch_staff_customer_360_summary");
    expect(within(dialog).queryByText("مؤسسة الاختبار")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: /تحديث/ }));
    expect(await within(dialog).findByText("مؤسسة الاختبار")).toBeInTheDocument();
    expect(mocks.fetchSummary).toHaveBeenCalledTimes(2);
  });


  it("prints complete Customer 360 aggregates and bounded detail through an explicit staff allowlist", async () => {
    const invoices = [
      {
        id: "PRIVATE-INVOICE-ID-1",
        invoice_number: "INV-0009",
        status: "issued",
        issued_at: "2026-10-28T12:00:00.000Z",
        due_at: null,
        currency: "USD",
        total_amount: 600,
        paid_amount: 250,
        credit_memo_amount: 25,
        outstanding_amount: 325,
      },
    ];
    const fullSummary = {
      ...summary,
      generated_at: "2026-10-30T04:00:00.000Z",
      customer: {
        ...summary.customer,
        id: "PRIVATE-CUSTOMER-ID",
        business_name: "مؤسسة الأفق",
        customer_code: "000125",
        contact_name: "PRIVATE-CONTACT-NAME",
        phone: "PRIVATE-PHONE",
        email: "PRIVATE-EMAIL",
      },
      order_summary: {
        ...summary.order_summary,
        order_count: 42,
        pending_order_count: 3,
        fulfilled_order_count: 35,
        cancelled_order_count: 4,
        non_cancelled_order_value: 12875,
        average_order_value: 306.55,
        invalid_order_amount_count: 1,
        last_order_at: "2026-10-29T10:00:00.000Z",
        days_since_last_order: 1,
        average_days_between_orders: 7.5,
        status_distribution: [
          { status: "delivered", count: 35 },
          { status: "pending", count: 3 },
          { status: "cancelled", count: 4 },
        ],
      },
      recent_orders: Array.from({ length: 20 }, (_, index) => ({
        id: "PRIVATE-ORDER-ID-" + index,
        order_number: "SO-" + String(index + 1).padStart(4, "0"),
        status: "delivered",
        total_amount: 500 + index,
        total_items: 2 + index,
        created_at: "2026-10-20T10:00:00.000Z",
      })),
      recent_invoices: invoices,
      recent_payments: [
        { id: "PRIVATE-PAYMENT-ID", invoice_id: "PRIVATE-INVOICE-ID-1", amount: 250, paid_at: "2026-10-28T13:00:00.000Z", payment_method: "cash" },
        { id: "PRIVATE-PAYMENT-OLDER-ID", invoice_id: "PRIVATE-OLDER-INVOICE-ID", amount: 125, paid_at: "2026-10-27T13:00:00.000Z", payment_method: "bank" },
      ],
      finance_by_currency: [
        {
          currency: "USD", invoice_count: 29, invoiced_total: 15000, paid_total: 10000,
          credit_memo_total: 125, outstanding_total: 4875, overdue_invoice_count: 4,
          overdue_outstanding: 900, unknown_due_date_invoice_count: 1,
          unknown_due_date_outstanding: 250, invalid_total_amount_count: 1,
        },
        {
          currency: "YER", invoice_count: 3, invoiced_total: null, paid_total: 0,
          credit_memo_total: 0, outstanding_total: null, overdue_invoice_count: 0,
          overdue_outstanding: null, unknown_due_date_invoice_count: 0,
          unknown_due_date_outstanding: null, invalid_total_amount_count: 1,
        },
      ],
      top_products: [{
        item_code: "000125", product_name: "سكر ممتاز", quantity: 640,
        sales: 654321.25, last_purchased_at: "2026-10-28T12:00:00.000Z",
        cost_price: 887766, profit_margin: 778899,
      }],
      organization_id: "PRIVATE-ORG-ID",
      cost_amount: 99112233,
      margin: 554433,
    } as unknown as StaffCustomer360Summary;
    mocks.fetchSummary.mockResolvedValueOnce(fullSummary);
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);

    render(<AdminCustomer360 customer={customer} onClose={vi.fn()} />);
    const dialog = await screen.findByRole("dialog", { name: /ملف العميل 360/ });
    const button = await within(dialog).findByRole("button", { name: /طباعة \/ PDF/ });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(printSpy).toHaveBeenCalledTimes(1);

    const sheet = screen.getByTestId("customer-360-print-document");
    expect(sheet.textContent).toContain("مؤسسة الأفق");
    expect(sheet.textContent).toContain("000125");
    expect(sheet.textContent).toContain("إجمالي الطلبات");
    expect(sheet.textContent).toContain("42");
    expect(sheet.textContent).toContain("INV-0009");
    expect(sheet.textContent).toContain("USD");
    expect(sheet.textContent).toContain("YER");
    expect(sheet.textContent).toContain("سكر ممتاز");
    expect(sheet.textContent).toContain("خارج أحدث 20 فاتورة");
    expect(sheet.textContent).toContain("غير متاح — عملة الفاتورة خارج أحدث 20 فاتورة");
    expect(sheet.querySelectorAll('[data-testid="customer-360-print-order-row"]')).toHaveLength(20);
    expect(sheet.querySelectorAll("table tbody tr").length).toBeGreaterThan(25);

    for (const secret of [
      "PRIVATE-CUSTOMER-ID", "PRIVATE-CONTACT-NAME", "PRIVATE-PHONE", "PRIVATE-EMAIL",
      "PRIVATE-ORDER-ID", "PRIVATE-INVOICE-ID", "PRIVATE-PAYMENT-ID", "PRIVATE-OLDER-INVOICE-ID",
      "PRIVATE-ORG-ID", "organization_id", "customer_id", "invoice_id", "cost_price",
      "profit_margin", "99112233", "554433", "887766", "778899",
    ]) {
      expect(sheet.innerHTML).not.toContain(secret);
    }
  });

  it("does not print Customer 360 while its tenant-scoped summary is loading", async () => {
    mocks.fetchSummary.mockReturnValueOnce(new Promise(() => undefined));
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<AdminCustomer360 customer={customer} onClose={vi.fn()} />);

    const dialog = await screen.findByRole("dialog", { name: "ملف العميل 360" });
    const button = within(dialog).getByRole("button", { name: /طباعة \/ PDF/ });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(printSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId("customer-360-print-document")).not.toBeInTheDocument();
  });

  it("maps payments to currency only through a matching recent invoice and strips all internal IDs", () => {
    const projected = projectStaffCustomer360PrintDocument(summary);
    expect(projected.recentPayments).toEqual([expect.objectContaining({
      invoiceReference: "خارج أحدث 20 فاتورة",
      amount: null,
      currency: null,
    })]);
    expect(JSON.stringify(projected)).not.toContain("invoice-internal-id-older-than-window");
    expect(JSON.stringify(projected)).not.toContain("customer-360-1");
    expect(Object.keys(projected.customer)).not.toContain("id");
    expect(JSON.stringify(projected)).not.toContain("customer_id");
  });

});
