import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/lib/supabase", () => ({
  supabase: { rpc: rpcMock },
  getCurrentTenantScope: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: {
      id: "auth-user-accountant",
      profileId: "profile-accountant",
      email: "accountant@example.test",
      name: "محاسب اختبار",
      roles: ["accountant"],
      isStaff: true,
    },
    ready: true,
    loading: false,
  }),
}));

import { StaffFinancePage } from "./CustomerWorkflows";

const INVOICE_ID = "11111111-1111-4111-8111-111111111111";
const FINANCE_DATA = {
  invoices: [
    {
      id: INVOICE_ID,
      invoice_number: "INV-2026-001",
      order_id: "22222222-2222-4222-8222-222222222222",
      customer_id: "33333333-3333-4333-8333-333333333333",
      status: "partially_paid",
      issued_at: "2026-10-15T09:00:00.000Z",
      due_at: "2026-10-30T00:00:00.000Z",
      currency: "YER",
      subtotal: "100.00",
      tax_amount: "0.00",
      total_amount: "100.00",
      paid_amount: "25.00",
      credit_memo_amount: "25.00",
      outstanding_amount: "50.00",
    },
  ],
  payments: [
    {
      invoice_id: INVOICE_ID,
      amount: "25.00",
      paid_at: "2026-10-15T09:30:00.000Z",
      payment_method: "cash",
    },
  ],
};

let container: HTMLDivElement;
let root: Root;

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("Native form value setter is unavailable");
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renderFinancePage() {
  await act(async () => {
    root.render(<StaffFinancePage />);
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function submitPayment(amount: string) {
  const invoiceSelect = Array.from(container.querySelectorAll("select")).find((select) =>
    Array.from(select.options).some((option) => option.value === INVOICE_ID),
  );
  const form = invoiceSelect?.closest("form");
  const amountInput = form?.querySelector<HTMLInputElement>('input[type="number"]');
  if (!invoiceSelect || !amountInput || !form) {
    throw new Error("Finance payment form did not render");
  }

  await act(async () => {
    setNativeValue(invoiceSelect, INVOICE_ID);
    setNativeValue(amountInput, amount);
    form.requestSubmit();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("StaffFinancePage payment amount guard", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    rpcMock.mockReset();
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "fetch_staff_finance_data") {
        return { data: FINANCE_DATA, error: null };
      }
      if (name === "record_customer_payment") {
        return { data: { success: true }, error: null };
      }
      if (name === "fetch_staff_receivables_aging") {
        return {
          data: { as_of_utc: "2026-10-20T00:00:00.000Z", total_open_invoices: 1, summary: [], items: [], has_more: false, limit: 50, offset: 0 },
          error: null,
        };
      }
      if (name === "get_finance_document_print_options") {
        return {
          data: { organization_name: "شركة الاختبار", customers: [], customers_has_more: false, invoices: [], invoices_has_more: false, credit_memos: [], credit_memos_has_more: false, limit: 100 },
          error: null,
        };
      }
      return { data: null, error: { message: "Unexpected RPC in test" } };
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.unstubAllGlobals();
  });

  it("uses the server-computed balance after posted credits to reject excess payments", async () => {
    await renderFinancePage();
    await submitPayment("50.01");

    expect(container.textContent).toContain("المبلغ يتجاوز المتبقي على الفاتورة بعد احتساب الإشعارات الدائنة المرحّلة.");
    expect(
      rpcMock.mock.calls.some(([name]) => name === "record_customer_payment"),
    ).toBe(false);
  });

  it("reuses the same idempotency key after an ambiguous failure and exact-payload retry", async () => {
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn().mockReturnValue("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    });
    const defaultImplementation = rpcMock.getMockImplementation();
    if (!defaultImplementation) throw new Error("Finance RPC test mock is not configured");
    let paymentAttempts = 0;
    rpcMock.mockImplementation(async (name: string, ...args: unknown[]) => {
      if (name === "record_customer_payment") {
        paymentAttempts += 1;
        if (paymentAttempts === 1) {
          return { data: null, error: { message: "network response was lost" } };
        }
        return { data: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", error: null };
      }
      return defaultImplementation(name, ...args);
    });

    await renderFinancePage();
    await submitPayment("20.00");
    expect(container.textContent).toContain("أعد المحاولة بالقيم نفسها");
    await submitPayment("20.00");

    const calls = rpcMock.mock.calls.filter(([name]) => name === "record_customer_payment");
    expect(calls).toHaveLength(2);
    expect(calls[0][1].p_idempotency_key).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(calls[1][1].p_idempotency_key).toBe(calls[0][1].p_idempotency_key);
    expect(calls[1][1].p_amount).toBe(20);
    expect(container.textContent).toContain("تم تسجيل الدفعة وتحديث حالة الفاتورة.");
  });

  it("generates a new idempotency key when a retry changes the request payload", async () => {
    const keys = [
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    ];
    vi.stubGlobal("crypto", {
      randomUUID: vi.fn(() => {
        const key = keys.shift();
        if (!key) throw new Error("Unexpected UUID generation in test");
        return key;
      }),
    });
    const defaultImplementation = rpcMock.getMockImplementation();
    if (!defaultImplementation) throw new Error("Finance RPC test mock is not configured");
    let paymentAttempts = 0;
    rpcMock.mockImplementation(async (name: string, ...args: unknown[]) => {
      if (name === "record_customer_payment") {
        paymentAttempts += 1;
        if (paymentAttempts === 1) {
          return { data: null, error: { message: "network response was lost" } };
        }
        return { data: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", error: null };
      }
      return defaultImplementation(name, ...args);
    });

    await renderFinancePage();
    await submitPayment("20.00");
    await submitPayment("21.00");
    const calls = rpcMock.mock.calls.filter(([name]) => name === "record_customer_payment");
    expect(calls).toHaveLength(2);
    expect(calls[0][1].p_idempotency_key).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    expect(calls[1][1].p_idempotency_key).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc");
    expect(calls[1][1].p_amount).toBe(21);
  });

  it("submits an amount equal to the remaining balance", async () => {
    await renderFinancePage();
    await submitPayment("50.00");

    expect(container.textContent).toContain("تم تسجيل الدفعة وتحديث حالة الفاتورة.");
    expect(rpcMock).toHaveBeenCalledWith("record_customer_payment", {
      p_invoice_id: INVOICE_ID,
      p_amount: 50,
      p_payment_method: "cash",
      p_idempotency_key: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
      p_reference: null,
      p_notes: null,
    });
  });
});
