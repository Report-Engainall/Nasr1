import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  user: { name: "Buyer", isStaff: false },
  orderFailuresRemaining: 1,
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

import { OrderInvoice } from "@/components/CustomerOrders";

const ORDER_ID = "11111111-1111-4111-8111-111111111111";

function makeQuery(table: string) {
  const responseFor = () => {
    if (table === "orders") {
      if (mocks.orderFailuresRemaining > 0) {
        mocks.orderFailuresRemaining -= 1;
        return { data: null, error: new Error("temporary database failure") };
      }
      return {
        data: {
          id: ORDER_ID,
          order_number: "ORD-RETRY-001",
          customer_id: "22222222-2222-4222-8222-222222222222",
          status: "pending",
          total_items: 0,
          notes: null,
          created_at: "2026-10-23T00:00:00.000Z",
          quantity_review_required: false,
          customer_adjustment_note: null,
          customer_payment_requested_at: null,
          customer_confirmed_at: null,
          payment_request_status: "none",
          delivery_address_snapshot: null,
        },
        error: null,
      };
    }
    if (table === "customers") {
      return {
        data: { customer_code: "C-001", business_name: "شركة الاختبار", contact_name: null },
        error: null,
      };
    }
    return { data: [], error: null };
  };

  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    maybeSingle: () => Promise.resolve(responseFor()),
    then<TResult1 = { data: unknown; error: Error | null }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: Error | null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
      return Promise.resolve(responseFor()).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  };
  return query;
}

describe("customer order detail retry", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    mocks.orderFailuresRemaining = 1;
    mocks.from.mockReset();
    mocks.from.mockImplementation((table: string) => makeQuery(table));
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

  it("shows an accessible retry on a transient load failure and recovers from the server response", async () => {
    await act(async () => {
      root?.render(<OrderInvoice id={ORDER_ID} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).toContain("تعذر تحميل الطلب");
    const retry = host?.querySelector<HTMLButtonElement>('button[aria-label="إعادة تحميل تفاصيل الطلب"]');
    expect(retry).not.toBeNull();

    await act(async () => {
      retry?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.textContent).toContain("ORD-RETRY-001");
    expect(host?.textContent).not.toContain("تعذر تحميل الطلب");
    expect(mocks.from).toHaveBeenCalledWith("orders");
    expect(mocks.from).toHaveBeenCalledWith("order_items");
    expect(mocks.from).toHaveBeenCalledWith("order_status_history");
  });
});
