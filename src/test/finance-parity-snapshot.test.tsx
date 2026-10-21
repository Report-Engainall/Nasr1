import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { FinanceParitySnapshot } from "@/components/FinanceParitySnapshot";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  roles: ["accountant"] as string[],
}));

vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: { roles: mocks.roles }, ready: true }),
}));

const ledger = {
  accounts: [
    { id: "cash", code: "1000", name: "النقدية", account_type: "asset", is_active: true, debit_total: "1000.00", credit_total: "100.00" },
    { id: "closed", code: "1010", name: "أصل مؤرشف", account_type: "asset", is_active: false, debit_total: "800.00", credit_total: "0.00" },
    { id: "sales", code: "4000", name: "الإيرادات", account_type: "revenue", is_active: true, debit_total: "0.00", credit_total: "500.00" },
  ],
  entries: [],
  entry_count: 0,
  has_more: false,
  summary: { posted_entry_count: 2, debit_total: "1100.00", credit_total: "1100.00" },
};

const aging = {
  as_of_utc: "2026-10-21",
  total_open_invoices: 2,
  summary: [
    {
      currency: "YER",
      open_invoice_count: 2,
      overdue_invoice_count: 1,
      unknown_due_date_count: 0,
      total_outstanding_amount: 245.5,
    },
    {
      currency: "USD",
      open_invoice_count: 1,
      overdue_invoice_count: 0,
      unknown_due_date_count: 1,
      total_outstanding_amount: 30,
    },
  ],
  items: [],
};

describe("ledger-backed finance parity snapshot", () => {
  beforeEach(() => {
    mocks.roles = ["accountant"];
    mocks.rpc.mockReset().mockImplementation((name: string) =>
      Promise.resolve({ data: name === "fetch_general_ledger" ? ledger : aging, error: null }),
    );
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("reads only existing finance RPCs and keeps currency totals separate", async () => {
    render(<FinanceParitySnapshot />);

    expect(await screen.findByRole("heading", { name: "ملخص المحاسبة والتحصيل" })).toBeInTheDocument();
    expect(await screen.findByText("245.50 ر.ي")).toBeInTheDocument();
    expect(screen.getByText("30.00 USD")).toBeInTheDocument();
    expect(screen.getByText("900.00 ر.ي")).toBeInTheDocument();
    expect(screen.getByText("1000")).toBeInTheDocument();
    expect(screen.queryByText("أصل مؤرشف")).not.toBeInTheDocument();

    expect(mocks.rpc).toHaveBeenCalledWith("fetch_general_ledger", {
      p_from: null, p_to: null, p_account_id: null, p_limit: 1, p_offset: 0,
    });
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_staff_receivables_aging", { p_limit: 1, p_offset: 0 });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });

  it("does not invoke finance RPCs for operational-only or customer roles", () => {
    mocks.roles = ["staff"];
    const view = render(<FinanceParitySnapshot />);
    expect(view.container).toBeEmptyDOMElement();
    expect(mocks.rpc).not.toHaveBeenCalled();

    view.rerender(<FinanceParitySnapshot />);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("fails closed when the server response contains malformed money data", async () => {
    mocks.rpc.mockImplementation((name: string) =>
      Promise.resolve({
        data: name === "fetch_general_ledger"
          ? ledger
          : { ...aging, summary: [{ ...aging.summary[0], total_outstanding_amount: "12.345" }] },
        error: null,
      }),
    );

    render(<FinanceParitySnapshot />);
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر التحقق من أرقام الذمم المدينة.");
    expect(screen.queryByText("245.50 ر.ي")).not.toBeInTheDocument();
  });
});
