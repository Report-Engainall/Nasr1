// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, waitFor } from "vitest";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
import type { CustomerRetentionActionQueue } from "@/lib/intelligence/customer-retention";
import {
  CustomerRetentionActionQueuePanel,
  buildCustomerRetentionActionsCsv,
  filterCustomerRetentionActions,
  normalizeCustomerRetentionSearch,
  paginateCustomerRetentionActions,
  summarizeCustomerRetentionRecency,
} from "./CustomerRetentionActionQueuePanel";

const verifiedQueue: CustomerRetentionActionQueue = {
  status: "VERIFIED",
  asOf: "2026-11-26T12:00:00.000Z",
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

  it("filters exact purchase-recency bands and keeps missing or invalid ages separate", () => {
    const actions = [
      { ...verifiedQueue.actions[0], customerRef: "age-0", daysSinceLastOrder: 0 },
      { ...verifiedQueue.actions[0], customerRef: "age-30", daysSinceLastOrder: 30 },
      { ...verifiedQueue.actions[0], customerRef: "age-31", daysSinceLastOrder: 31 },
      { ...verifiedQueue.actions[0], customerRef: "age-60", daysSinceLastOrder: 60 },
      { ...verifiedQueue.actions[0], customerRef: "age-61", daysSinceLastOrder: 61 },
      { ...verifiedQueue.actions[0], customerRef: "age-90", daysSinceLastOrder: 90 },
      { ...verifiedQueue.actions[0], customerRef: "age-91", daysSinceLastOrder: 91 },
      { ...verifiedQueue.actions[0], customerRef: "age-null", daysSinceLastOrder: null },
      { ...verifiedQueue.actions[0], customerRef: "age-negative", daysSinceLastOrder: -4 },
      { ...verifiedQueue.actions[0], customerRef: "age-fraction", daysSinceLastOrder: 3.5 },
    ];

    expect(filterCustomerRetentionActions(actions, "", "ALL", "ALL", "0_30")
      .map(item => item.customerRef)).toEqual(["age-0", "age-30"]);
    expect(filterCustomerRetentionActions(actions, "", "ALL", "ALL", "31_60")
      .map(item => item.customerRef)).toEqual(["age-31", "age-60"]);
    expect(filterCustomerRetentionActions(actions, "", "ALL", "ALL", "61_90")
      .map(item => item.customerRef)).toEqual(["age-61", "age-90"]);
    expect(filterCustomerRetentionActions(actions, "", "ALL", "ALL", "OVER_90")
      .map(item => item.customerRef)).toEqual(["age-91"]);
    expect(filterCustomerRetentionActions(actions, "", "ALL", "ALL", "UNKNOWN")
      .map(item => item.customerRef)).toEqual(["age-fraction", "age-negative", "age-null"]);
    expect(summarizeCustomerRetentionRecency(actions)).toEqual({
      within30Days: 2,
      days31To60: 2,
      days61To90: 2,
      over90Days: 1,
      unknownAge: 3,
    });
  });

  it("exports masked customer references with safe text, evidence lineage and honest coverage", () => {
    const action = {
      ...verifiedQueue.actions[0],
      customerRef: "=HYPERLINK(\"https://example.invalid\")",
      reason: "=SUM(1,2)",
    };
    const csv = buildCustomerRetentionActionsCsv({
      actions: [action],
      loadedCount: 1,
      totalActionable: 4,
      omittedCount: 3,
      withheldCustomerCount: 2,
    });

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERL…");
    expect(csv).toContain("'=SUM(1,2)");
    expect(csv).toContain(",112,0,2,2,");
    expect(csv).toContain("evidence_ids");
    expect(csv).toContain("orders-current;orders-previous");
    expect(csv).toContain("خارج حد المصدر 3");
    expect(csv).not.toContain("customer full name");
    expect(() => buildCustomerRetentionActionsCsv({
      actions: [action],
      loadedCount: 5,
      totalActionable: 4,
      omittedCount: 0,
      withheldCustomerCount: 0,
    })).toThrow("customer_retention_export_invalid");
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
    expect(screen.getByRole("button", { name: /تصدير الإجراءات المفلترة CSV/ })).toBeInTheDocument();
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

  it("opens a purchase-recency segment from its workload counter and distinguishes unknown age", () => {
    const additional = [
      { ...verifiedQueue.actions[0], customerRef: "customer-31-to-60", priority: "MEDIUM" as const, daysSinceLastOrder: 45 },
      { ...verifiedQueue.actions[0], customerRef: "customer-age-unknown", priority: "REVIEW" as const, daysSinceLastOrder: null, lastOrderAt: null },
    ];
    render(<CustomerRetentionActionQueuePanel
      queue={{ ...verifiedQueue, actions: [...verifiedQueue.actions, ...additional], totalActionable: 3 }}
      loading={false}
    />);

    fireEvent.click(screen.getByRole("button", { name: "عرض العملاء بمدة انقطاع غير موثقة" }));
    expect(screen.getByText("مدة الانقطاع غير موثقة")).toBeInTheDocument();
    expect(screen.queryByText(/112 يوماً/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("تصفية مدة الانقطاع عن الشراء"), {
      target: { value: "31_60" },
    });
    expect(screen.getByText(/منذ 45 يوماً/)).toBeInTheDocument();
  });

  it("delegates customer decision persistence to the workspace and confirms only a successful save", async () => {
    const onCreateDecisionProposal = vi.fn().mockResolvedValue(true);
    render(<CustomerRetentionActionQueuePanel
      queue={verifiedQueue}
      loading={false}
      canCreateDecision
      onCreateDecisionProposal={onCreateDecisionProposal}
    />);

    fireEvent.click(screen.getByRole("button", { name: "حفظ كقرار إداري للمتابعة" }));

    await waitFor(() => expect(onCreateDecisionProposal).toHaveBeenCalledWith(verifiedQueue.actions[0]));
    expect(await screen.findByText(/حُفظ قرار متابعة العميل بالخادم/)).toBeInTheDocument();
  });

  it("does not render a dead decision button without a workspace persistence handler", () => {
    render(<CustomerRetentionActionQueuePanel queue={verifiedQueue} loading={false} canCreateDecision />);

    expect(screen.queryByRole("button", { name: "حفظ كقرار إداري للمتابعة" })).not.toBeInTheDocument();
  });

  it("does not expose decision creation when the parent workspace denies it", () => {
    const onCreateDecisionProposal = vi.fn();
    render(<CustomerRetentionActionQueuePanel
      queue={verifiedQueue}
      loading={false}
      canCreateDecision={false}
      onCreateDecisionProposal={onCreateDecisionProposal}
    />);

    expect(screen.queryByRole("button", { name: "حفظ كقرار إداري للمتابعة" })).not.toBeInTheDocument();
    expect(onCreateDecisionProposal).not.toHaveBeenCalled();
  });

  it("does not claim that a failed workspace save created a customer decision", async () => {
    const onCreateDecisionProposal = vi.fn().mockResolvedValue(false);
    render(<CustomerRetentionActionQueuePanel
      queue={verifiedQueue}
      loading={false}
      canCreateDecision
      onCreateDecisionProposal={onCreateDecisionProposal}
    />);

    fireEvent.click(screen.getByRole("button", { name: "حفظ كقرار إداري للمتابعة" }));

    expect(await screen.findByText(/لم يتم تأكيد حفظ القرار/)).toBeInTheDocument();
    expect(screen.queryByText(/حُفظ قرار متابعة العميل بالخادم/)).not.toBeInTheDocument();
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
