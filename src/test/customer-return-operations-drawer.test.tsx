import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const mocks = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock("@/lib/auth", () => ({ useAuth: mocks.useAuth }));
vi.mock("@/components/CustomerReturnReviewQueue", () => ({
  CustomerReturnReviewQueue: ({ onNotice }: { onNotice: (message: string) => void }) => (
    <div data-testid="review-queue">
      <span>review queue test surface</span>
      <button type="button" onClick={() => onNotice("تم حفظ قرار المراجعة")}>emit review notice</button>
    </div>
  ),
}));
vi.mock("@/components/CustomerReturnReceiptQueue", () => ({
  CustomerReturnReceiptQueue: () => <div data-testid="receipt-queue">receipt queue test surface</div>,
}));
vi.mock("@/components/CustomerReturnCreditMemoQueue", () => ({
  CustomerReturnCreditMemoQueue: () => <div data-testid="credit-queue">credit queue test surface</div>,
}));

import { CustomerReturnOperationsDrawer } from "@/components/CustomerReturnOperationsDrawer";

function setUser(roles: string[], isStaff = true) {
  mocks.useAuth.mockReturnValue({
    ready: true,
    user: {
      id: "user-1",
      profileId: "profile-1",
      email: "staff@example.test",
      name: "موظف اختبار",
      roles,
      isStaff,
    },
  });
}

describe("customer return operations drawer", () => {
  beforeEach(() => {
    mocks.useAuth.mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("lets managers review and receive returns without loading both queues at once", () => {
    setUser(["manager"]);
    render(<CustomerReturnOperationsDrawer workflow="orders" />);

    fireEvent.click(screen.getByRole("button", { name: "إدارة المرتجعات" }));
    expect(screen.getByRole("dialog", { name: "مساحة مراجعة واستلام المرتجعات" })).toBeInTheDocument();
    expect(screen.getByTestId("review-queue")).toBeInTheDocument();
    expect(screen.queryByTestId("receipt-queue")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "الاستلام والفحص" }));
    expect(screen.getByTestId("receipt-queue")).toBeInTheDocument();
    expect(screen.queryByTestId("review-queue")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "إغلاق إدارة المرتجعات" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows only finance credit-memo operations to an accountant", () => {
    setUser(["accountant"]);
    const { rerender } = render(<CustomerReturnOperationsDrawer workflow="orders" />);
    expect(screen.queryByRole("button", { name: "إدارة المرتجعات" })).not.toBeInTheDocument();

    rerender(<CustomerReturnOperationsDrawer workflow="finance" />);
    fireEvent.click(screen.getByRole("button", { name: "إشعارات المرتجعات الدائنة" }));
    expect(screen.getByTestId("credit-queue")).toBeInTheDocument();
    expect(screen.queryByTestId("review-queue")).not.toBeInTheDocument();
    expect(screen.queryByTestId("receipt-queue")).not.toBeInTheDocument();
  });

  it("does not render operations controls for an ordinary customer", () => {
    setUser([], false);
    const { rerender } = render(<CustomerReturnOperationsDrawer workflow="orders" />);
    expect(screen.queryByRole("button", { name: "إدارة المرتجعات" })).not.toBeInTheDocument();

    rerender(<CustomerReturnOperationsDrawer workflow="finance" />);
    expect(screen.queryByRole("button", { name: "إشعارات المرتجعات الدائنة" })).not.toBeInTheDocument();
  });

  it("keeps generic staff away from manager-only return review and receipt controls", () => {
    setUser(["staff"]);
    render(<CustomerReturnOperationsDrawer workflow="orders" />);
    expect(screen.queryByRole("button", { name: "إدارة المرتجعات" })).not.toBeInTheDocument();
  });

  it("surfaces workflow outcomes in an accessible status region", () => {
    setUser(["admin"]);
    render(<CustomerReturnOperationsDrawer workflow="orders" />);
    fireEvent.click(screen.getByRole("button", { name: "إدارة المرتجعات" }));
    fireEvent.click(screen.getByRole("button", { name: "emit review notice" }));
    expect(screen.getByRole("status")).toHaveTextContent("تم حفظ قرار المراجعة");
  });
});
