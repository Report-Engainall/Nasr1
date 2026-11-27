// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { supabase } from "@/lib/supabase";
import { CustomerPaymentReceiptSelfServiceActions } from "./CustomerPaymentReceiptSelfServiceActions";
import type { CustomerFinancialSource } from "@/lib/customer-financial-source";

type JsdomWindow = { document: Document; close(): void };
type JsdomModule = { JSDOM: new (html?: string) => { window: JsdomWindow & Window } };
const { JSDOM } = createRequire(import.meta.url)("jsdom") as JsdomModule;
const rpc = vi.mocked(supabase.rpc);
const appOnly: CustomerFinancialSource = {
  source_mode: "APP_ONLY", source_status: "active", source_as_of: null,
  last_synced_at: null, verified_at: null, revision: 1, is_stale: false,
  can_read_app_ledger: true,
};
const otherSource: CustomerFinancialSource = {
  ...appOnly, source_mode: "ONYX", source_as_of: "2026-11-27T20:00:00Z",
  can_read_app_ledger: false,
};
const receiptId = "a0000000-0000-4000-8000-000000000101";
function optionsPayload() {
  return {
    organization_name: "متجر الأغبري",
    receipts: [{
      id: receiptId, receipt_number: "123", customer_code: "C-TEST-01",
      customer_name: "شركة اختبار", currency: "YER", total_amount: "60.00",
      allocation_count: 2, paid_at: "2026-11-02T11:12:13.000Z",
      payment_method: "cash", reference: null,
    }],
    total: 1, limit: 100, offset: 0, has_more: false,
  };
}
function printPayload() {
  return {
    receipt: {
      id: receiptId, receipt_number: "123", currency: "YER", total_amount: "60.00",
      allocation_count: 2, payment_method: "cash", reference: null,
      paid_at: "2026-11-02T11:12:13.000Z",
    },
    customer: {
      id: "a0000000-0000-4000-8000-000000000102",
      customer_code: "C-TEST-01", business_name: "شركة اختبار", contact_name: null,
    },
    allocations: [
      { invoice_number: "INV-TEST-A", invoice_issued_at: "2026-10-01T00:00:00.000Z", currency: "YER", amount: "25.00" },
      { invoice_number: "INV-TEST-B", invoice_issued_at: "2026-10-02T00:00:00.000Z", currency: "YER", amount: "35.00" },
    ],
  };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: vi.fn() } }));

describe("CustomerPaymentReceiptSelfServiceActions", () => {
  it("does not call receipt RPCs for ONYX customers", () => {
    render(<CustomerPaymentReceiptSelfServiceActions source={otherSource} />);
    expect(screen.getByRole("status")).toHaveTextContent("لا توجد سندات قبض محفوظة");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("loads only the customer receipt contract and reprints the saved receipt without a write", async () => {
    rpc.mockResolvedValueOnce({ data: optionsPayload(), error: null } as never)
      .mockResolvedValueOnce({ data: printPayload(), error: null } as never);
    const popup = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const popupWindow = popup.window as unknown as Window;
    Object.assign(popupWindow, { print: vi.fn() });
    vi.spyOn(window, "open").mockReturnValue(popupWindow);

    render(<CustomerPaymentReceiptSelfServiceActions source={appOnly} />);
    await screen.findByRole("option", { name: /سند-000123/ });
    expect(rpc).toHaveBeenNthCalledWith(1, "get_my_customer_payment_receipt_print_options", {
      p_limit: 100, p_offset: 0,
    });
    await userEvent.click(screen.getByRole("button", { name: /طباعة سند القبض/ }));
    await waitFor(() => expect(rpc).toHaveBeenNthCalledWith(2, "get_my_customer_payment_receipt_print_data", {
      p_receipt_id: receiptId,
    }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("تم تجهيز سند القبض"));
    expect(popup.window.document.body.textContent).toContain("SND-000123");
    expect(popup.window.document.body.textContent).toContain("شركة اختبار");
    popup.window.close();
  });
});
