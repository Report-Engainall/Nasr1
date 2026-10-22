import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { CustomerStatementPage } from "@/components/CustomerWorkflows";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: mocks.rpc, auth: { getSession: vi.fn() } },
  getCurrentTenantScope: vi.fn(),
  getStorefrontDataScope: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { roles: ["customer"], profileId: "profile-statement-test", isStaff: false }, ready: true }),
}));

vi.mock("@/lib/api", () => ({
  fetchProducts: vi.fn(),
  fetchResolvedProductPrices: vi.fn(),
}));

vi.mock("@/lib/customer-addresses", () => ({
  fetchCustomerAddresses: vi.fn(),
  saveCustomerAddress: vi.fn(),
  deleteCustomerAddress: vi.fn(),
}));

vi.mock("@/lib/customer-company-contacts", () => ({
  fetchCustomerCompanyContacts: vi.fn(),
  saveCustomerCompanyContact: vi.fn(),
  deleteCustomerCompanyContact: vi.fn(),
}));

describe("customer statement full-ledger and posted-credit integration", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.rpc.mockImplementation((name: string) => {
      if (name === "get_customer_account_statement") {
        return Promise.resolve({
          data: {
            invoices: [{
              id: "invoice-credit-1",
              invoice_number: "INV-CREDIT-001",
              order_id: "order-1",
              customer_id: "customer-1",
              status: "issued",
              issued_at: "2026-10-01T00:00:00.000Z",
              due_at: "2026-10-10T00:00:00.000Z",
              currency: "YER",
              total_amount: "500.00",
              paid_amount: "100.00",
              credit_memo_amount: "125.00",
              outstanding_amount: "275.00",
            }],
            payments: [{ id: "payment-1", invoice_id: "invoice-credit-1", amount: "100.00", paid_at: "2026-10-05T00:00:00.000Z" }],
            credits: [{
              id: "credit-1",
              invoice_id: "invoice-credit-1",
              invoice_number: "INV-CREDIT-001",
              memo_number: "CRM-001",
              currency: "YER",
              total_amount: "125.00",
              posted_at: "2026-10-15T00:00:00.000Z",
            }],
            summary: [{
              currency: "YER",
              invoiced: "1500.00",
              paid: "200.00",
              credited: "125.00",
              outstanding: "1175.00",
              overdue_invoice_count: 1,
              overdue_outstanding: "275.00",
              unknown_due_date_invoice_count: 0,
              unknown_due_date_outstanding: "0.00",
            }],
            summary_as_of_utc: "2026-10-19T00:00:00.000Z",
          },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: { message: "unexpected RPC" } });
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the authoritative full-ledger balance and the posted credit source without double-counting payments", async () => {
    render(<CustomerStatementPage />);
    expect(await screen.findByText("CRM-001")).toBeInTheDocument();
    expect(screen.getByText("الإشعارات الدائنة المرحّلة")).toBeInTheDocument();
    expect(screen.getByText("INV-CREDIT-001")).toBeInTheDocument();
    expect(screen.getByText(/إجماليات الرصيد محسوبة من دفتر العميل الكامل/)).toBeInTheDocument();
    expect(screen.getByText(/عدد الدفعات المسجلة: 1/)).toBeInTheDocument();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("get_customer_account_statement"));
    // 1,500 full-ledger invoices must be visible even though only a single invoice row was returned.
    expect(screen.getByText(/١٬٥٠٠|1,500|1500/)).toBeInTheDocument();
  });

  it("does not show a numeric balance when the authoritative summary is malformed", async () => {
    mocks.rpc.mockImplementationOnce(() => Promise.resolve({
      data: {
        invoices: [],
        payments: [],
        credits: [],
        summary: [{ currency: "YER", invoiced: "not-money", paid: "0.00", credited: "0.00", outstanding: "0.00",
          overdue_invoice_count: 0, overdue_outstanding: "0.00", unknown_due_date_invoice_count: 0, unknown_due_date_outstanding: "0.00" }],
      },
      error: null,
    }));
    render(<CustomerStatementPage />);
    expect(await screen.findByText(/تعذر احتساب أرصدة الحساب بدقة/)).toBeInTheDocument();
    expect(screen.queryByText(/1500/)).not.toBeInTheDocument();
  });
});
