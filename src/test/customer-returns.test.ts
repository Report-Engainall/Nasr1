import { describe, expect, it } from "vitest";
import {
  buildCustomerReturnLines,
  createReturnIdempotencyKey,
  readCustomerReturnSummary,
  readReturnMutationResult,
  type ReturnableOrderItem,
} from "@/lib/customer-returns";

const items: ReturnableOrderItem[] = [
  {
    order_item_id: "11111111-1111-4111-8111-111111111111",
    item_code: "000125",
    product_name: "صنف تجريبي",
    unit: "كرتون",
    ordered_quantity: 5,
    already_requested_quantity: 1.5,
    remaining_quantity: 3.5,
  },
  {
    order_item_id: "22222222-2222-4222-8222-222222222222",
    item_code: "000126",
    product_name: "صنف آخر",
    unit: "حبة",
    ordered_quantity: 2,
    already_requested_quantity: 2,
    remaining_quantity: 0,
  },
];

describe("customer return payload validation", () => {
  it("builds only selected lines and preserves leading-zero item codes outside payload ids", () => {
    expect(buildCustomerReturnLines({
      [items[0].order_item_id]: "1.25",
      [items[1].order_item_id]: "",
      "unknown-line": "",
    }, items)).toEqual([{ order_item_id: items[0].order_item_id, quantity: 1.25 }]);
  });

  it("accepts quantities to three decimal places and exact remaining balance", () => {
    expect(buildCustomerReturnLines({ [items[0].order_item_id]: "3.5" }, items)[0].quantity).toBe(3.5);
    expect(buildCustomerReturnLines({ [items[0].order_item_id]: "0.001" }, items)[0].quantity).toBe(0.001);
  });

  it.each(["0", "-1", "NaN", "Infinity", "1.0001", "3.501"])(
    "rejects invalid or excessive quantity %s",
    (value) => expect(() => buildCustomerReturnLines({ [items[0].order_item_id]: value }, items)).toThrow(),
  );

  it("does not allow exhausted or unknown order lines", () => {
    expect(() => buildCustomerReturnLines({ [items[1].order_item_id]: "1" }, items)).toThrow(/لا توجد كمية متاحة/);
    expect(() => buildCustomerReturnLines({ "33333333-3333-4333-8333-333333333333": "1" }, items)).toThrow(/لا توجد كمية متاحة/);
  });

  it("requires at least one selected line and caps the request at 100 lines", () => {
    expect(() => buildCustomerReturnLines({}, items)).toThrow(/حدد صنفًا واحدًا/);
    const many = Array.from({ length: 101 }, (_, index) => ({
      order_item_id: String(index + 100).padStart(8,"0") + "-1111-4111-8111-111111111111",
      item_code: String(index),
      product_name: "Item " + index,
      unit: "ea",
      ordered_quantity: 1,
      already_requested_quantity: 0,
      remaining_quantity: 1,
    }));
    const drafts = Object.fromEntries(many.map((item) => [item.order_item_id,"1"]));
    expect(() => buildCustomerReturnLines(drafts,many)).toThrow(/أكثر من 100 صنف/);
  });

  it("parses the server summary and return-history payload", () => {
    expect(readCustomerReturnSummary({
      order_status: "delivered",
      requests: [{
        id: "request-1", request_number: "RET-20261020-ABC12345", status: "approved",
        reason: "damaged", notes: "damage", review_note: "verified", created_at: "2026-10-20T00:00:00Z",
        items: [{ order_item_id: items[0].order_item_id, item_code: "000125", product_name: "صنف تجريبي", unit: "كرتون", requested_quantity: "1.5" }],
      }],
      returnable_items: [{
        order_item_id: items[0].order_item_id, item_code: "000125", product_name: "صنف تجريبي", unit: "كرتون",
        ordered_quantity: "5", already_requested_quantity: "1.5", remaining_quantity: "3.5",
      }],
    })).toMatchObject({
      order_status: "delivered",
      requests: [{ status: "approved", reason: "damaged", items: [{ item_code: "000125", requested_quantity: 1.5 }] }],
      returnable_items: [{ ordered_quantity: 5, already_requested_quantity: 1.5, remaining_quantity: 3.5 }],
    });
  });

  it("rejects malformed server data rather than guessing defaults", () => {
    expect(() => readCustomerReturnSummary(null)).toThrow(/ملخص مرتجعات غير صالح/);
    expect(() => readCustomerReturnSummary({ order_status:"delivered",requests:[],returnable_items:[{}] })).toThrow();
    expect(() => readCustomerReturnSummary({
      order_status:"delivered", returnable_items:[],
      requests:[{id:"r",request_number:"RET-1",status:"untrusted",reason:"other",items:[],created_at:"now"}],
    })).toThrow(/غير معتمد/);
  });

  it("validates the server mutation result", () => {
    expect(readReturnMutationResult({
      request_id:"id-1",request_number:"RET-1",status:"submitted",idempotent_replay:true,
    })).toEqual({ request_id:"id-1",request_number:"RET-1",status:"submitted",idempotent_replay:true });
    expect(() => readReturnMutationResult({request_id:"id",request_number:"RET-1",status:"submitted"})).toThrow();
  });

  it("creates a non-empty idempotency key for safe retries", () => {
    const key = createReturnIdempotencyKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
  });
});
