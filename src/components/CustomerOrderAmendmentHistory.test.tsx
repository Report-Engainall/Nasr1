// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { CustomerOrderAmendmentHistory } from "./CustomerOrderAmendmentHistory";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function history(orderId: string, reason: string) {
  return {
    order_id: orderId,
    order_status: "returned_for_adjustment",
    amendments: [],
    return_events: [{
      changed_at: "2026-11-27T00:00:00.000Z",
      changed_by: "مدير النظام",
      reason,
    }],
  };
}

beforeEach(() => mocks.rpc.mockReset());
afterEach(() => cleanup());

describe("CustomerOrderAmendmentHistory asynchronous reads", () => {
  it("ignores a late response from the previous order after the panel switches orders", async () => {
    const stale = deferred<{ data: unknown; error: null }>();
    const current = deferred<{ data: unknown; error: null }>();
    mocks.rpc.mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);

    const view = render(<CustomerOrderAmendmentHistory orderId="order-a" />);
    view.rerender(<CustomerOrderAmendmentHistory orderId="order-b" />);

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    expect(mocks.rpc).toHaveBeenLastCalledWith("list_customer_order_amendment_history", {
      p_order_id: "order-b",
    });

    await act(async () => {
      current.resolve({ data: history("order-b", "سبب الطلب الحالي"), error: null });
      await current.promise;
    });
    expect(await screen.findByText("سبب الطلب الحالي")).toBeInTheDocument();

    await act(async () => {
      stale.resolve({ data: history("order-a", "سبب الطلب السابق"), error: null });
      await stale.promise;
    });

    expect(screen.getByText("سبب الطلب الحالي")).toBeInTheDocument();
    expect(screen.queryByText("سبب الطلب السابق")).not.toBeInTheDocument();
  });

  it("releases loading and exposes a safe retry after an unexpected RPC rejection", async () => {
    mocks.rpc
      .mockRejectedValueOnce(new Error("private transport detail"))
      .mockResolvedValueOnce({ data: {
        order_id: "order-retry",
        order_status: "pending",
        amendments: [],
        return_events: [],
      }, error: null });

    render(<CustomerOrderAmendmentHistory orderId="order-retry" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "تعذر تحميل سجل نسخ التعديل من الخادم.",
    );
    expect(screen.queryByText("private transport detail")).not.toBeInTheDocument();
    expect(screen.queryByText("جارٍ تحميل سجل النسخ...")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/لا توجد أحداث إرجاع أو نسخ تعديل مسجلة/)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
