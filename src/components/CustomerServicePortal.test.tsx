// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerServicePortal } from "./CustomerServicePortal";

const mocks = vi.hoisted(() => ({
  fetchContext: vi.fn(),
  fetchPage: vi.fn(),
  createCase: vi.fn(),
  addMessage: vi.fn(),
  newRequestKey: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({
    user: { id: "auth-customer", profileId: "profile-customer", isStaff: false, roles: ["customer"] },
    ready: true,
    sessionRevision: 1,
  }),
}));
vi.mock("@tanstack/react-router", () => ({
  useLocation: () => ({ searchStr: window.location.search }),
}));
vi.mock("@/components/Login", () => ({ Login: () => null }));
vi.mock("@/lib/customer-service-portal", () => ({
  addMyCustomerServiceCaseMessage: mocks.addMessage,
  createMyCustomerServiceCase: mocks.createCase,
  fetchMyCustomerServiceCasesPage: mocks.fetchPage,
  fetchMyCustomerServicePortalContext: mocks.fetchContext,
  newCustomerServicePortalRequestKey: mocks.newRequestKey,
}));

const customerContext = {
  customerId: "a0000000-0000-4000-8000-000000000101",
  companyName: "شركة اختبار",
  canRead: true,
  canReply: true,
  canCreate: true,
};
const emptyPage = {
  asOf: "2026-11-28T00:00:00.000Z",
  totalCount: 0,
  pageSize: 50,
  hasMore: false,
  nextCursor: null,
  cases: [],
};

