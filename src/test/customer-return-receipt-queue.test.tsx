import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CustomerReturnReceiptQueue } from "@/components/CustomerReturnReceiptQueue";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

const receiptId = "44444444-4444-4444-8444-444444444444";
const itemId = "55555555-5555-4555-8555-555555555555";
const queue = {
  warehouses: [{ id: "warehouse-1", name: "مخزن القائمة", code: "WH-01" }],
  requests: [{
    id: "request-1",
    request_number: "RET-TEST-0001",
    order_number: "ORD-TEST-0001",
    customer_name: "عميل القائمة الحالي",
    created_at: "2026-10-29T17:00:00.000Z",
    items: [{
      request_item_id: itemId,
      product_id: "product-1",
      item_code: "000125",
      product_name: "اسم الصنف من قائمة الطلبات",
      unit: "كرتون",
      requested_quantity: 5,
      received_quantity: 0,
      remaining_quantity: 5,
    }],
  }],
};
const mutationResult = {
  receipt_id: receiptId,
  receipt_number: "RETREC-20261029-ABCDEF12",
  request_status: "approved",
  received_line_count: 1,
  received_quantity: 1.25,
  restockable_quantity: 1,
  defective_quantity: 0.25,
  idempotent_replay: false,
};
const persistedPrintSnapshot = {
  receipt_number: "RETREC-20261029-ABCDEF12",
  request_number: "RET-TEST-0001",
  order_number: "ORD-TEST-0001",
  customer_name: "اسم العميل من سجل الإيصال",
  warehouse_name: "مخزن الإيصال المحفوظ",
  received_at: "2026-10-29T17:05:00.000Z",
  notes: "ملاحظة محفوظة في قاعدة البيانات",
  received_line_count: 1,
  received_quantity: 1.25,
  restockable_quantity: 1,
  defective_quantity: 0.25,
  organization_id: "PRIVATE-ORG-UUID",
  warehouse_id: "PRIVATE-WAREHOUSE-UUID",
  receipt_id: receiptId,
  lines: [{
    item_code: "000125",
    product_name: "اسم الصنف من لقطة الإيصال المحفوظة",
    unit: "كرتون",
    received_quantity: 1.25,
    restockable_quantity: 1,
    defective_quantity: 0.25,
    request_item_id: itemId,
    product_id: "PRIVATE-PRODUCT-UUID",
    cost_price: "PRIVATE-COST",
    profit_margin: "PRIVATE-MARGIN",
  }],
};

describe("warehouse return receipt printing", () => {
  beforeEach(() => {
    let queueCalls = 0;
    mocks.rpc.mockReset().mockImplementation(async (name: string) => {
      if (name === "list_customer_return_receipt_queue") {
        queueCalls += 1;
        return { data: queueCalls === 1 ? queue : { warehouses: queue.warehouses, requests: [] }, error: null };
      }
      if (name === "receive_customer_return") return { data: mutationResult, error: null };
      if (name === "get_customer_return_receipt_print_data") return { data: persistedPrintSnapshot, error: null };
      return { data: null, error: { message: "unexpected RPC " + name } };
    });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("uses only the server-persisted receipt snapshot for the printable document", async () => {
    const onNotice = vi.fn();
    const { container } = render(<CustomerReturnReceiptQueue onNotice={onNotice} />);
    await screen.findByText("اسم الصنف من قائمة الطلبات");

    fireEvent.change(screen.getByLabelText("الكمية المستلمة"), { target: { value: "1.25" } });
    fireEvent.change(screen.getByLabelText("الصالح للمخزون"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /تسجيل الاستلام والفحص/ }));

    await screen.findByRole("button", { name: /طباعة الإيصال RETREC-20261029-ABCDEF12/ });
    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_return_receipt_print_data", { p_receipt_id: receiptId });

    const printable = container.querySelector<HTMLElement>(".return-receipt-print");
    expect(printable).not.toBeNull();
    expect(printable?.textContent).toContain("اسم العميل من سجل الإيصال");
    expect(printable?.textContent).toContain("مخزن الإيصال المحفوظ");
    expect(printable?.textContent).toContain("ملاحظة محفوظة في قاعدة البيانات");
    expect(printable?.textContent).toContain("اسم الصنف من لقطة الإيصال المحفوظة");
    expect(printable?.textContent).not.toContain("اسم الصنف من قائمة الطلبات");
    for (const privateValue of [
      "PRIVATE-ORG-UUID", "PRIVATE-WAREHOUSE-UUID", "PRIVATE-PRODUCT-UUID",
      "PRIVATE-COST", "PRIVATE-MARGIN", receiptId, itemId,
    ]) expect(printable?.innerHTML).not.toContain(privateValue);
    expect(printable?.textContent).toContain("000125");
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("RETREC-20261029-ABCDEF12"));
  });

  it("does not render a print button or pretend the receipt snapshot loaded when persisted totals disagree", async () => {
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "list_customer_return_receipt_queue") return { data: queue, error: null };
      if (name === "receive_customer_return") return { data: mutationResult, error: null };
      if (name === "get_customer_return_receipt_print_data") {
        return {
          data: { ...persistedPrintSnapshot, received_quantity: 9 },
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected RPC " + name } };
    });
    const onNotice = vi.fn();
    render(<CustomerReturnReceiptQueue onNotice={onNotice} />);
    await screen.findByText("اسم الصنف من قائمة الطلبات");
    fireEvent.change(screen.getByLabelText("الكمية المستلمة"), { target: { value: "1.25" } });
    fireEvent.change(screen.getByLabelText("الصالح للمخزون"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /تسجيل الاستلام والفحص/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تم حفظ الاستلام RETREC-20261029-ABCDEF12");
    expect(screen.queryByRole("button", { name: /طباعة الإيصال/ })).not.toBeInTheDocument();
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("أعد المحاولة بالمفتاح نفسه"));
  });
});
