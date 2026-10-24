import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { routeTree } from "@/routeTree.gen";

type TestUser = {
  id: string;
  profileId: string;
  email: string;
  name: string;
  roles: string[];
  isStaff: boolean;
};

type InvoiceRow = {
  id: string;
  invoice_number: string;
  order_id: string;
  customer_id: string;
  status: string;
  issued_at: string;
  due_at: string | null;
  currency: string;
  total_amount?: number;
  subtotal?: number;
};

type PayloadResult = { data: unknown; error: { message: string } | null };
type ListResult = { data: InvoiceRow[] | null; error: { message: string } | null };

const mocks = vi.hoisted(() => ({
  user: null as TestUser | null,
  from: vi.fn(),
  rpc: vi.fn(),
  invoices: [] as InvoiceRow[],
  invoiceReadFailures: 0,
  detailPayload: { data: null, error: null } as PayloadResult,
  orderDetail: { data: null, error: null } as { data: unknown; error: { message: string } | null },
  invoiceSelectCalls: [] as Array<{ columns: string; options: unknown }>,
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: mocks.user,
    ready: true,
    loading: false,
    configurationError: null,
    signOut: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("@/components/Login", () => ({
  Login: () => <div data-testid="login-required">تسجيل الدخول مطلوب</div>,
}));

vi.mock("@/components/CustomerReturnRequest", () => ({
  CustomerReturnRequest: () => null,
}));

vi.mock("@/components/FinanceDocumentPrintActions", () => ({
  FinanceDocumentPrintActions: () => null,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc, auth: { getSession: vi.fn() } },
  getCurrentTenantScope: vi.fn(),
}));

const CUSTOMER: TestUser = {
  id: "11111111-1111-4111-8111-111111111111",
  profileId: "f1111111-1111-4111-8111-111111111111",
  email: "invoice-list@example.test",
  name: "عميل الاختبار",
  roles: ["customer"],
  isStaff: false,
};

const INVOICE_ID = "22222222-2222-4222-8222-222222222222";

function makeInvoice(overrides: Partial<InvoiceRow> = {}): InvoiceRow {
  return {
    id: INVOICE_ID,
    invoice_number: "INV-TEST-001",
    order_id: "33333333-3333-4333-8333-333333333333",
    customer_id: CUSTOMER.id,
    status: "issued",
    issued_at: "2026-10-12T10:00:00.000Z",
    due_at: null,
    currency: "YER",
    // Not among the columns selected by the list UI; it must not be displayed.
    total_amount: 987654,
    ...overrides,
  };
}

function makeInvoiceQuery() {
  const query = {
    select: vi.fn((columns: string, options?: unknown) => {
      mocks.invoiceSelectCalls.push({ columns, options });
      return query;
    }),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    then: (
      resolve?: (value: ListResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => {
      let result: ListResult;
      if (mocks.invoiceReadFailures > 0) {
        mocks.invoiceReadFailures -= 1;
        result = { data: null, error: { message: "synthetic invoice read failure" } };
      } else {
        result = { data: mocks.invoices, error: null };
      }
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
}

function makeOrderQuery() {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(() => Promise.resolve(mocks.orderDetail)),
  };
  return query;
}

function hiddenInvoicePayload(includeForbiddenFinancialData = false) {
  const invoice: Record<string, unknown> = {
    id: INVOICE_ID,
    invoice_number: "INV-TEST-001",
    order_id: makeInvoice().order_id,
    customer_id: CUSTOMER.id,
    status: "issued",
    issued_at: "2026-10-12T10:00:00.000Z",
    due_at: null,
    currency: "YER",
  };
  const line: Record<string, unknown> = {
    id: "44444444-4444-4444-8444-444444444444",
    item_code: "SKU-PRIVATE",
    description: "صنف اختبار",
    unit: "كرتون",
    quantity: 2,
  };
  if (includeForbiddenFinancialData) {
    invoice.total_amount = 987654;
    line.unit_price = 987654;
    line.line_total = 1975308;
  }
  return {
    invoice,
    lines: [line],
    customer: {
      customer_code: "C-TEST",
      business_name: "شركة الاختبار",
      contact_name: null,
    },
    financial_details_visible: false,
    customer_tier_visible: false,
  };
}

describe("customer invoices real route acceptance", () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.invoices = [];
    mocks.invoiceReadFailures = 0;
    mocks.detailPayload = { data: null, error: null };
    mocks.orderDetail = { data: null, error: null };
    mocks.invoiceSelectCalls = [];
    mocks.from.mockReset().mockImplementation((table: string) => {
      if (table === "customer_invoices") return makeInvoiceQuery();
      if (table === "orders") return makeOrderQuery();
      throw new Error(`Unexpected table read: ${table}`);
    });
    mocks.rpc.mockReset().mockImplementation(async () => mocks.detailPayload);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => root?.unmount());
      root = undefined;
    }
    host?.remove();
    host = undefined;
  });

  async function mountInvoiceRoute() {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ["/invoices"] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    await act(async () => {
      root?.render(<RouterProvider router={router} />);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(router.state.location.pathname).toBe("/invoices");
  }

  async function clickAndFlush(button: HTMLButtonElement | null | undefined) {
    await act(async () => {
      button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }

  it("gates guests before reading invoice records", async () => {
    await mountInvoiceRoute();

    expect(host?.querySelector('[data-testid="login-required"]')?.textContent).toContain(
      "تسجيل الدخول مطلوب",
    );
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("shows a list-read error and recovers through the actual refresh action", async () => {
    mocks.user = CUSTOMER;
    mocks.invoices = [makeInvoice()];
    mocks.invoiceReadFailures = 1;

    await mountInvoiceRoute();

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر تحميل الفواتير",
    );
    expect(host?.textContent).not.toContain("INV-TEST-001");
    expect(host?.textContent).not.toContain("987654");

    await clickAndFlush(host?.querySelector<HTMLButtonElement>("button"));
    expect(host?.querySelector('[role="alert"]')).toBeNull();
    expect(host?.textContent).toContain("INV-TEST-001");
    expect(host?.textContent).not.toContain("987654");
    expect(mocks.from).toHaveBeenCalledTimes(2);
  });

  it("distinguishes a valid empty invoice list from a failed read without fake financial zeros", async () => {
    mocks.user = CUSTOMER;
    mocks.invoices = [];

    await mountInvoiceRoute();

    expect(host?.textContent).toContain("لا توجد فواتير صادرة بعد.");
    expect(host?.textContent).not.toContain("987654");
    expect(host?.textContent).not.toContain("0.00");
  });

  it("renders a server-approved hidden-finance invoice only when the payload omits protected fields", async () => {
    mocks.user = CUSTOMER;
    mocks.invoices = [makeInvoice()];
    mocks.detailPayload = { data: hiddenInvoicePayload(false), error: null };

    await mountInvoiceRoute();
    const open = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("عرض / طباعة"),
    );
    await clickAndFlush(open);

    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_invoice_pdf", { p_invoice_id: INVOICE_ID });
    expect(host?.textContent).toContain("شركة الاختبار");
    expect(host?.textContent).toContain("صنف اختبار");
    expect(host?.textContent).not.toContain("الإجمالي المستحق");
    expect(host?.textContent).not.toContain("987654");
    expect(host?.textContent).not.toContain("tier_label");
  });

  it("fails closed and removes detail content when a hidden-finance payload includes protected amounts", async () => {
    mocks.user = CUSTOMER;
    mocks.invoices = [makeInvoice()];
    mocks.detailPayload = { data: hiddenInvoicePayload(true), error: null };

    await mountInvoiceRoute();
    const open = Array.from(host?.querySelectorAll("button") ?? []).find((button) =>
      button.textContent?.includes("عرض / طباعة"),
    );
    await clickAndFlush(open);

    expect(host?.querySelector('[role="alert"]')?.textContent).toContain(
      "تعذر تحميل تفاصيل الفاتورة ومبالغها المصرح بها",
    );
    expect(host?.textContent).not.toContain("987654");
    expect(host?.textContent).not.toContain("الإجمالي المستحق");
  });
});
