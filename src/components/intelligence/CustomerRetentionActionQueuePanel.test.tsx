// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi, waitFor } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: { user: null as null | { profileId: string; roles: string[] } },
  createDecisionOutcomeProposal: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  useAuth: () => ({ user: mocks.auth.user }),
}));

vi.mock("@/lib/intelligence/decision-outcome-client", () => ({
  createDecisionOutcomeProposal: mocks.createDecisionOutcomeProposal,
}));

afterEach(() => {
  cleanup();
  mocks.auth.user = null;
  vi.clearAllMocks();
});
import type { CustomerRetentionActionQueue } from "@/lib/intelligence/customer-retention";
import {
  CustomerRetentionActionQueuePanel,
  buildCustomerRetentionActionsCsv,
  filterCustomerRetentionActions,
  normalizeCustomerRetentionSearch,
  paginateCustomerRetentionActions,
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

  it("creates a durable decision proposal only for an authorized manager and refreshes after server confirmation", async () => {
    mocks.auth.user = { profileId: "123e4567-e89b-42d3-a456-426614174000", roles: ["manager"] };
    mocks.createDecisionOutcomeProposal.mockResolvedValue({
      ok: true,
      duplicate: false,
      outcome: {} as never,
    });
    const onRetry = vi.fn();
    render(<CustomerRetentionActionQueuePanel queue={verifiedQueue} loading={false} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "حفظ كقرار إداري للمتابعة" }));

    await waitFor(() => expect(mocks.createDecisionOutcomeProposal).toHaveBeenCalledTimes(1));
    const request = mocks.createDecisionOutcomeProposal.mock.calls[0][0];
    expect(request).toMatchObject({
      candidateId: "customer.retention:customer-1234567890:2026-11-26",
      ruleId: "customers.retention.follow-up",
      ruleVersion: "1.0.0",
      ownerProfileId: "123e4567-e89b-42d3-a456-426614174000",
      candidateSnapshot: {
        priority: "P1",
        priorityScore: 300,
        impact: null,
        impactStatus: "WITHHELD",
        impactReason: "CUSTOMER_FINANCIAL_VALUE_NOT_AVAILABLE",
        proof: {
          asOf: verifiedQueue.asOf,
          evidenceIds: ["orders-current", "orders-previous"],
          metricKeys: ["customer.orders.current", "customer.orders.previous"],
        },
      },
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/حُفظ قرار متابعة العميل بالخادم/)).toBeInTheDocument();
  });

  it("does not expose decision creation to an unauthenticated customer", () => {
    mocks.auth.user = null;
    render(<CustomerRetentionActionQueuePanel queue={verifiedQueue} loading={false} />);

    expect(screen.queryByRole("button", { name: "حفظ كقرار إداري للمتابعة" })).not.toBeInTheDocument();
    expect(mocks.createDecisionOutcomeProposal).not.toHaveBeenCalled();
  });

  it("shows server denials without pretending the customer decision was saved", async () => {
    mocks.auth.user = { profileId: "123e4567-e89b-42d3-a456-426614174000", roles: ["admin"] };
    mocks.createDecisionOutcomeProposal.mockResolvedValue({
      ok: false,
      status: "DENIED",
      message: "تتطلب إدارة دورة القرارات صلاحية الإدارة المالية.",
    });
    render(<CustomerRetentionActionQueuePanel queue={verifiedQueue} loading={false} />);

    fireEvent.click(screen.getByRole("button", { name: "حفظ كقرار إداري للمتابعة" }));

    expect(await screen.findByText("تتطلب إدارة دورة القرارات صلاحية الإدارة المالية.")).toBeInTheDocument();
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
