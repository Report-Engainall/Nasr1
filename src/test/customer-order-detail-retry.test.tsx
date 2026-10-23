import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  user: { name: "Buyer", isStaff: false },
  orderFailuresRemaining: 1,
  orderItems: [] as Array<{ product_id: string | null; quantity: number; approved_quantity: number | null; requested_quantity: number }>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user, ready: true }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
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
    if (table === "order_items") return { data: mocks.orderItems, error: null };
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
    mocks.orderItems = [];
    mocks.rpc.mockReset();
    mocks.rpc.mockResolvedValue({ data: null, error: null });
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
  it("saves a source-linked reorder template using product IDs and approved quantities only", async () => {
    const productId = "33333333-3333-4333-8333-333333333333";
    const templateId = "44444444-4444-4444-8444-444444444444";
    mocks.orderFailuresRemaining = 0;
    mocks.orderItems = [{
      product_id: productId,
      quantity: 5,
      requested_quantity: 5,
      approved_quantity: 3,
    }];
    mocks.rpc.mockResolvedValueOnce({ data: templateId, error: null });

    await act(async () => {
      root?.render(<OrderInvoice id={ORDER_ID} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const saveButton = host?.querySelector<HTMLButtonElement>('button[aria-label="حفظ كقالب إعادة الطلب"]');
    expect(saveButton).not.toBeNull();
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).toHaveBeenCalledWith("save_reorder_template", {
      p_name: "إعادة طلب ORD-RETRY-001",
      p_lines: [{ product_id: productId, quantity: 3 }],
      p_source_order_id: ORDER_ID,
    });
    expect(host?.textContent).toContain("تم حفظ قالب مرتبط بالطلب ORD-RETRY-001");
    expect(host?.textContent).toContain("فتح مساحة إعادة الطلب");
    expect(host?.querySelector<HTMLButtonElement>('button[aria-label="حفظ كقالب إعادة الطلب"]')?.disabled).toBe(true);
  });

  it("does not call the server when an order line lacks a valid product identity", async () => {
    mocks.orderFailuresRemaining = 0;
    mocks.orderItems = [{
      product_id: null,
      quantity: 2,
      requested_quantity: 2,
      approved_quantity: 2,
    }];

    await act(async () => {
      root?.render(<OrderInvoice id={ORDER_ID} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const saveButton = host?.querySelector<HTMLButtonElement>('button[aria-label="حفظ كقالب إعادة الطلب"]');
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("أحد الأصناف لم يعد مرتبطًا بمنتج صالح");
  });

  it("shows a truthful failure and allows retry when the reorder template RPC rejects the request", async () => {
    const productId = "33333333-3333-4333-8333-333333333333";
    mocks.orderFailuresRemaining = 0;
    mocks.orderItems = [{
      product_id: productId,
      quantity: 2,
      requested_quantity: 2,
      approved_quantity: 2,
    }];
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("permission denied") });

    await act(async () => {
      root?.render(<OrderInvoice id={ORDER_ID} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const saveButton = host?.querySelector<HTMLButtonElement>('button[aria-label="حفظ كقالب إعادة الطلب"]');
    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain("تعذر حفظ قالب إعادة الطلب");
    expect(host?.textContent).not.toContain("تم حفظ قالب مرتبط بالطلب");
    expect(host?.querySelector<HTMLButtonElement>('button[aria-label="حفظ كقالب إعادة الطلب"]')?.disabled).toBe(false);
  });

});
