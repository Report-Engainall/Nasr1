import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createOrder, fetchAdminProductOptions } from "@/lib/api";
import { fetchStaffOrderCustomerOptions } from "@/lib/customer-directory";
import { AdminOrderCreationDialog } from "./AdminOrderCreationDialog";

vi.mock("@/lib/api", () => ({
  createOrder: vi.fn(),
  fetchAdminProductOptions: vi.fn(),
}));

vi.mock("@/lib/customer-directory", () => ({
  fetchStaffOrderCustomerOptions: vi.fn(),
}));

const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

const createOrderMock = vi.mocked(createOrder);
const fetchProductsMock = vi.mocked(fetchAdminProductOptions);
const fetchCustomersMock = vi.mocked(fetchStaffOrderCustomerOptions);

function renderDialog() {
  const onClose = vi.fn();
  const onCreated = vi.fn().mockResolvedValue(undefined);
  const onNotice = vi.fn();
  render(<AdminOrderCreationDialog onClose={onClose} onCreated={onCreated} onNotice={onNotice} />);
  return { onClose, onCreated, onNotice };
}

async function prepareOrderDraft() {
  await screen.findByRole("option", { name: /مؤسسة الأمانة/ });
  fireEvent.change(screen.getByLabelText("اختر العميل"), { target: { value: CUSTOMER_ID } });
  await screen.findByRole("option", { name: /أرز بسمتي/ });
  fireEvent.change(screen.getByLabelText("الصنف النشط"), { target: { value: PRODUCT_ID } });
  fireEvent.change(screen.getByLabelText("الكمية"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: /إضافة الصنف/ }));
  fireEvent.change(screen.getByLabelText("طريقة السداد"), { target: { value: "credit" } });
  fireEvent.change(screen.getByLabelText("ملاحظات الطلب"), { target: { value: "تسليم صباحي" } });
}

describe("AdminOrderCreationDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchCustomersMock.mockResolvedValue({
      rows: [{
        id: CUSTOMER_ID,
        business_name: "مؤسسة الأمانة",
        customer_code: "C-100",
        tier: "vip",
      }],
      hasNextPage: false,
    });
    fetchProductsMock.mockResolvedValue({
      rows: [{ id: PRODUCT_ID, name: "أرز بسمتي", item_code: "000125" }],
      page: 1,
      pageSize: 40,
      hasNextPage: false,
    });
    createOrderMock.mockResolvedValue({} as Awaited<ReturnType<typeof createOrder>>);
  });

  it("rejects fractional quantities and submits only IDs, quantities, terms and a server idempotency key", async () => {
    const { onClose, onCreated, onNotice } = renderDialog();
    await screen.findByRole("option", { name: /مؤسسة الأمانة/ });
    fireEvent.change(screen.getByLabelText("اختر العميل"), { target: { value: CUSTOMER_ID } });
    await screen.findByRole("option", { name: /أرز بسمتي/ });
    fireEvent.change(screen.getByLabelText("الصنف النشط"), { target: { value: PRODUCT_ID } });

    fireEvent.change(screen.getByLabelText("الكمية"), { target: { value: "1.5" } });
    fireEvent.click(screen.getByRole("button", { name: /إضافة الصنف/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("عدداً صحيحاً");
    expect(screen.queryByText("أرز بسمتي")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("الكمية"), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /إضافة الصنف/ }));
    fireEvent.change(screen.getByLabelText("طريقة السداد"), { target: { value: "credit" } });
    fireEvent.change(screen.getByLabelText("ملاحظات الطلب"), { target: { value: "تسليم صباحي" } });
    fireEvent.click(screen.getByRole("button", { name: /إنشاء الطلب/ }));

    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(1));
    const payload = createOrderMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      customer_id: CUSTOMER_ID,
      items: [{ product_id: PRODUCT_ID, quantity: 2 }],
      notes: "تسليم صباحي",
      payment_terms: "credit",
    });
    expect(payload.idempotency_key).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(JSON.stringify(payload)).not.toMatch(/price|cost|credit_limit|current_balance/i);
    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    expect(onNotice).toHaveBeenCalledWith(expect.stringContaining("الأسعار تُحسب وتُثبت من الخادم"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("reuses the idempotency key after ambiguous failures and creates a new key only after draft edits", async () => {
    const { onClose } = renderDialog();
    createOrderMock
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof createOrder>>);

    await prepareOrderDraft();
    const submit = () => fireEvent.click(screen.getByRole("button", { name: /إنشاء الطلب/ }));

    submit();
    await screen.findByText("network timeout");
    const firstKey = createOrderMock.mock.calls[0][0].idempotency_key;

    submit();
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(2));
    expect(createOrderMock.mock.calls[1][0].idempotency_key).toBe(firstKey);

    fireEvent.change(screen.getByLabelText("ملاحظات الطلب"), { target: { value: "تسليم بعد الظهر" } });
    submit();
    await waitFor(() => expect(createOrderMock).toHaveBeenCalledTimes(3));
    expect(createOrderMock.mock.calls[2][0].idempotency_key).not.toBe(firstKey);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
