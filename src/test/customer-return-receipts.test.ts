import { describe, expect, it } from "vitest";
import {
  buildCustomerReturnReceiptLines,
  createReturnReceiptIdempotencyKey,
  readCustomerReturnReceiptQueue,
  readReturnReceiptMutationResult,
  type CustomerReturnReceiptLine,
} from "@/lib/customer-return-receipts";

const items: CustomerReturnReceiptLine[] = [
  {
    request_item_id: "11111111-1111-4111-8111-111111111111",
    product_id: "a1000000-0000-0000-0000-000000000001",
    item_code: "000125",
    product_name: "صنف مرتجع",
    unit: "كرتون",
    requested_quantity: 5,
    received_quantity: 1.5,
    remaining_quantity: 3.5,
  },
  {
    request_item_id: "22222222-2222-4222-8222-222222222222",
    product_id: null,
    item_code: "000126",
    product_name: "صنف غير مربوط",
    unit: "حبة",
    requested_quantity: 2,
    received_quantity: 0,
    remaining_quantity: 2,
  },
];

describe("customer return receipt validation", () => {
  it("validates the queue returned by the tenant-scoped RPC and preserves leading zeroes", () => {
    const queue = readCustomerReturnReceiptQueue({
      warehouses: [{ id: "w1", name: "المخزن الرئيسي", code: "WH-01" }],
      requests: [{
        id: "r1", request_number: "RET-1", order_number: "ORD-1", customer_name: "عميل",
        created_at: "2026-10-20T00:00:00Z",
        items: [{
          request_item_id: items[0].request_item_id, product_id: items[0].product_id,
          item_code: "000125", product_name: "صنف مرتجع", unit: "كرتون",
          requested_quantity: 5, received_quantity: 1.5, remaining_quantity: 3.5,
        }],
      }],
    });
    expect(queue.requests[0].items[0].item_code).toBe("000125");
    expect(queue.warehouses[0].code).toBe("WH-01");
  });

  it("partitions inspected quantity into restockable and defective quantities without changing the received total", () => {
    expect(buildCustomerReturnReceiptLines({
      [items[0].request_item_id]: { received_quantity: "1.25", restockable_quantity: "0.75" },
    }, items)).toEqual([{
      request_item_id: items[0].request_item_id,
      received_quantity: 1.25,
      restockable_quantity: 0.75,
    }]);
  });

  it("rejects over-receipt, fractional precision beyond three decimals, and restock larger than receipt", () => {
    expect(() => buildCustomerReturnReceiptLines({
      [items[0].request_item_id]: { received_quantity: "3.501", restockable_quantity: "0" },
    }, items)).toThrow(/يتجاوز المتبقي/);
    expect(() => buildCustomerReturnReceiptLines({
      [items[0].request_item_id]: { received_quantity: "1.0001", restockable_quantity: "0" },
    }, items)).toThrow(/ثلاث منازل/);
    expect(() => buildCustomerReturnReceiptLines({
      [items[0].request_item_id]: { received_quantity: "1", restockable_quantity: "1.001" },
    }, items)).toThrow(/لا يمكن أن تتجاوز/);
    expect(() => buildCustomerReturnReceiptLines({
      [items[1].request_item_id]: { received_quantity: "1", restockable_quantity: "0.1" },
    }, items)).toThrow(/منتج فعلي/);
  });

  it("requires an explicit restockable quantity so omitted inspection data cannot be misclassified", () => {
    expect(() => buildCustomerReturnReceiptLines({
      [items[0].request_item_id]: { received_quantity: "1", restockable_quantity: "" },
    }, items)).toThrow(/حدد الكمية الصالحة/);
    expect(() => buildCustomerReturnReceiptLines({}, items)).toThrow(/أدخل كمية مستلمة/);
  });

  it("rejects malformed queue responses rather than guessing stock or tenant defaults", () => {
    expect(() => readCustomerReturnReceiptQueue(null)).toThrow(/قائمة استلام/);
    expect(() => readCustomerReturnReceiptQueue({ warehouses: [], requests: [{ id: "x", items: [{}] }] })).toThrow();
  });

  it("validates real server mutation response and replay marker", () => {
    expect(readReturnReceiptMutationResult({
      receipt_id: "receipt-1", receipt_number: "RETREC-20261020-ABCDEF12",
      request_status: "approved", received_line_count: 1, received_quantity: 1.25,
      restockable_quantity: 0.75, defective_quantity: 0.5, idempotent_replay: true,
    })).toEqual({
      receipt_id: "receipt-1", receipt_number: "RETREC-20261020-ABCDEF12",
      request_status: "approved", received_line_count: 1, received_quantity: 1.25,
      restockable_quantity: 0.75, defective_quantity: 0.5, idempotent_replay: true,
    });
    expect(() => readReturnReceiptMutationResult({ request_status: "fake" })).toThrow();
  });

  it("creates keys compatible with the server idempotency contract", () => {
    expect(createReturnReceiptIdempotencyKey()).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });
});
