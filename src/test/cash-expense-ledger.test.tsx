import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  rpc: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/lib/cash-expense-xlsx", () => ({ downloadCashExpenseWorkbookXlsx: mocks.download }));

import { CashExpenseLedger } from "@/components/CashExpenseLedger";

const payload = {
  items: [{
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    expense_number: "17",
    category: "نقل",
    description: "نقل شحنة فعلية",
    amount: "250.00",
    currency: "YER",
    payment_method: "cash",
    reference: null,
    expense_date: "2026-11-02",
    status: "posted",
    created_by_profile_id: "PRIVATE-ACTOR-ID",
    voided_at: null,
    void_reason: null,
    created_at: "2026-11-02T10:00:00.000Z",
  }],
  total_count: 1,
  summary_by_currency: [{ currency: "YER", posted_count: 1, posted_amount: "250.00", void_count: 0 }],
  as_of_utc: "2026-11-03T08:00:00.000Z",
  limit: 50,
  offset: 0,
  has_more: false,
};

describe("CashExpenseLedger XLSX action", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset().mockReturnValue({
      user: { roles: ["accountant"], profileId: "profile-accountant" },
    });
    mocks.rpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "fetch_staff_cash_expenses") return { data: payload, error: null };
      return { data: null, error: { message: "unexpected RPC " + name } };
    });
    mocks.download.mockReset().mockReturnValue(true);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });
  it("exports the current server page with the active finance role and filters", async () => {
    render(<CashExpenseLedger />);
    await screen.findByText("نقل شحنة فعلية");
    fireEvent.click(screen.getByRole("button", { name: /تصدير Excel للصفحة الحالية/ }));
    await waitFor(() => expect(mocks.download).toHaveBeenCalledTimes(1));
    expect(mocks.download).toHaveBeenCalledWith(expect.objectContaining({
      payload,
      roles: ["accountant"],
      filters: { search: "", from: "", to: "", status: "all" },
    }));
    expect(await screen.findByRole("status")).toHaveTextContent("ملخص العملات يشمل 1 سجلًا مطابقًا للفلاتر");
  });
  it("hides the finance register and export action from ordinary staff and customers", () => {
    mocks.useAuth.mockReturnValue({ user: { roles: ["staff"] } });
    const { unmount } = render(<CashExpenseLedger />);
    expect(screen.getByRole("alert")).toHaveTextContent("صلاحية المحاسبة مطلوبة");
    expect(screen.queryByRole("button", { name: /تصدير Excel/ })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
    unmount();

    mocks.useAuth.mockReturnValue({ user: { roles: ["customer"] } });
    render(<CashExpenseLedger />);
    expect(screen.getByRole("alert")).toHaveTextContent("صلاحية المحاسبة مطلوبة");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("surfaces workbook validation and browser download errors instead of claiming success", async () => {
    mocks.download.mockImplementation(() => { throw new Error("تعذر التحقق من نطاق التصدير."); });
    render(<CashExpenseLedger />);
    await screen.findByText("نقل شحنة فعلية");
    fireEvent.click(screen.getByRole("button", { name: /تصدير Excel للصفحة الحالية/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر التحقق من نطاق التصدير.");
    expect(screen.queryByRole("status")).not.toHaveTextContent("تم تصدير");
  });
});
