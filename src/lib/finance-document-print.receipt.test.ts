import { createRequire } from "node:module";
import { describe, expect, it, vi } from "vitest";
import {
  readCustomerPaymentReceiptPrintPayload,
  renderCustomerPaymentReceiptDocument,
} from "./finance-document-print";

type JsdomWindow = { document: Document; close(): void };
type JsdomModule = { JSDOM: new (html?: string) => { window: JsdomWindow } };
const { JSDOM } = createRequire(import.meta.url)("jsdom") as JsdomModule;

const savedPaidAt = "2026-11-02T11:12:13.000Z";

function receiptPayload() {
  return readCustomerPaymentReceiptPrintPayload({
    receipt: {
      id: "a0000000-0000-4000-8000-000000000101",
      receipt_number: "202611020001",
      currency: "YER",
      total_amount: "60.00",
      allocation_count: 2,
      payment_method: "cash",
      reference: null,
      paid_at: savedPaidAt,
    },
    customer: {
      id: "a0000000-0000-4000-8000-000000000102",
      customer_code: "C-TEST-01",
      business_name: "شركة اختبار",
      contact_name: null,
    },
    allocations: [
      {
        invoice_number: "INV-TEST-A",
        invoice_issued_at: "2026-10-01T00:00:00.000Z",
        currency: "YER",
        amount: "25.00",
      },
      {
        invoice_number: "INV-TEST-B",
        invoice_issued_at: "2026-10-02T00:00:00.000Z",
        currency: "YER",
        amount: "35.00",
      },
    ],
  });
}

describe("customer payment receipt document chronology", () => {
  it("renders the immutable server payment timestamp on every reprint, not the current print time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-27T18:39:00.000Z"));
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");

    try {
      renderCustomerPaymentReceiptDocument(dom.window.document, receiptPayload(), "متجر الأغبري");

      const headerDate = dom.window.document.querySelector("main > header p")?.textContent ?? "";
      const receiptDate = Array.from(dom.window.document.querySelectorAll("main > section.meta p"))
        .find((item) => item.textContent?.startsWith("تاريخ القبض:"))?.textContent ?? "";

      expect(headerDate).toMatch(/^تاريخ إنشاء المستند: /);
      expect(receiptDate).toMatch(/^تاريخ القبض: /);
      expect(headerDate.replace("تاريخ إنشاء المستند: ", ""))
        .toBe(receiptDate.replace("تاريخ القبض: ", ""));

      const currentPrintTime = new Intl.DateTimeFormat("ar-YE", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
      expect(headerDate).not.toContain(currentPrintTime);
    } finally {
      dom.window.close();
      vi.useRealTimers();
    }
  });
});