beforeEach(() => {
  window.history.replaceState({}, "", "/service-cases");
  mocks.fetchContext.mockResolvedValue(customerContext);
  mocks.fetchPage.mockResolvedValue(emptyPage);
  mocks.createCase.mockResolvedValue({
    id: "a0000000-0000-4000-8000-000000000102",
    caseCode: "SRV-2026-0001",
  });
  mocks.newRequestKey.mockReturnValue("customer-request-key-0001");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("CustomerServicePortal financial service requests", () => {
  it("creates a balance-review case through the customer-scoped service request RPC", async () => {
    const user = userEvent.setup();
    render(<CustomerServicePortal />);
    await screen.findByRole("button", { name: "طلب مراجعة الرصيد" });
    await user.click(screen.getByRole("button", { name: "طلب مراجعة الرصيد" }));
    expect(screen.getByRole("button", { name: "إرسال الطلب المالي" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "إرسال الطلب المالي" }));

    await waitFor(() => expect(mocks.createCase).toHaveBeenCalledTimes(1));
    expect(mocks.createCase).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "customer-request-key-0001",
      caseType: "service_request",
      priority: "medium",
      subject: "طلب مراجعة رصيد الحساب",
      description: expect.stringContaining("لا يجيز تعديل الرصيد أو ترحيل حركة مالية"),
    }));
    expect(screen.getByText(/تم فتح الحالة SRV-2026-0001/)).toBeInTheDocument();
  });

  it("requires a valid inclusive date period before creating a statement request", async () => {
    const user = userEvent.setup();
    render(<CustomerServicePortal />);
    await screen.findByRole("button", { name: "طلب كشف حساب لفترة" });
    await user.click(screen.getByRole("button", { name: "طلب كشف حساب لفترة" }));

    const submit = screen.getByRole("button", { name: "إرسال الطلب المالي" });
    const from = screen.getByLabelText("من تاريخ");
    const through = screen.getByLabelText("إلى تاريخ");
    expect(submit).toBeDisabled();

    await user.fill(from, "2026-11-15");
    await user.fill(through, "2026-11-01");
    expect(submit).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("تاريخ البداية قبل تاريخ النهاية");

    await user.fill(through, "2026-11-30");
    expect(submit).toBeEnabled();
    await user.click(submit);

    await waitFor(() => expect(mocks.createCase).toHaveBeenCalledTimes(1));
    expect(mocks.createCase).toHaveBeenCalledWith(expect.objectContaining({
      caseType: "service_request",
      priority: "medium",
      subject: "طلب كشف حساب لفترة محددة",
      description: expect.stringContaining("الفترة المطلوبة (شاملة اليومين): 2026-11-15 إلى 2026-11-30"),
    }));
  });

  it("preselects statement-period intent when opened from the customer account statement", async () => {
    window.history.replaceState({}, "", "/service-cases?request=statement_period");
    render(<CustomerServicePortal />);
    expect(await screen.findByLabelText("من تاريخ")).toBeInTheDocument();
    expect(screen.getByLabelText("إلى تاريخ")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "طلب كشف حساب لفترة" })).toHaveAttribute("aria-pressed", "true");
    expect(mocks.createCase).not.toHaveBeenCalled();
  });

  it("creates a document-review service case from a validated external statement deep link", async () => {
    window.history.replaceState(
      {},
      "",
      "/service-cases?request=document_review&document=INV-001&reference=JV-001&currency=YER&type=invoice&source_mode=ONYX&source_as_of=2026-11-27T20%3A00%3A00Z",
    );
    const user = userEvent.setup();
    render(<CustomerServicePortal />);

    expect(await screen.findByText(/طلب مراجعة المستند المحدد: INV-001/)).toBeInTheDocument();
    expect(screen.getByLabelText("موضوع الحالة")).toHaveValue("طلب مراجعة المستند INV-001");
    await user.click(screen.getByRole("button", { name: "إرسال الطلب المالي" }));

    await waitFor(() => expect(mocks.createCase).toHaveBeenCalledTimes(1));
    expect(mocks.createCase).toHaveBeenCalledWith(expect.objectContaining({
      caseType: "service_request",
      subject: "طلب مراجعة المستند INV-001",
      description: expect.stringContaining("المستند المحدد: INV-001\nمرجع الحركة: JV-001\nالعملة: YER\nالمصدر المعتمد: Onyx Pro\nتاريخ لقطة المصدر: 2026-11-27T20:00:00Z\nنوع الحركة: فاتورة"),
    }));
    expect(mocks.createCase.mock.calls[0][0].description).toContain("لا يغيّر هذا الطلب الرصيد");
  });

  it("rejects malformed or oversized document-review deep links without creating a financial request", async () => {
    const oversizedDocument = "INV-" + "X".repeat(110);
    window.history.replaceState(
      {},
      "",
      "/service-cases?request=document_review&document=" + oversizedDocument + "&reference=JV-001&currency=YER&type=invoice&source_mode=ONYX&source_as_of=2026-11-27T20%3A00%3A00Z",
    );
    render(<CustomerServicePortal />);

    expect(await screen.findByRole("alert")).toHaveTextContent("رابط مراجعة المستند غير صالح أو ناقص");
    expect(screen.getByLabelText("موضوع الحالة")).toHaveValue("");
    expect(screen.queryByText(/طلب مراجعة المستند المحدد:/)).not.toBeInTheDocument();
    expect(mocks.createCase).not.toHaveBeenCalled();
  });

  it("rejects a document-review link without a valid source watermark", async () => {
    window.history.replaceState(
      {},
      "",
      "/service-cases?request=document_review&document=INV-001&reference=JV-001&currency=YER&type=invoice&source_mode=ONYX&source_as_of=invalid",
    );
    render(<CustomerServicePortal />);

    expect(await screen.findByRole("alert")).toHaveTextContent("رابط مراجعة المستند غير صالح أو ناقص");
    expect(screen.getByLabelText("موضوع الحالة")).toHaveValue("");
    expect(mocks.createCase).not.toHaveBeenCalled();
  });

  it("does not expose financial request creation without the existing service-case permission", async () => {
    mocks.fetchContext.mockResolvedValue({ ...customerContext, canCreate: false });
    render(<CustomerServicePortal />);
    await screen.findByRole("heading", { name: "مركز خدمة العملاء" });
    await waitFor(() => expect(mocks.fetchPage).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "طلب مراجعة الرصيد" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "طلب كشف حساب لفترة" })).not.toBeInTheDocument();
    expect(mocks.createCase).not.toHaveBeenCalled();
  });
});
