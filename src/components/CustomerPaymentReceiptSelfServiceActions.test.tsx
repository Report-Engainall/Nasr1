// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

function sourceResponse(source: CustomerFinancialSource = appOnly) {
  return { data: { ...source }, error: null };
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
    rpc.mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: optionsPayload(), error: null } as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: printPayload(), error: null } as never)
      .mockResolvedValueOnce(sourceResponse() as never);
    const popup = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const popupWindow = popup.window as unknown as Window;
    Object.assign(popupWindow, { print: vi.fn() });
    vi.spyOn(window, "open").mockReturnValue(popupWindow);

    render(<CustomerPaymentReceiptSelfServiceActions source={appOnly} />);
    await screen.findByRole("option", { name: /سند-000123/ });
    expect(rpc).toHaveBeenNthCalledWith(2, "get_my_customer_payment_receipt_print_options", {
      p_limit: 100, p_offset: 0,
    });
    await userEvent.click(screen.getByRole("button", { name: /طباعة سند القبض/ }));
    await waitFor(() => expect(rpc).toHaveBeenNthCalledWith(5, "get_my_customer_payment_receipt_print_data", {
      p_receipt_id: receiptId,
    }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("تم تجهيز سند القبض"));
    expect(popup.window.document.body.textContent).toContain("SND-000123");
    expect(popup.window.document.body.textContent).toContain("شركة اختبار");
    popup.window.close();
  });
  it("discards an APP_ONLY receipt page that completes after the source changes", async () => {
    let resolveOptions!: (value: { data: ReturnType<typeof optionsPayload>; error: null }) => void;
    rpc.mockResolvedValueOnce(sourceResponse() as never)
      .mockImplementationOnce(() => new Promise(resolve => { resolveOptions = resolve; }) as never);
    const view = render(<CustomerPaymentReceiptSelfServiceActions source={appOnly} />);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("get_my_customer_payment_receipt_print_options", {
      p_limit: 100, p_offset: 0,
    }));

    view.rerender(<CustomerPaymentReceiptSelfServiceActions source={otherSource} />);
    expect(await screen.findByRole("status")).toHaveTextContent("لا توجد سندات قبض محفوظة");

    await act(async () => {
      resolveOptions({ data: optionsPayload(), error: null });
    });

    expect(screen.queryByRole("option", { name: /سند-000123/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /طباعة سند القبض/ })).toBeDisabled();
  });

  it("closes the print window when the financial source changes while receipt data is loading", async () => {
    let resolvePrint!: (value: { data: ReturnType<typeof printPayload>; error: null }) => void;
    rpc.mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: optionsPayload(), error: null } as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockImplementationOnce(() => new Promise(resolve => { resolvePrint = resolve; }) as never);
    const popup = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const popupWindow = popup.window as unknown as Window;
    const closeSpy = vi.spyOn(popupWindow, "close");
    vi.spyOn(window, "open").mockReturnValue(popupWindow);

    const view = render(<CustomerPaymentReceiptSelfServiceActions source={appOnly} />);
    await screen.findByRole("option", { name: /سند-000123/ });
    await userEvent.click(screen.getByRole("button", { name: /طباعة سند القبض/ }));
    await waitFor(() => expect(rpc).toHaveBeenNthCalledWith(5, "get_my_customer_payment_receipt_print_data", {
      p_receipt_id: receiptId,
    }));

    view.rerender(<CustomerPaymentReceiptSelfServiceActions source={otherSource} />);
    await act(async () => {
      resolvePrint({ data: printPayload(), error: null });
    });

    expect(closeSpy).toHaveBeenCalled();
    expect(popup.window.document.body.textContent).not.toContain("SND-000123");
    expect(screen.getByRole("alert")).toHaveTextContent("تغير مصدر الحساب أثناء تجهيز السند");
    expect(screen.queryByText(/تم تجهيز سند القبض/)).not.toBeInTheDocument();
  });


  it("discards a receipt list when the server source changes after the list RPC", async () => {
    rpc.mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: optionsPayload(), error: null } as never)
      .mockResolvedValueOnce(sourceResponse(otherSource) as never);

    render(<CustomerPaymentReceiptSelfServiceActions source={appOnly} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("تغير مصدر الحساب المالي أثناء تحميل سندات القبض");
    expect(screen.queryByRole("option", { name: /سند-000123/ })).not.toBeInTheDocument();
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenNthCalledWith(1, "get_my_customer_financial_source");
    expect(rpc).toHaveBeenNthCalledWith(2, "get_my_customer_payment_receipt_print_options", {
      p_limit: 100, p_offset: 0,
    });
    expect(rpc).toHaveBeenNthCalledWith(3, "get_my_customer_financial_source");
  });

  it("does not request receipt print data when the server source changes before printing", async () => {
    rpc.mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: optionsPayload(), error: null } as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce(sourceResponse(otherSource) as never);
    const popup = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const popupWindow = popup.window as unknown as Window;
    const closeSpy = vi.spyOn(popupWindow, "close");
    vi.spyOn(window, "open").mockReturnValue(popupWindow);

    render(<CustomerPaymentReceiptSelfServiceActions source={appOnly} />);
    await screen.findByRole("option", { name: /سند-000123/ });
    await userEvent.click(screen.getByRole("button", { name: /طباعة سند القبض/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تغير مصدر الحساب قبل تجهيز سند القبض");
    expect(rpc).toHaveBeenCalledTimes(4);
    expect(rpc).not.toHaveBeenCalledWith("get_my_customer_payment_receipt_print_data", expect.anything());
    expect(closeSpy).toHaveBeenCalled();
    expect(popup.window.document.body.textContent).not.toContain("SND-000123");
    popup.window.close();
  });

  it("closes the print window when the server source changes after the receipt payload", async () => {
    rpc.mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: optionsPayload(), error: null } as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: printPayload(), error: null } as never)
      .mockResolvedValueOnce(sourceResponse(otherSource) as never);
    const popup = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const popupWindow = popup.window as unknown as Window;
    const closeSpy = vi.spyOn(popupWindow, "close");
    vi.spyOn(window, "open").mockReturnValue(popupWindow);

    render(<CustomerPaymentReceiptSelfServiceActions source={appOnly} />);
    await screen.findByRole("option", { name: /سند-000123/ });
    await userEvent.click(screen.getByRole("button", { name: /طباعة سند القبض/ }));

    expect(screen.getByRole("alert")).toHaveTextContent("تغير مصدر الحساب أثناء استرجاع السند");
    expect(rpc).toHaveBeenNthCalledWith(5, "get_my_customer_payment_receipt_print_data", {
      p_receipt_id: receiptId,
    });
    expect(rpc).toHaveBeenNthCalledWith(6, "get_my_customer_financial_source");
    expect(closeSpy).toHaveBeenCalled();
    expect(popup.window.document.body.textContent).not.toContain("SND-000123");
    expect(screen.queryByText(/تم تجهيز سند القبض/)).not.toBeInTheDocument();
    popup.window.close();
  });

  it("rejects a print payload for a different receipt ID", async () => {
    const mismatchedPayload = {
      ...printPayload(),
      receipt: { ...printPayload().receipt, id: "a0000000-0000-4000-8000-000000000999" },
    };
    rpc.mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: optionsPayload(), error: null } as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce(sourceResponse() as never)
      .mockResolvedValueOnce({ data: mismatchedPayload, error: null } as never)
      .mockResolvedValueOnce(sourceResponse() as never);
    const popup = new JSDOM("<!doctype html><html><head></head><body></body></html>");
    const popupWindow = popup.window as unknown as Window;
    const closeSpy = vi.spyOn(popupWindow, "close");
    vi.spyOn(window, "open").mockReturnValue(popupWindow);

    render(<CustomerPaymentReceiptSelfServiceActions source={appOnly} />);
    await screen.findByRole("option", { name: /سند-000123/ });
    await userEvent.click(screen.getByRole("button", { name: /طباعة سند القبض/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("لم يطابق السند الذي أعاده الخادم");
    expect(closeSpy).toHaveBeenCalled();
    expect(popup.window.document.body.textContent).not.toContain("SND-000123");
    expect(screen.queryByText(/تم تجهيز سند القبض/)).not.toBeInTheDocument();
  });

});
