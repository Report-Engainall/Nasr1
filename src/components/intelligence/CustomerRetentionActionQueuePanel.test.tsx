import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CustomerRetentionActionQueue } from "@/lib/intelligence/customer-retention";
import { CustomerRetentionActionQueuePanel } from "./CustomerRetentionActionQueuePanel";

const verifiedQueue: CustomerRetentionActionQueue = {
  status: "VERIFIED",
  actions: [{
    customerRef: "customer-1234567890",
    priority: "HIGH",
    action: "REACTIVATE",
    activity: "INACTIVE",
    daysSinceLastOrder: 112,
    lastOrderAt: "2026-07-01T12:00:00.000Z",
    orderCountCurrent: 0,
    orderCountPrevious: 2,
    reason: "لم يظهر طلب منذ أكثر من 90 يوماً؛ راجع سبب الانقطاع قبل تقديم عرض استعادة.",
    evidenceIds: ["orders-current", "orders-previous"],
  }],
  totalActionable: 1,
  omittedCount: 0,
  withheldCustomerCount: 0,
  warnings: [],
};

describe("CustomerRetentionActionQueuePanel", () => {
  it("surfaces verified, explainable follow-up actions and their source evidence count", () => {
    render(<CustomerRetentionActionQueuePanel queue={verifiedQueue} loading={false} />);

    expect(screen.getByRole("heading", { name: "إجراءات متابعة العملاء" })).toBeInTheDocument();
    expect(screen.getByText("إعادة تنشيط العميل")).toBeInTheDocument();
    expect(screen.getByText(/لم يظهر طلب منذ أكثر من 90 يوماً/)).toBeInTheDocument();
    expect(screen.getByText(/112 يوماً/)).toBeInTheDocument();
    expect(screen.getByText("أدلة مرتبطة: 2")).toBeInTheDocument();
    expect(screen.getByText(/لا ترسل رسائل للعملاء/)).toBeInTheDocument();
  });

  it("withholds all customer actions when the source population is not verified", () => {
    const withheld: CustomerRetentionActionQueue = {
      ...verifiedQueue,
      status: "NEEDS_REVIEW",
      actions: [],
      totalActionable: 0,
      withheldCustomerCount: 7,
      warnings: ["CUSTOMER_RETENTION_POPULATION_NOT_VERIFIED"],
    };
    render(<CustomerRetentionActionQueuePanel queue={withheld} loading={false} />);

    expect(screen.getByText(/حُجبت الإجراءات لأن تغطية مجتمع العملاء/)).toBeInTheDocument();
    expect(screen.getByText("عملاء محجوبون عن التوصية: 7")).toBeInTheDocument();
    expect(screen.queryByText("إعادة تنشيط العميل")).not.toBeInTheDocument();
  });

  it("distinguishes an empty verified queue from an unavailable or incomplete source", () => {
    render(<CustomerRetentionActionQueuePanel queue={{ ...verifiedQueue, actions: [], totalActionable: 0 }} loading={false} />);

    expect(screen.getByRole("status")).toHaveTextContent("لا توجد إجراءات متابعة موصى بها");
  });
});
