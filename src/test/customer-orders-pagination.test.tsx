import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  user: { name: "Buyer", isStaff: false },
  count: 30 as number | null,
  rows: [] as Array<Record<string, unknown>>,
  ranges: [] as Array<[number, number]>,
  filters: [] as Array<{ column: string; value: unknown }>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user, ready: true }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: unknown; children: unknown; [key: string]: unknown }) =>
    <a href={typeof to === "string" ? to : "/"} {...rest}>{children as React.ReactNode}</a>,
}));

vi.mock("@/components/CustomerReturnRequest", () => ({
  CustomerReturnRequest: () => null,
}));

import { MyOrders } from "@/components/CustomerOrders";

function makeQuery() {
  let range: [number, number] = [0, 24];
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn((column: string, value: unknown) => { mocks.filters.push({ column, value }); return query; }),
    order: vi.fn(() => query),
    range: vi.fn((start: number, end: number) => {
      range = [start, end];
      mocks.ranges.push(range);
      return query;
    }),
    then<TResult1 = { data: unknown[]; error: Error | null; count: number | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown[]; error: Error | null; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      const value = { data: mocks.rows.slice(range[0], range[1] + 1), error: null, count: mocks.count };
      return Promise.resolve(value).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };
  return query;
}

describe("customer order history pagination", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    mocks.count = 30;
    mocks.ranges = [];
    mocks.filters = [];
    mocks.rows = Array.from({ length: 30 }, (_, index) => ({
      id: `order-${index + 1}`,
      order_number: `ORDER-${String(index + 1).padStart(3, "0")}`,
      status: "pending",
      total_items: 1,
      created_at: "2026-10-23T00:00:00.000Z",
      quantity_review_required: false,
      customer_adjustment_note: null,
      customer_payment_requested_at: null,
      payment_request_status: "none",
    }));
    mocks.from.mockReset();
    mocks.from.mockImplementation((table: string) => {
      expect(table).toBe("orders");
      return makeQuery();
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  it("loads a bounded page and navigates with the exact server count", async () => {
    await act(async () => {
      root?.render(<MyOrders />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.ranges[0]).toEqual([0, 24]);
    expect(host?.textContent).toContain("ORDER-001");
    expect(host?.textContent).toContain("ORDER-025");
    expect(host?.textContent).not.toContain("ORDER-026");
    expect(host?.textContent).toContain("صفحة 1 من 2");
    const next = host?.querySelector<HTMLButtonElement>('button[aria-label="صفحة الطلبات التالية"]');
    expect(next?.disabled).toBe(false);

    await act(async () => {
      next?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.ranges.at(-1)).toEqual([25, 49]);
    expect(host?.textContent).toContain("ORDER-026");
    expect(host?.textContent).toContain("ORDER-030");
    expect(host?.textContent).not.toContain("ORDER-001");
    expect(host?.textContent).toContain("صفحة 2 من 2");

    const previous = host?.querySelector<HTMLButtonElement>('button[aria-label="صفحة الطلبات السابقة"]');
    await act(async () => {
      previous?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(mocks.ranges.at(-1)).toEqual([0, 24]);
  });

  it("filters by status on the server, resets pagination, and reports the filtered result count", async () => {
    await act(async () => {
      root?.render(<MyOrders />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host?.textContent).toContain("صفحة 1 من 2");

    mocks.rows = Array.from({ length: 5 }, (_, index) => ({
      id: `delivered-${index + 1}`,
      order_number: `DELIVERED-${index + 1}`,
      status: "delivered",
      total_items: 1,
      created_at: "2026-10-23T00:00:00.000Z",
      quantity_review_required: false,
      customer_adjustment_note: null,
      customer_payment_requested_at: null,
      payment_request_status: "none",
    }));
    mocks.count = 5;
    const filter = host?.querySelector<HTMLSelectElement>("#customer-orders-status-filter");
    expect(filter).not.toBeNull();

    await act(async () => {
      if (filter) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
        setter?.call(filter, "delivered");
        filter.dispatchEvent(new Event("change", { bubbles: true }));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.filters).toContainEqual({ column: "status", value: "delivered" });
    expect(mocks.ranges.at(-1)).toEqual([0, 24]);
    expect(host?.textContent).toContain("DELIVERED-1");
    expect(host?.textContent).toContain("إجمالي النتائج: 5");
    expect(host?.textContent).not.toContain("ORDER-001");
    expect(host?.textContent).not.toContain("صفحة 1 من 2");
  });

  it("fails closed instead of presenting an unknown count as zero", async () => {
    mocks.count = null;
    await act(async () => {
      root?.render(<MyOrders />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).toContain("تعذر تأكيد إجمالي الطلبات");
    expect(host?.textContent).not.toContain("لا توجد طلبات بعد");
  });
});
