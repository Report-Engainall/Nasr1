// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminCustomer360 } from "./AdminCustomer360";

const mocks = vi.hoisted(() => ({
  getTenantScope: vi.fn(),
  loadScopedCustomer: vi.fn(),
  fetchFinancialSource: vi.fn(),
  fetchSummary: vi.fn(),
  fetchInteractions: vi.fn(),
}));

vi.mock("@/components/AdminPages", () => ({
  Button: ({ children, onClick, disabled }: any) => <button onClick={onClick} disabled={disabled}>{children}</button>,
  Empty: ({ text }: any) => <p>{text}</p>,
  ErrorBox: ({ message }: any) => <p role="alert">{message}</p>,
  Loading: () => <p role="status">جار التحميل...</p>,
  Modal: ({ children, title }: any) => <div role="dialog" aria-label={title}>{children}</div>,
  TableWrap: ({ children }: any) => <div>{children}</div>,
}));
vi.mock("@/lib/api", () => ({
  fetchCustomerInteractions: mocks.fetchInteractions,
  fetchStaffCustomer360Summary: mocks.fetchSummary,
  manageCustomerInteractionFollowUp: vi.fn(),
  recordCustomerInteraction: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  getCurrentTenantScope: mocks.getTenantScope,
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: mocks.loadScopedCustomer }),
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/customer-financial-source", () => ({
  fetchStaffCustomerFinancialSource: mocks.fetchFinancialSource,
  canReadCustomerAppLedger: (source: any) => Boolean(
    source && source.source_mode === "APP_ONLY" && source.source_status === "active" &&
    !source.is_stale && source.can_read_app_ledger
  ),
}));
vi.mock("@/lib/customer-360-xlsx", () => ({ downloadStaffCustomer360WorkbookXlsx: vi.fn() }));
vi.mock("@/lib/customer-360-print", () => ({ projectStaffCustomer360PrintDocument: vi.fn() }));
vi.mock("@/components/Customer360PrintSheet", () => ({ Customer360PrintSheet: () => null }));
vi.mock("@/components/CustomerServiceCases", () => ({ CustomerServiceCases: () => null }));
vi.mock("@/components/CustomerAssetsPanel", () => ({ CustomerAssetsPanel: () => null }));
vi.mock("@/lib/customer-retention-client", () => ({ fetchCustomerRetentionReport: vi.fn() }));

const customerId = "11111111-1111-4111-8111-111111111111";
const onyxSource = {
  source_mode: "ONYX", source_status: "active",
  source_as_of: "2026-11-27T20:00:00Z", last_synced_at: "2026-11-27T20:05:00Z",
  verified_at: "2026-11-27T19:55:00Z", revision: 2, is_stale: false,
  can_read_app_ledger: false,
};
const appOnlySource = {
  ...onyxSource, source_mode: "APP_ONLY", source_as_of: null,
  last_synced_at: null, verified_at: null, can_read_app_ledger: true,
};

beforeEach(() => {
  mocks.getTenantScope.mockResolvedValue({ organizationId: "22222222-2222-4222-8222-222222222222" });
  mocks.loadScopedCustomer.mockResolvedValue({ data: { id: customerId }, error: null });
  mocks.fetchFinancialSource.mockResolvedValue(onyxSource);
  mocks.fetchSummary.mockRejectedValue(new Error("summary should remain blocked in this test"));
  mocks.fetchInteractions.mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("AdminCustomer360 financial source gate", () => {
  it("shows the selected ONYX source and never calls the APP_ONLY finance projection", async () => {
    render(<AdminCustomer360 customer={{ id: customerId }} onClose={vi.fn()} />);
    expect(await screen.findByText(/مصدر الحساب المحدد: Onyx Pro/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("ملخص Customer 360 المالي غير متاح");
    expect(mocks.fetchFinancialSource).toHaveBeenCalledWith(customerId);
    expect(mocks.fetchSummary).not.toHaveBeenCalled();
  });

  it("does not load Customer 360 when the selected source is suspended", async () => {
    mocks.fetchFinancialSource.mockResolvedValue({ ...appOnlySource, source_status: "suspended", can_read_app_ledger: false });
    render(<AdminCustomer360 customer={{ id: customerId }} onClose={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("مصدر الحساب المالي موقوف");
    expect(mocks.fetchSummary).not.toHaveBeenCalled();
  });

  it("fails closed when the staff source resolver is unavailable", async () => {
    mocks.fetchFinancialSource.mockRejectedValue(new Error("RPC unavailable"));
    render(<AdminCustomer360 customer={{ id: customerId }} onClose={vi.fn()} />);
    expect(await screen.findByText(/تعذر التحقق من مصدر الحساب المالي لهذا العميل/)).toBeInTheDocument();
    expect(mocks.fetchSummary).not.toHaveBeenCalled();
  });

  it("calls the ledger summary only after the server confirms APP_ONLY and active", async () => {
    mocks.fetchFinancialSource.mockResolvedValue(appOnlySource);
    render(<AdminCustomer360 customer={{ id: customerId }} onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.fetchSummary).toHaveBeenCalledWith(customerId));
    expect(screen.getByText(/مصدر الحساب المالي: دفتر متجر الأغبري/)).toBeInTheDocument();
  });

  it("ignores a late financial-source response after the selected customer changes", async () => {
    const otherCustomerId = "33333333-3333-4333-8333-333333333333";
    let resolveFirstSource!: (value: typeof appOnlySource) => void;
    mocks.loadScopedCustomer
      .mockResolvedValueOnce({ data: { id: customerId }, error: null })
      .mockResolvedValueOnce({ data: { id: otherCustomerId }, error: null });
    mocks.fetchFinancialSource.mockImplementation((id: string) => id === customerId
      ? new Promise<typeof appOnlySource>(resolve => { resolveFirstSource = resolve; })
      : Promise.resolve(onyxSource));

    const view = render(<AdminCustomer360 customer={{ id: customerId }} onClose={vi.fn()} />);
    await waitFor(() => expect(mocks.fetchFinancialSource).toHaveBeenCalledWith(customerId));
    view.rerender(<AdminCustomer360 customer={{ id: otherCustomerId }} onClose={vi.fn()} />);
    expect(await screen.findByText(/مصدر الحساب المحدد: Onyx Pro/)).toBeInTheDocument();

    await act(async () => { resolveFirstSource(appOnlySource); });

    expect(screen.getByText(/مصدر الحساب المحدد: Onyx Pro/)).toBeInTheDocument();
    expect(mocks.fetchSummary).not.toHaveBeenCalled();
  });
});
