import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ history: vi.fn(), print: vi.fn() }));
vi.mock("@/lib/purchase-receipt-print", () => ({
  fetchPurchaseReceiptPrintHistory: mocks.history,
  fetchPurchaseReceiptPrintDocument: mocks.print,
}));

import { PurchaseReceiptPrintActions, renderPurchaseReceiptPrintHtml } from "@/components/PurchaseReceiptPrintActions";

const receiptId = "11111111-1111-4111-8111-111111111111";
const historyPage = {
  receipts: [{ id: receiptId, receipt_number: "PR-20261102-000001", received_at: "2026-11-02T10:00:00.000Z", item_count: 1, items: [] }],
  total_count: 1, limit: 20, offset: 0, has_more: false,
};
const printDocument = {
  receipt_number: "PR-20261102-000001",
  purchase_order_number: "PO-20261101-000004",
  supplier_name: "مورد الاختبار",
  warehouse_name: "المخزن الرئيسي",
  received_at: "2026-11-02T10:00:00.000Z",
  currency: "YER",
  costs_complete: false,
  received_cost: null,
  items: [{
    item_code: "0000125", product_name: "<script>alert(1)</script>",
    unit: "كرتون", quantity_received: "2.125", unit_cost: null, line_total: null,
  }],
};

describe("purchase receipt print actions", () => {
  beforeEach(() => {
    mocks.history.mockReset().mockResolvedValue(historyPage);
    mocks.print.mockReset().mockResolvedValue(printDocument);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("loads saved receipts and re-fetches the persisted snapshot before opening a print document", async () => {
    const popup = {
      closed: false, opener: null,
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
      focus: vi.fn(), print: vi.fn(), close: vi.fn(),
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(popup);
    render(<PurchaseReceiptPrintActions purchaseOrderId="22222222-2222-4222-8222-222222222222" />);
    expect(await screen.findByText("PR-20261102-000001")).toBeInTheDocument();
    expect(mocks.history).toHaveBeenCalledWith("22222222-2222-4222-8222-222222222222", { limit: 20, offset: 0 });

    fireEvent.click(screen.getByRole("button", { name: /طباعة الإيصال/ }));
    await waitFor(() => expect(mocks.print).toHaveBeenCalledWith(receiptId));
    await waitFor(() => expect(popup.print).toHaveBeenCalledTimes(1));
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining("PR-20261102-000001"));
    expect(popup.document.write).toHaveBeenCalledWith(expect.stringContaining("لا تنشئ الطباعة إيصالًا جديدًا أو حركة مخزون أو قيدًا محاسبيًا."));
    expect(popup.print).toHaveBeenCalledTimes(1);
  });

  it("escapes source text and never prints partial financial values", () => {
    const html = renderPurchaseReceiptPrintHtml(printDocument);
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("لم تُعرض أي قيمة مالية");
    expect(html).not.toContain("تكلفة الوحدة");
    expect(html).toContain("A4 portrait");
    expect(html).toContain("٢٫١٢٥");
  });

  it("reports an empty receipt history rather than inventing receipt rows", async () => {
    mocks.history.mockResolvedValue({ receipts: [], total_count: 0, limit: 20, offset: 0, has_more: false });
    render(<PurchaseReceiptPrintActions purchaseOrderId="22222222-2222-4222-8222-222222222222" />);
    expect(await screen.findByText(/لا توجد إيصالات استلام محفوظة/)).toBeInTheDocument();
  });
});
