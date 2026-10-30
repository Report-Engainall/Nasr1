import type { ReactNode } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffCustomer360Summary } from "@/lib/customer-360-summary";
import type { Customer } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  fetchSummary: vi.fn(),
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
          data: { id: "customer-360-1" },
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
    expect(within(dialog).getByText("فواتير متأخرة من الدفتر الكامل: count:2")).toBeInTheDocument();
    expect(within(dialog).queryByText(/فواتير: count:0/)).not.toBeInTheDocument();
  });
});
