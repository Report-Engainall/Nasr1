// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAuth: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
vi.mock("@/components/SupplierPaymentWorkspace", () => ({
  SupplierPaymentWorkspace: () => <div>supplier-payment-workspace-mounted</div>,
}));
vi.mock("@/components/SupplierInvoiceWorkspace", () => ({
  SupplierInvoiceWorkspace: ({ mode }: { mode: string }) =>
    <div>{mode === "capture" ? "supplier-invoice-capture-mounted" : "supplier-invoice-review-mounted"}</div>,
}));
vi.mock("@/components/SupplierAccountActivityWorkspace", () => ({
  SupplierAccountActivityWorkspace: () => <div>supplier-account-activity-mounted</div>,
}));

import {
  parseSupplierFinanceLedgerAccounts,
  SupplierFinancialWorkspaceHub,
} from "./SupplierFinancialWorkspaceHub";

describe("supplier financial workspace hub", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ ready: true, user: { roles: ["manager"] } });
    mocks.rpc.mockResolvedValue({
      data: {
        accounts: [{
          id: "account-1",
          code: "1101",
          name: "الصندوق الرئيسي",
          account_type: "asset",
          is_active: true,
        }],
      },
      error: null,
    });
  });

  it("parses only verified ledger account projections and rejects malformed account data", () => {
    expect(parseSupplierFinanceLedgerAccounts({
      accounts: [{ id: "account-1", code: "1101", name: "الصندوق", account_type: "asset", is_active: true }],
    })).toEqual([{
      id: "account-1", code: "1101", name: "الصندوق", account_type: "asset", is_active: true,
    }]);
    expect(() => parseSupplierFinanceLedgerAccounts({ accounts: [{ id: "account-1" }] })).toThrow(/تعذر التحقق/);
  });

  it("loads the account list through the same finance-authorized General Ledger RPC and switches existing workspaces", async () => {
    render(createElement(SupplierFinancialWorkspaceHub));

    expect(await screen.findByText("supplier-payment-workspace-mounted")).toBeInTheDocument();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fetch_general_ledger", {
      p_from: null, p_to: null, p_account_id: null, p_limit: 1, p_offset: 0,
    }));

    fireEvent.click(screen.getByRole("tab", { name: "إدخال فواتير الموردين" }));
    expect(await screen.findByText("supplier-invoice-capture-mounted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "مراجعة فروقات الأسعار" }));
    expect(await screen.findByText("supplier-invoice-review-mounted")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "كشف حساب المورد" }));
    expect(await screen.findByText("supplier-account-activity-mounted")).toBeInTheDocument();
  });

  it("does not request or expose financial workspaces to a non-finance role", () => {
    mocks.useAuth.mockReturnValue({ ready: true, user: { roles: ["staff"] } });
    render(createElement(SupplierFinancialWorkspaceHub));

    expect(screen.getByRole("note")).toHaveTextContent("مخصصة للأدوار المالية المخوّلة");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
