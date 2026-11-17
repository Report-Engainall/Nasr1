// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  user: { id: "staff-1", profileId: "profile-1", isStaff: true, roles: ["admin"] as string[] },
  fetchDeskPage: vi.fn(),
  fetchAssignees: vi.fn(),
  fetchPortalContext: vi.fn(),
  fetchPortalPage: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.user, ready: true, sessionRevision: 1 }),
}));
vi.mock("@/components/AdminPages", () => ({
  Button: ({ children, onClick, disabled }: { children?: ReactNode; onClick?: () => void; disabled?: boolean }) =>
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
  Empty: ({ text }: { text: string }) => <p>{text}</p>,
  ErrorBox: ({ message }: { message: string }) => <p role="alert">{message}</p>,
  Loading: () => <p role="status">loading</p>,
}));
vi.mock("@/components/CustomerServiceConversation", () => ({ CustomerServiceConversation: () => null }));
vi.mock("@/components/CustomerServiceSlaPolicyPanel", () => ({ CustomerServiceSlaPolicyPanel: () => null }));
vi.mock("@/components/CustomerServiceDeskPrintSheet", () => ({ CustomerServiceDeskPrintSheet: () => null }));
vi.mock("@/lib/api", () => ({ fetchOperationalTaskAssignees: mocks.fetchAssignees }));
vi.mock("@/lib/customer-service-cases", () => ({
  manageCustomerServiceCaseOperations: vi.fn(),
  updateCustomerServiceCase: vi.fn(),
}));
vi.mock("@/lib/customer-service-desk-print", () => ({ projectCustomerServiceDeskPrintDocument: vi.fn() }));
vi.mock("@/lib/customer-service-desk-xlsx", () => ({ downloadCustomerServiceDeskWorkbookXlsx: vi.fn() }));
vi.mock("@/lib/customer-service-desk", () => ({ fetchCustomerServiceDeskPage: mocks.fetchDeskPage }));
vi.mock("@/lib/customer-service-portal", () => ({
  addMyCustomerServiceCaseMessage: vi.fn(),
  createMyCustomerServiceCase: vi.fn(),
  fetchMyCustomerServiceCasesPage: mocks.fetchPortalPage,
  fetchMyCustomerServicePortalContext: mocks.fetchPortalContext,
  newCustomerServicePortalRequestKey: () => "request-key-for-test-0001",
}));
vi.mock("@/components/Login", () => ({ Login: () => <div>تسجيل الدخول مطلوب</div> }));

import { CustomerServiceDesk } from "@/components/CustomerServiceDesk";
import { CustomerServicePortal } from "@/components/CustomerServicePortal";

const CASE_CODE = "CASE-A1B2C3D4E5";
const emptyDeskPage = {
  items: [],
  summary: {
    open_count: 0,
    response_overdue_count: 0,
    resolution_overdue_count: 0,
    unassigned_count: 0,
    urgent_count: 0,
    high_count: 0,
  },
  nextCursor: null,
  hasMore: false,
};

describe("customer service case deep-link screens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "staff-1", profileId: "profile-1", isStaff: true, roles: ["admin"] };
    mocks.fetchDeskPage.mockResolvedValue(emptyDeskPage);
    mocks.fetchAssignees.mockResolvedValue([]);
    mocks.fetchPortalContext.mockResolvedValue({
      customerId: "customer-1",
      companyName: "شركة الاختبار",
      canRead: true,
      canReply: false,
      canCreate: false,
    });
    mocks.fetchPortalPage.mockResolvedValue({
      cases: [],
      totalCount: 0,
      hasMore: false,
      nextCursor: null,
    });
  });

  afterEach(() => cleanup());

  it("loads a staff case link across all statuses and pre-fills the desk search", async () => {
    window.history.replaceState({}, "", "/admin/service-desk?caseCode=" + CASE_CODE);
    render(<CustomerServiceDesk onNotice={vi.fn()} onOpenTask={vi.fn()} />);

    await waitFor(() => expect(mocks.fetchDeskPage).toHaveBeenCalledWith({
      filters: expect.objectContaining({ status: "all", search: CASE_CODE }),
      limit: 50,
    }));
    expect(screen.getByPlaceholderText(/ابحث برقم الحالة/)).toHaveValue(CASE_CODE);
    expect(screen.getByRole("status")).toHaveTextContent(CASE_CODE);
  });

  it("loads only the signed-in customer's matching case in the customer portal", async () => {
    mocks.user = { id: "customer-user-1", profileId: "customer-profile-1", isStaff: false, roles: ["customer"] };
    window.history.replaceState({}, "", "/service-cases?caseCode=" + CASE_CODE);
    render(<CustomerServicePortal />);

    await waitFor(() => expect(mocks.fetchPortalPage).toHaveBeenCalledWith(expect.objectContaining({
      search: CASE_CODE,
      status: null,
      caseType: null,
    })));
    expect(screen.getByPlaceholderText(/رقم الحالة أو كلمة من المحادثة/)).toHaveValue(CASE_CODE);
    expect(screen.getByRole("status")).toHaveTextContent(CASE_CODE);
  });
});
