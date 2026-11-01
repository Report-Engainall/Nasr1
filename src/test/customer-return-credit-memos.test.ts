import { describe, expect, it } from "vitest";
import {
  createCreditMemoIdempotencyKey,
  readReturnCreditMemoMutation,
  readReturnCreditMemoReversalMutation,
  readReturnCreditMemoQueue,
  readPrintableReturnCreditMemo,
} from "@/lib/customer-return-credit-memos";

const CREDIT_MEMO_IDEMPOTENCY_UUID_V4 = new RegExp(
  "^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
  "i",
);

const queueFixture = () => ({
  accounts: [
    { id: "ar1", code: "AR-001", name: "ذمم العملاء", account_type: "asset" },
    { id: "sales-return1", code: "REV-RET", name: "مرتجعات المبيعات", account_type: "revenue" },
    { id: "tax1", code: "TAX-OUT", name: "التزام ضريبي", account_type: "liability" },
  ],
  requests: [{
    request_id: "request1",
    request_number: "RET-2026-001",
    order_id: "order1",
    order_number: "ORD-1001",
    customer_id: "customer1",
    customer_name: "عميل الاختبار",
    created_at: "2026-10-20T00:00:00.000Z",
    invoice_id: "invoice1",
    invoice_number: "INV-1001",
    currency: "YER",
    invoice_subtotal: 500,
    invoice_tax_amount: 0,
    invoice_total_amount: 500,
    invoice_status: "issued",
    invoice_totals_reconcile: true,
    mapping_ready: true,
    items: [{
      request_item_id: "request-line1",
      order_item_id: "order-line1",
      product_id: "product1",
      item_code: "000125",
      product_name: "صنف مرتجع",
      unit: "كرتون",
      requested_quantity: 1.25,
      received_quantity: 1.25,
      invoice_item_id: "invoice-line1",
      invoice_item_quantity: 5,
      invoice_item_line_total: 500,
      already_credited_quantity: 0,
      remaining_invoice_quantity: 5,
    }],
    credit_memo: null,
  }],
});

describe("return credit memo server contracts", () => {
  it("preserves source identifiers and leading-zero item codes in a valid queue", () => {
    const queue = readReturnCreditMemoQueue(queueFixture());
    expect(queue.accounts.map((a) => a.account_type)).toEqual(["asset", "revenue", "liability"]);
    expect(queue.requests[0].items[0].item_code).toBe("000125");
    expect(queue.requests[0].mapping_ready).toBe(true);
    expect(queue.requests[0].invoice_totals_reconcile).toBe(true);
  });

  it("rejects malformed queue envelopes instead of inventing accounting sources", () => {
    expect(() => readReturnCreditMemoQueue(null)).toThrow(/قائمة إشعارات/);
    expect(() => readReturnCreditMemoQueue({ accounts: [], requests: [{}] })).toThrow();
    const malformed = queueFixture();
    malformed.accounts[0].account_type = "expense";
    expect(() => readReturnCreditMemoQueue(malformed)).toThrow(/نوع الحساب/);
  });

  it("validates a source-linked draft mutation and its idempotent replay marker", () => {
    const result = readReturnCreditMemoMutation({
      credit_memo_id: "memo1",
      memo_number: "CRM-20261020-ABCD1234",
      status: "draft",
      journal_entry_id: "journal1",
      journal_entry_number: "88",
      journal_status: "draft",
      subtotal_amount: "125.00",
      tax_amount: "0.00",
      total_amount: "125.00",
      currency: "YER",
      replayed: false,
    });
    expect(result.total_amount).toBe(125);
    expect(result.replayed).toBe(false);
    expect(() => readReturnCreditMemoMutation({ ...result, status: "pending" })).toThrow(/حالة الإشعار/);
    expect(() => readReturnCreditMemoMutation({ ...result, replayed: "false" })).toThrow(/إعادة المحاولة/);
  });

  it("creates a UUID idempotency key suitable for the server accounting contract", () => {
    expect(createCreditMemoIdempotencyKey()).toMatch(CREDIT_MEMO_IDEMPOTENCY_UUID_V4);
  });
  it("validates the finance-scoped print payload and refuses inconsistent totals", () => {
    const valid = {
      memo:{id:"m1",memo_number:"CRM-001",status:"draft",currency:"YER",subtotal_amount:125,tax_amount:0,total_amount:125,created_at:"2026-10-20T00:00:00Z",posted_at:null},
      customer:{id:"c1",name:"عميل الطباعة",contact_name:null},
      invoice:{id:"i1",invoice_number:"INV-001",currency:"YER",issued_at:"2026-10-19T00:00:00Z",subtotal:500,tax_amount:0,total_amount:500,order_number:"ORD-001"},
      return_request:{id:"r1",request_number:"RET-001",status:"received",created_at:"2026-10-20T00:00:00Z"},
      journal:{id:"j1",entry_number:"51",status:"draft",entry_date:"2026-10-20"},
      lines:[{id:"l1",item_code:"000125",description:"صنف مرتجع",unit:"كرتون",returned_quantity:1.25,credited_subtotal:125,invoice_quantity:5,invoice_unit_price:100,invoice_line_total:500}],
    };
    expect(readPrintableReturnCreditMemo(valid).lines[0].item_code).toBe("000125");
    expect(() => readPrintableReturnCreditMemo({...valid,memo:{...valid.memo,total_amount:126}})).toThrow(/إجماليات/);
    expect(() => readPrintableReturnCreditMemo({...valid,journal:{...valid.journal,status:"posted"}})).toThrow(/حالة الإشعار/);
  });


  it("validates an authoritative posted reversal response and replay state", () => {
    const result = readReturnCreditMemoReversalMutation({
      credit_memo_id: "memo1",
      memo_number: "CRM-20261020-ABCD1234",
      status: "reversed",
      original_journal_entry_id: "original-journal",
      reversal_journal_entry_id: "reversal-journal",
      reversal_journal_entry_number: "89",
      reversal_status: "posted",
      reason: "مراجعة محاسبية مع سبب موثق",
      replayed: true,
    });
    expect(result.status).toBe("reversed");
    expect(result.reversal_status).toBe("posted");
    expect(result.reversal_journal_entry_number).toBe("89");
    expect(result.replayed).toBe(true);
    expect(() => readReturnCreditMemoReversalMutation({ ...result, reversal_status: "draft" })).toThrow(/لم يؤكد الخادم/);
    expect(() => readReturnCreditMemoReversalMutation({ ...result, reason: "" })).toThrow(/reason/);
    expect(() => readReturnCreditMemoReversalMutation({ ...result, replayed: "true" })).toThrow(/إعادة محاولة/);
  });

});
