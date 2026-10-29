import { describe, expect, it } from "vitest";
import { readCustomerReturnReceiptPrintHistory } from "@/lib/customer-return-receipts";

const validReceipt = {
  receipt_id: "44444444-4444-4444-8444-444444444444",
  receipt_number: "RETREC-20261029-ABCDEF12",
  request_number: "RET-0009",
  order_number: "ORD-0009",
  customer_name: "عميل محفوظ",
  warehouse_name: "مخزن محفوظ",
  received_at: "2026-10-29T17:05:00.000Z",
  received_line_count: 2,
  received_quantity: 2.25,
  restockable_quantity: 1.5,
  defective_quantity: 0.75,
};

describe("persisted return receipt print history", () => {
  it("parses a bounded history list with stable labels and validated totals", () => {
    const parsed = readCustomerReturnReceiptPrintHistory({
      receipts: [validReceipt],
      has_more: true,
      limit: 50,
      offset: 100,
      internal_debug_id: "MUST-BE-IGNORED",
    });
    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(100);
    expect(parsed.has_more).toBe(true);
    expect(parsed.receipts).toEqual([validReceipt]);
    expect(JSON.stringify(parsed)).not.toContain("MUST-BE-IGNORED");
  });

  it("fails closed on invalid pagination, duplicate identities, and mismatched receipt totals", () => {
    expect(() => readCustomerReturnReceiptPrintHistory({
      receipts: [validReceipt], has_more: false, limit: 0, offset: 0,
    })).toThrow(/سجل إيصالات محفوظة غير صالح/);
    expect(() => readCustomerReturnReceiptPrintHistory({
      receipts: [validReceipt], has_more: false, limit: 50, offset: -1,
    })).toThrow(/سجل إيصالات محفوظة غير صالح/);
    expect(() => readCustomerReturnReceiptPrintHistory({
      receipts: [validReceipt, validReceipt], has_more: false, limit: 50, offset: 0,
    })).toThrow(/معرّفًا مكررًا/);
    expect(() => readCustomerReturnReceiptPrintHistory({
      receipts: [{ ...validReceipt, defective_quantity: 1 }], has_more: false, limit: 50, offset: 0,
    })).toThrow(/إجماليات إيصال محفوظ غير متسقة/);
    expect(() => readCustomerReturnReceiptPrintHistory({
      receipts: [validReceipt], has_more: false, limit: 1, offset: 0, extra: "x",
    })).not.toThrow();
    expect(() => readCustomerReturnReceiptPrintHistory({
      receipts: [validReceipt, { ...validReceipt, receipt_id: "second" }],
      has_more: false,
      limit: 1,
      offset: 0,
    })).toThrow(/سجل إيصالات محفوظة غير صالح/);
  });
});
