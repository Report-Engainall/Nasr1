import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { PurchaseReceiptAccountingWorkspace } from "@/components/PurchaseReceiptAccountingWorkspace";

const receipt = {
  receipt_id: "receipt-1", receipt_number: "PR-20261021-000001", purchase_order_id: "po-1",
  purchase_order_number: "PO-20261021-000001", supplier_name: "مورد الاختبار", warehouse_name: "المخزن الرئيسي",
  received_at: "2026-10-21T10:00:00.000Z", received_cost: 100.25, currency: "YER", costs_complete: true,
  journal_entry_id: null, journal_entry_number: null, journal_status: null, inventory_account_id: null, payable_account_id: null,
};
const queue = {
  accounts: [
    { id: "asset-1", code: "INV-01", name: "مخزون البضاعة", account_type: "asset", is_active: true },
    { id: "liability-1", code: "AP-01", name: "ذمم الموردين", account_type: "liability", is_active: true },
  ],
  receipts: [receipt],
};

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockImplementation(async (name: string) => {
    if (name === "fetch_purchase_receipt_accounting_queue") return { data: queue, error: null };
    if (name === "prepare_purchase_receipt_accounting_draft") return { data: {
      receipt_id: receipt.receipt_id, receipt_number: receipt.receipt_number, journal_entry_id: "journal-1",
      journal_entry_number: "J-2026-001", status: "draft", source_amount: 100.25, source_currency: "YER", replayed: false,
    }, error: null };
    return { data: null, error: { message: "unexpected RPC" } };
  });
  vi.stubGlobal("crypto", { randomUUID: () => "12345678-1234-4234-8234-123456789abc" });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("purchase receipt accounting workspace", () => {
  it("fails closed when receipt costs are missing and creates no journal", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "fetch_purchase_receipt_accounting_queue"
      ? { data: { ...queue, receipts: [{ ...receipt, costs_complete: false, received_cost: null }] }, error: null }
      : { data: null, error: null });
    render(<PurchaseReceiptAccountingWorkspace purchaseOrderId="po-1" />);
    expect(await screen.findByText(/التكاليف المصدرية ناقصة/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إعداد مسودة القيد" })).not.toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("uses the selected accounts and server RPC, then displays the returned draft journal", async () => {
    render(<PurchaseReceiptAccountingWorkspace purchaseOrderId="po-1" />);
    fireEvent.click(await screen.findByRole("button", { name: "إعداد مسودة القيد" }));
    expect(await screen.findByText(/أُنشئت مسودة القيد J-2026-001/)).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("prepare_purchase_receipt_accounting_draft", {
      p_receipt_id: "receipt-1", p_inventory_account_id: "asset-1", p_payable_account_id: "liability-1",
      p_idempotency_key: "12345678-1234-4234-8234-123456789abc",
    });
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledWith("fetch_purchase_receipt_accounting_queue", { p_purchase_order_id: "po-1", p_limit: 50 }));
  });

  it("shows a recorded journal without offering a second draft action", async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === "fetch_purchase_receipt_accounting_queue"
      ? { data: { ...queue, receipts: [{ ...receipt, journal_entry_id: "journal-1", journal_entry_number: "55", journal_status: "posted",
          inventory_account_id: "asset-1", payable_account_id: "liability-1" }] }, error: null }
      : { data: null, error: { message: "must not run" } });
    render(<PurchaseReceiptAccountingWorkspace purchaseOrderId="po-1" />);
    expect(await screen.findByText(/قيد 55 — الحالة: مرحل/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إعداد مسودة القيد" })).not.toBeInTheDocument();
  });
});
