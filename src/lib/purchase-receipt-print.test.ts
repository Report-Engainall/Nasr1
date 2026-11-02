import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  fetchPurchaseReceiptPrintDocument,
  fetchPurchaseReceiptPrintHistory,
  parsePurchaseReceiptHistoryPage,
  parsePurchaseReceiptPrintDocument,
} from "@/lib/purchase-receipt-print";

const receiptId = "11111111-1111-4111-8111-111111111111";
const validHistory = {
  receipts: [{ id: receiptId, receipt_number: "PR-20261102-000001", received_at: "2026-11-02T10:00:00.000Z", item_count: 2 }],
  total_count: 1, limit: 20, offset: 0, has_more: false,
};
const validDocument = {
  receipt_number: "PR-20261102-000001",
  purchase_order_number: "PO-20261101-000004",
  supplier_name: "مورد الأغبري",
  warehouse_name: "المخزن الرئيسي",
  received_at: "2026-11-02T10:00:00.000Z",
  currency: "YER",
  costs_complete: true,
  received_cost: "30.50",
  items: [
    { item_code: "0000125", product_name: "سكر", unit: "كرتون", quantity_received: "2.000", unit_cost: "10.00", line_total: "20.00" },
    { item_code: "0000042", product_name: "زيت", unit: "كرتون", quantity_received: "1", unit_cost: "10.50", line_total: "10.50" },
  ],
};

describe("purchase receipt print data contracts", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("parses a paginated saved receipt register without exposing internal IDs beyond the action key", () => {
    const page = parsePurchaseReceiptHistoryPage(validHistory);
    expect(page.receipts[0]).toMatchObject({ receipt_number: "PR-20261102-000001", item_count: 2 });
    expect(page).toMatchObject({ total_count: 1, has_more: false });
  });

  it("rejects receipt history paging inconsistencies and malformed saved identifiers", () => {
    expect(() => parsePurchaseReceiptHistoryPage({ ...validHistory, has_more: true })).toThrow(/تعارضت/);
    expect(() => parsePurchaseReceiptHistoryPage({ ...validHistory, receipts: [{ ...validHistory.receipts[0], id: "not-a-uuid" }] })).toThrow();
    expect(() => parsePurchaseReceiptHistoryPage({ ...validHistory, receipts: [{ ...validHistory.receipts[0], item_count: 0 }] })).toThrow();
  });

  it("requires exact cents reconciliation across all saved receipt items", () => {
    const parsed = parsePurchaseReceiptPrintDocument(validDocument);
    expect(parsed.received_cost).toBe("30.50");
    expect(parsed.items[0].item_code).toBe("0000125");
    expect(() => parsePurchaseReceiptPrintDocument({
      ...validDocument, received_cost: "30.51",
    })).toThrow(/لا تتطابق/);
  });

  it("withholds every cost when any source line cost is unknown", () => {
    const incomplete = {
      ...validDocument,
      costs_complete: false,
      received_cost: null,
      items: validDocument.items.map((item, index) => index === 0
        ? { ...item, unit_cost: null, line_total: null }
        : { ...item, unit_cost: null, line_total: null }),
    };
    expect(parsePurchaseReceiptPrintDocument(incomplete).received_cost).toBeNull();
    expect(() => parsePurchaseReceiptPrintDocument({
      ...incomplete,
      received_cost: "0.00",
    })).toThrow(/يجب إخفاء/);
  });

  it("loads the register through the tenant-gated RPC with the requested page", async () => {
    mocks.rpc.mockResolvedValue({ data: validHistory, error: null });
    await expect(fetchPurchaseReceiptPrintHistory("22222222-2222-4222-8222-222222222222", {
      limit: 20, offset: 40,
    })).resolves.toMatchObject({ offset: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("fetch_purchase_order_receipt_history", {
      p_purchase_order_id: "22222222-2222-4222-8222-222222222222", p_limit: 20, p_offset: 40,
    });
  });

  it("rejects invalid receipt IDs before the print RPC and surfaces server denials", async () => {
    await expect(fetchPurchaseReceiptPrintDocument("bad-id")).rejects.toThrow(/غير صالح/);
    expect(mocks.rpc).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "finance permission required" } });
    await expect(fetchPurchaseReceiptPrintDocument(receiptId)).rejects.toThrow(/finance permission required/);
  });
});
