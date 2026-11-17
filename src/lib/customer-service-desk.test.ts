import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("./supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  CUSTOMER_SERVICE_DESK_REPORT_MAX_CASES,
  fetchAllCustomerServiceDeskCases,
  type CustomerServiceDeskFilters,
} from "./customer-service-desk";

const filters: CustomerServiceDeskFilters = {
  status: "active",
  priority: "all",
  assignment: "all",
  overdueOnly: false,
  search: "",
};
const summary = {
  open_count: 12,
  response_overdue_count: 2,
  resolution_overdue_count: 1,
  unassigned_count: 3,
  urgent_count: 2,
  high_count: 4,
};

function row(id: string, createdAt: string) {
  return {
    case_id: id,
    customer_id: "a1000000-0000-4000-8000-000000000099",
    customer_name: "عميل اختبار",
    customer_code: "C-001",
    case_code: "CS-" + id.slice(-3),
    case_type: "complaint",
    subject: "تأخر تسليم",
    description: "تفاصيل الحالة",
    priority: "high",
    status: "open",
    created_at: createdAt,
    updated_at: createdAt,
    response_due_at: "2026-11-15T10:00:00.000Z",
    resolution_due_at: "2026-11-15T11:00:00.000Z",
    first_response_at: null,
    escalated_at: null,
    escalation_level: 0,
    created_by_name: "موظف",
    task_id: null,
    assigned_to_id: null,
    assigned_to_name: "غير مسند",
    task_due_at: null,
  };
}

function page(input: {
  items: ReturnType<typeof row>[];
  hasMore: boolean;
  nextCursor?: { id: string; created_at: string } | null;
  summary?: typeof summary;
}) {
  return {
    data: {
      items: input.items,
      has_more: input.hasMore,
      next_cursor: input.nextCursor === undefined ? null : input.nextCursor,
      summary: input.summary ?? summary,
    },
    error: null,
  };
}

describe("complete customer service desk report loading", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("loads every keyset page and returns one complete ordered dataset", async () => {
    const first = row("a1000000-0000-4000-8000-000000000001", "2026-11-15T09:00:00.000Z");
    const second = row("a1000000-0000-4000-8000-000000000002", "2026-11-15T08:00:00.000Z");
    const third = row("a1000000-0000-4000-8000-000000000003", "2026-11-15T07:00:00.000Z");
    mocks.rpc
      .mockResolvedValueOnce(page({
        items: [first, second],
        hasMore: true,
        nextCursor: { id: second.case_id, created_at: second.created_at },
      }))
      .mockResolvedValueOnce(page({ items: [third], hasMore: false }));

    const result = await fetchAllCustomerServiceDeskCases({ filters, limit: 2 });

    expect(result.items.map((item) => item.case_id)).toEqual([
      first.case_id, second.case_id, third.case_id,
    ]);
    expect(result.summary).toEqual(summary);
    expect(result.hasMore).toBe(false);
    expect(result.nextCursor).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "get_customer_service_work_queue", expect.objectContaining({
      p_after_created_at: null,
      p_after_id: null,
      p_limit: 2,
    }));
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "get_customer_service_work_queue", expect.objectContaining({
      p_after_created_at: second.created_at,
      p_after_id: second.case_id,
      p_limit: 2,
    }));
  });

  it("rejects a short page that claims more results instead of exporting a truncated report", async () => {
    const first = row("a1000000-0000-4000-8000-000000000001", "2026-11-15T09:00:00.000Z");
    mocks.rpc.mockResolvedValueOnce(page({
      items: [first],
      hasMore: true,
      nextCursor: { id: first.case_id, created_at: first.created_at },
    }));

    await expect(fetchAllCustomerServiceDeskCases({ filters, limit: 2 }))
      .rejects.toThrow(/صفحة غير مكتملة/);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate case identities across pages instead of silently deduplicating them", async () => {
    const first = row("a1000000-0000-4000-8000-000000000001", "2026-11-15T09:00:00.000Z");
    mocks.rpc
      .mockResolvedValueOnce(page({
        items: [first],
        hasMore: true,
        nextCursor: { id: first.case_id, created_at: first.created_at },
      }))
      .mockResolvedValueOnce(page({ items: [first], hasMore: false }));

    await expect(fetchAllCustomerServiceDeskCases({ filters, limit: 1 }))
      .rejects.toThrow(/تكررت حالة بين صفحات التقرير/);
  });

  it("fails closed when the result exceeds the configured safe report cap", async () => {
    const first = row("a1000000-0000-4000-8000-000000000001", "2026-11-15T09:00:00.000Z");
    const second = row("a1000000-0000-4000-8000-000000000002", "2026-11-15T08:00:00.000Z");
    mocks.rpc
      .mockResolvedValueOnce(page({
        items: [first],
        hasMore: true,
        nextCursor: { id: first.case_id, created_at: first.created_at },
      }))
      .mockResolvedValueOnce(page({ items: [second], hasMore: false }));

    await expect(fetchAllCustomerServiceDeskCases({ filters, limit: 1, maxCases: 1 }))
      .rejects.toThrow(/يتجاوز التقرير الحد الآمن/);
  });

  it("rejects invalid caps before making an RPC request", async () => {
    await expect(fetchAllCustomerServiceDeskCases({
      filters,
      maxCases: CUSTOMER_SERVICE_DESK_REPORT_MAX_CASES + 1,
    })).rejects.toThrow(/حد الحالات المسموح/);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
