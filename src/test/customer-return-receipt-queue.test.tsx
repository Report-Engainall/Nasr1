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
const persistedHistory = {
  receipts: [{
    receipt_id: receiptId,
    receipt_number: "RETREC-20261029-ABCDEF12",
    request_number: "RET-TEST-0001",
    order_number: "ORD-TEST-0001",
    customer_name: "اسم العميل من سجل الإيصال",
    warehouse_name: "مخزن الإيصال المحفوظ",
    received_at: "2026-10-29T17:05:00.000Z",
    received_line_count: 1,
    received_quantity: 1.25,
    restockable_quantity: 1,
    defective_quantity: 0.25,
  }],
  has_more: false,
  limit: 50,
  offset: 0,
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
    mocks.rpc.mockReset().mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "list_customer_return_receipt_print_history") return { data: { receipts: [], has_more: false, limit: 50, offset: Number(args?.p_offset ?? 0) }, error: null };
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

  it("clears a previous print document when the next receipt saved but its snapshot cannot be reconciled", async () => {
    const secondReceiptId = "66666666-6666-4666-8666-666666666666";
    let receiveCalls = 0;
    mocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "list_customer_return_receipt_print_history") return { data: { receipts: [], has_more: false, limit: 50, offset: Number(args?.p_offset ?? 0) }, error: null };
      if (name === "list_customer_return_receipt_queue") return { data: queue, error: null };
      if (name === "receive_customer_return") {
        receiveCalls += 1;
        return {
          data: {
            ...mutationResult,
            receipt_id: receiveCalls === 1 ? receiptId : secondReceiptId,
            receipt_number: receiveCalls === 1 ? mutationResult.receipt_number : "RETREC-20261029-SECOND123",
          },
          error: null,
        };
      }
      if (name === "get_customer_return_receipt_print_data") {
        return {
          data: args?.p_receipt_id === secondReceiptId
            ? { ...persistedPrintSnapshot, receipt_number: "MISMATCHED-OLD-PRINT-SNAPSHOT" }
            : persistedPrintSnapshot,
          error: null,
        };
      }
      return { data: null, error: { message: "unexpected RPC " + name } };
    });

    render(<CustomerReturnReceiptQueue onNotice={vi.fn()} />);
    await screen.findByText("اسم الصنف من قائمة الطلبات");
    fireEvent.change(screen.getByLabelText("الكمية المستلمة"), { target: { value: "1.25" } });
    fireEvent.change(screen.getByLabelText("الصالح للمخزون"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: /تسجيل الاستلام والفحص/ }));
    await screen.findByRole("button", { name: /طباعة الإيصال RETREC-20261029-ABCDEF12/ });

    fireEvent.change(screen.getByLabelText("الكمية المستلمة"), { target: { value: "0.5" } });
    fireEvent.change(screen.getByLabelText("الصالح للمخزون"), { target: { value: "0.25" } });
    fireEvent.click(screen.getByRole("button", { name: /تسجيل الاستلام والفحص/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("تم حفظ الاستلام RETREC-20261029-SECOND123");
    expect(screen.queryByRole("button", { name: /طباعة الإيصال/ })).not.toBeInTheDocument();
    expect(screen.queryByText("RETREC-20261029-ABCDEF12")).not.toBeInTheDocument();
  });

  it("loads a historical receipt snapshot from the server to reprint after the queue has changed", async () => {
    mocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "list_customer_return_receipt_queue") return { data: { warehouses: queue.warehouses, requests: [] }, error: null };
      if (name === "list_customer_return_receipt_print_history") return { data: persistedHistory, error: null };
      if (name === "get_customer_return_receipt_print_data") {
        expect(args).toEqual({ p_receipt_id: receiptId });
        return { data: persistedPrintSnapshot, error: null };
      }
      return { data: null, error: { message: "unexpected RPC " + name } };
    });
    const { container } = render(<CustomerReturnReceiptQueue onNotice={vi.fn()} />);
    await screen.findByRole("button", { name: /إعادة تجهيز الإيصال للطباعة RETREC-20261029-ABCDEF12/ });
    fireEvent.click(screen.getByRole("button", { name: /إعادة تجهيز الإيصال للطباعة RETREC-20261029-ABCDEF12/ }));
    await screen.findByRole("button", { name: /طباعة الإيصال RETREC-20261029-ABCDEF12/ });

    expect(mocks.rpc).toHaveBeenCalledWith("list_customer_return_receipt_print_history", { p_limit: 50, p_offset: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_return_receipt_print_data", { p_receipt_id: receiptId });
    const printable = container.querySelector<HTMLElement>(".return-receipt-print");
    expect(printable?.textContent).toContain("اسم العميل من سجل الإيصال");
    expect(printable?.textContent).toContain("مخزن الإيصال المحفوظ");
    expect(printable?.textContent).toContain("اسم الصنف من لقطة الإيصال المحفوظة");
    expect(printable?.innerHTML).not.toContain(receiptId);
  });

  it("pages through older saved receipts using the server offset and keeps page boundaries exact", async () => {
    const secondReceiptId = "66666666-6666-4666-8666-666666666666";
    const olderHistory = {
      receipts: [{ ...persistedHistory.receipts[0], receipt_id: secondReceiptId, receipt_number: "RETREC-20261028-OLDER0001" }],
      has_more: false,
      limit: 50,
      offset: 50,
    };
    mocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "list_customer_return_receipt_queue") return { data: { warehouses: queue.warehouses, requests: [] }, error: null };
      if (name === "list_customer_return_receipt_print_history") {
        if (args?.p_offset === 50) return { data: olderHistory, error: null };
        return { data: { ...persistedHistory, has_more: true }, error: null };
      }
      if (name === "get_customer_return_receipt_print_data") return { data: persistedPrintSnapshot, error: null };
      return { data: null, error: { message: "unexpected RPC " + name } };
    });
    render(<CustomerReturnReceiptQueue onNotice={vi.fn()} />);
    await screen.findByText("RETREC-20261029-ABCDEF12");
    expect(screen.getByRole("button", { name: /السجلات الأقدم/ })).toBeEnabled();
    expect(screen.getByText("RETREC-20261029-ABCDEF12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /السجلات الأقدم/ }));
    await screen.findByText("RETREC-20261028-OLDER0001");
    expect(mocks.rpc).toHaveBeenCalledWith("list_customer_return_receipt_print_history", { p_limit: 50, p_offset: 50 });
    expect(screen.queryByText("RETREC-20261029-ABCDEF12")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /السجلات الأحدث/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /السجلات الأقدم/ })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /السجلات الأحدث/ }));
    await screen.findByText("RETREC-20261029-ABCDEF12");
    expect(mocks.rpc).toHaveBeenCalledWith("list_customer_return_receipt_print_history", { p_limit: 50, p_offset: 0 });
  });

  it("does not render a print button or pretend the receipt snapshot loaded when persisted totals disagree", async () => {
    mocks.rpc.mockImplementation(async (name: string, args?: Record<string, unknown>) => {
      if (name === "list_customer_return_receipt_print_history") return { data: { receipts: [], has_more: false, limit: 50, offset: Number(args?.p_offset ?? 0) }, error: null };
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
