import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_RETURN_REVIEW_EXPORT_MAX,
  fetchAllCustomerReturnReviewRows,
  fetchCustomerReturnReviewPage,
  readCustomerReturnReviewPage,
} from "./customer-return-review-queue";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const row = (index: number, createdAt = "2026-11-17T00:00:00.000Z") => ({
  id: "00000000-0000-4000-8000-" + String(index).padStart(12, "0"),
  request_number: "RET-" + index,
  status: "submitted",
  reason: "damaged",
  notes: null,
  created_at: createdAt,
  order_id: "10000000-0000-4000-8000-000000000001",
  order_number: "ORD-" + index,
  customer_name: "عميل " + index,
  customer_code: "C-" + index,
  items: [{
    item_code: "P-" + index,
    product_name: "صنف " + index,
    unit: "قطعة",
    requested_quantity: 2.125,
  }],
});

const page = (items: ReturnType<typeof row>[], hasMore: boolean, totalCount: number) => ({
  items,
  total_count: totalCount,
  page_size: 100,
  has_more: hasMore,
  next_cursor: hasMore && items.length
    ? { created_at: items[items.length - 1].created_at, id: items[items.length - 1].id }
    : null,
});

describe("customer return review queue pagination", () => {
  beforeEach(() => rpc.mockReset());

  it("accepts a correctly ordered page and verifies its continuation cursor", () => {
    const result = readCustomerReturnReviewPage(page([row(1), row(2)], true, 3));
    expect(result).toMatchObject({
      totalCount: 3,
      pageSize: 100,
      hasMore: true,
      nextCursor: { id: row(2).id },
      items: [{ request_number: "RET-1" }, { request_number: "RET-2" }],
    });
  });

  it("rejects a cursor that does not identify the last visible row", () => {
    const malformed = page([row(1), row(2)], true, 3);
    malformed.next_cursor = { created_at: row(1).created_at, id: row(1).id };
    expect(() => readCustomerReturnReviewPage(malformed)).toThrow("لم يتطابق مؤشر الصفحة التالية");
  });

  it("rejects duplicate IDs and non-deterministic ordering", () => {
    expect(() => readCustomerReturnReviewPage(page([row(1), row(1)], false, 2))).toThrow("تكرر طلب مرتجع");
    expect(() => readCustomerReturnReviewPage(page([row(2), row(1)], false, 2))).toThrow("ترتيب صفحة المرتجعات");
  });

  it("passes server-side search and status filters to the page reader", async () => {
    rpc.mockResolvedValue({ data: page([row(1)], false, 1), error: null });
    await fetchCustomerReturnReviewPage({ search: "  RET-1  ", status: "submitted" }, null);
    expect(rpc).toHaveBeenCalledWith("list_customer_return_review_queue_page", {
      p_limit: 50,
      p_after_created_at: null,
      p_after_id: null,
      p_search: "RET-1",
      p_status: "submitted",
    });
  });

  it("loads every filtered page for export and rejects a changing snapshot", async () => {
    const first = Array.from({ length: 100 }, (_, index) => row(index + 1));
    const second = [row(101, "2026-11-17T00:01:00.000Z")];
    rpc.mockResolvedValueOnce({ data: page(first, true, 101), error: null })
      .mockResolvedValueOnce({ data: page(second, false, 101), error: null });
    const rows = await fetchAllCustomerReturnReviewRows({ search: "ORD", status: "under_review" });
    expect(rows).toHaveLength(101);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_limit: 100, p_search: "ORD", p_status: "under_review" });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_after_id: row(100).id });

    rpc.mockReset();
    rpc.mockResolvedValueOnce({ data: page(first, true, 101), error: null })
      .mockResolvedValueOnce({ data: page(second, false, 102), error: null });
    await expect(fetchAllCustomerReturnReviewRows({ search: "", status: "" })).rejects.toThrow("تغير عدد طلبات المراجعة");
  });

  it("stops instead of exporting partial results or exceeding the safe cap", async () => {
    const tooMany = page([row(1)], true, CUSTOMER_RETURN_REVIEW_EXPORT_MAX + 1);
    rpc.mockResolvedValue({ data: tooMany, error: null });
    await expect(fetchAllCustomerReturnReviewRows({ search: "", status: "" })).rejects.toThrow("لم يُنشأ ملف جزئي");
  });
});
