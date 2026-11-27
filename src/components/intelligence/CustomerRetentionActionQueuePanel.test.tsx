// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => cleanup());
import type { CustomerRetentionActionQueue } from "@/lib/intelligence/customer-retention";
import {
  CustomerRetentionActionQueuePanel,
  filterCustomerRetentionActions,
  normalizeCustomerRetentionSearch,
  paginateCustomerRetentionActions,
} from "./CustomerRetentionActionQueuePanel";

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
    metricIds: ["metric-current", "metric-previous"],
    metricKeys: ["customer.orders.current", "customer.orders.previous"],
    formulaVersions: ["customer-retention@1"],
  }],
  totalActionable: 1,
  omittedCount: 0,
  withheldCustomerCount: 0,
  warnings: [],
};

describe("customer retention action triage", () => {
  it("normalizes Arabic text and filters by priority, action and evidence-backed reason", () => {
    const actions = [
      ...verifiedQueue.actions,
      {
        ...verifiedQueue.actions[0],
        customerRef: "customer-medium",
        priority: "MEDIUM" as const,
        action: "PREVENT_CHURN" as const,
        daysSinceLastOrder: 45,
        reason: "راجع تأخر الطلب قبل فقدان العميل.",
      },
      {
        ...verifiedQueue.actions[0],
        customerRef: "customer-high-oldest",
        priority: "HIGH" as const,
        daysSinceLastOrder: 200,
      },
    ];

    expect(normalizeCustomerRetentionSearch("إِجْرَاء  مُؤَجَّل"))
      .toBe(normalizeCustomerRetentionSearch("اجراء مؤجل"));
    expect(filterCustomerRetentionActions(actions, "تأخر الطلب", "ALL", "PREVENT_CHURN")
      .map(item => item.customerRef)).toEqual(["customer-medium"]);
    expect(filterCustomerRetentionActions(actions, "", "HIGH", "ALL")
      .map(item => item.customerRef)).toEqual(["customer-high-oldest", "customer-1234567890"]);
  });

  it("paginates the whole loaded customer action set and clamps out-of-range pages", () => {
    const actions = Array.from({ length: 23 }, (_, index) => ({
      ...verifiedQueue.actions[0],
      customerRef: "customer-" + String(index + 1).padStart(2, "0"),
    }));
    const first = paginateCustomerRetentionActions(actions, 0);
    const middle = paginateCustomerRetentionActions(actions, 1);
    const last = paginateCustomerRetentionActions(actions, 99);

    expect(first.items).toHaveLength(10);
    expect(middle.items).toHaveLength(10);
    expect(last.items).toHaveLength(3);
    expect(last.page).toBe(2);
    expect([...first.items, ...middle.items, ...last.items].map(item => item.customerRef))
      .toEqual(actions.map(item => item.customerRef));
  });
});

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

  it("wires the visible search and action controls to the loaded queue", () => {
    const extra = {
      ...verifiedQueue.actions[0],
      customerRef: "customer-2222222222",
      priority: "MEDIUM" as const,
      action: "PREVENT_CHURN" as const,
      daysSinceLastOrder: 45,
      reason: "راجع تأخر الطلب قبل فقدان العميل.",
    };
    render(<CustomerRetentionActionQueuePanel
      queue={{ ...verifiedQueue, actions: [...verifiedQueue.actions, extra], totalActionable: 2 }}
      loading={false}
    />);

    fireEvent.change(screen.getByRole("searchbox", { name: "البحث في إجراءات متابعة العملاء" }), {
      target: { value: "تأخر الطلب" },
    });

    expect(screen.getByText("منع فقدان العميل")).toBeInTheDocument();
    expect(screen.queryByText("إعادة تنشيط العميل")).not.toBeInTheDocument();
    expect(screen.getByText(/يعرض 1 من 2 إجراء محمّل/)).toBeInTheDocument();
  });

  it("keeps filter hooks stable as source state changes from loading to verified", () => {
    const view = render(<CustomerRetentionActionQueuePanel queue={null} loading />);
    expect(screen.getByText(/جارٍ تجهيز قائمة الإجراءات/)).toBeInTheDocument();

    view.rerender(<CustomerRetentionActionQueuePanel queue={verifiedQueue} loading={false} />);

    expect(screen.getByRole("searchbox", { name: "البحث في إجراءات متابعة العملاء" })).toBeInTheDocument();
    expect(screen.getByText("إعادة تنشيط العميل")).toBeInTheDocument();
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
