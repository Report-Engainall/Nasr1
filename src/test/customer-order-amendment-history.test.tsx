import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { CustomerOrderAmendmentHistory } from "@/components/CustomerOrderAmendmentHistory";

const orderId = "20000000-0000-4000-8000-000000000001";
const itemId = "30000000-0000-4000-8000-000000000001";
const firstVersionId = "40000000-0000-4000-8000-000000000001";
const secondVersionId = "40000000-0000-4000-8000-000000000002";

function historyFixture() {
  return {
    order_id: orderId,
    order_number: "AGH-2026-001",
    order_status: "returned_for_adjustment",
    return_events: [{
      changed_at: "2026-11-06T06:50:00.000Z",
      changed_by: "مدير الإرجاع",
      reason: "سبب إعادة الطلب للتعديل: يرجى تقليل كمية السكر",
    }],
    amendments: [
      {
        amendment_id: firstVersionId,
        order_id: orderId,
        status: "rejected",
        note: "تعذر توفير الكمية كاملة",
        review_note: "يرجى تقليل الكمية أكثر",
        submitted_at: "2026-11-06T07:00:00.000Z",
        submitted_by: "عميل الاختبار",
        reviewed_at: "2026-11-06T07:10:00.000Z",
        reviewed_by: "مدير الاختبار",
        line_count: 1,
        lines: [{
          order_item_id: itemId,
          product_name: "سكر أبيض",
          item_code: "SKU-001",
          unit: "كيس",
          previous_quantity: 30,
          proposed_quantity: 24,
        }],
      },
      {
        amendment_id: secondVersionId,
        order_id: orderId,
        status: "pending_review",
        note: "تم تحديث الكمية",
        review_note: null,
        submitted_at: "2026-11-06T07:20:00.000Z",
        submitted_by: "عميل الاختبار",
        reviewed_at: null,
        reviewed_by: null,
        line_count: 1,
        lines: [{
          order_item_id: itemId,
          product_name: "سكر أبيض",
          item_code: "SKU-001",
          unit: "كيس",
          previous_quantity: 30,
          proposed_quantity: 18,
        }],
      },
    ],
  };
}

describe("customer order amendment history UI", () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: historyFixture(), error: null });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders each immutable version, line quantities, actors, decision and resubmitted state", async () => {
    render(<CustomerOrderAmendmentHistory orderId={orderId} />);
    expect(await screen.findByText("النسخة 1")).toBeInTheDocument();
    expect(screen.getByText("النسخة 2")).toBeInTheDocument();
    expect(screen.getAllByText(/أرسلها: عميل الاختبار/)).toHaveLength(2);
    expect(screen.getByText("مدير الإرجاع")).toBeInTheDocument();
    expect(screen.getByText(/يرجى تقليل كمية السكر/)).toBeInTheDocument();
    expect(screen.getByText("مدير الاختبار")).toBeInTheDocument();
    expect(screen.getAllByText("سكر أبيض")).toHaveLength(2);
    expect(screen.getByText("تم تحديث الكمية")).toBeInTheDocument();
    expect(screen.getByText("أُعيد تقديم التعديل إلى الإدارة — بانتظار المراجعة")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("list_customer_order_amendment_history", { p_order_id: orderId });
  });

  it("fails closed when the server returns an incomplete line snapshot", async () => {
    const payload = historyFixture();
    payload.amendments[1].line_count = 2;
    mocks.rpc.mockResolvedValue({ data: payload, error: null });
    render(<CustomerOrderAmendmentHistory orderId={orderId} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("سجل تعديل غير مكتمل");
    expect(screen.queryByText("النسخة 1")).not.toBeInTheDocument();
  });
});
