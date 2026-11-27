// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GrowthOpportunityRadarResult } from "@/lib/intelligence/growth-opportunities";
import {
  buildGrowthOpportunityCsv,
  filterAndSortGrowthOpportunities,
  GrowthOpportunityRadar,
  normalizeGrowthOpportunitySearch,
  paginateGrowthOpportunities,
} from "./GrowthOpportunityRadar";

const mocks = vi.hoisted(() => ({
  user: {
    profileId: "22222222-2222-4222-8222-222222222222" as string | null,
    roles: ["manager"] as string[],
  },
  createDecisionOutcomeProposal: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/intelligence/decision-outcome-client", () => ({
  createDecisionOutcomeProposal: mocks.createDecisionOutcomeProposal,
}));
vi.mock("@/lib/intelligence/unavailable-product-search-demand-client", () => ({
  createUnavailableProductDemandFollowUpTask: vi.fn(),
}));

const partialRadar: GrowthOpportunityRadarResult = {
  generatedAt: "2026-11-13T04:00:00.000Z",
  asOf: "2026-11-13T04:00:00.000Z",
  status: "NEEDS_REVIEW",
  evaluatedSignals: 2,
  opportunities: [],
  withheld: [],
  summary: {
    QUOTE_UNCONVERTED: 0,
    PRODUCT_UNAVAILABLE_DEMAND: 0,
    CUSTOMER_ACTIVITY_DECLINE: 0,
    REPEAT_PURCHASE: 0,
    PRODUCT_PERFORMANCE_CHANGE: 0,
  },
  sourceCoverage: [
    {
      key: "CUSTOMER_RETENTION",
      status: "VERIFIED",
      evidenceCount: 4,
      signalCount: 1,
      warnings: [],
      message: null,
    },
    {
      key: "UNAVAILABLE_PRODUCT_DEMAND",
      status: "PARTIAL",
      evidenceCount: 2,
      signalCount: 1,
      warnings: ["TRACKER_COVERAGE_STARTED_AFTER_PERIOD_START"],
      message: null,
    },
    {
      key: "PRODUCT_PERFORMANCE",
      status: "UNAVAILABLE",
      evidenceCount: 0,
      signalCount: 0,
      warnings: [],
      message: "مصدر أداء المنتجات غير متاح حالياً.",
    },
  ],
  warnings: ["SOME_SIGNALS_WITHHELD", "PRODUCT_PERFORMANCE_SOURCE_NOT_READ"],
};

const verifiedOpportunity = {
  id: "growth:customer-retention-1:2026-11-13T04:00:00.000Z",
  signalId: "customer-retention-1",
  kind: "CUSTOMER_ACTIVITY_DECLINE" as const,
  subjectRef: "11111111-1111-4111-8111-111111111111",
  title: "تراجع موثق في نشاط العميل",
  classification: "RETENTION" as const,
  direction: "DECLINING" as const,
  priority: "P1" as const,
  what: "متابعة تراجع نشاط العميل المثبت",
  why: "تراجع عدد الطلبات بنسبة 60% مقارنة بفترة سابقة متساوية المدة.",
  soWhat: "إشارة متابعة وليست دليلاً على سبب التراجع.",
  whatNext: "راجع الطلبات وتواصل مع العميل دون افتراض السبب.",
  owner: "المبيعات",
  expectedOutcome: "توثيق نتيجة المتابعة أو تحديث خطة الخدمة.",
  observedValue: 2,
  baselineValue: 5,
  changePercent: -60,
  unit: "COUNT" as const,
  sampleSize: 2,
  baselineSampleSize: 5,
  sourceAmount: null,
  asOf: "2026-11-13T04:00:00.000Z",
  period: { from: "2026-11-01", to: "2026-11-13" },
  baselinePeriod: { from: "2026-10-19", to: "2026-10-31" },
  proof: {
    evidenceIds: ["retention-evidence-1", "retention-evidence-2"],
    metricKeys: ["customer.orders.current", "customer.orders.baseline"],
    formulaVersions: ["customer-retention@1", "growth-opportunity-comparison@1.0.0"],
  },
  policyVersion: "1.0.0",
  warnings: [],
};

const verifiedRadar: GrowthOpportunityRadarResult = {
  ...partialRadar,
  status: "VERIFIED",
  opportunities: [verifiedOpportunity],
  sourceCoverage: partialRadar.sourceCoverage?.map(source => ({
    ...source,
    status: "VERIFIED",
    message: null,
    warnings: [],
  })),
  warnings: [],
  withheld: [],
  summary: {
    QUOTE_UNCONVERTED: 0,
    PRODUCT_UNAVAILABLE_DEMAND: 0,
    CUSTOMER_ACTIVITY_DECLINE: 1,
    REPEAT_PURCHASE: 0,
    PRODUCT_PERFORMANCE_CHANGE: 0,
  },
};

describe("GrowthOpportunityRadar triage helpers", () => {
  it("normalizes Arabic diacritics, alef variants and whitespace for search", () => {
    expect(normalizeGrowthOpportunitySearch("إِعادة  الشِّراء")).toBe("اعاده الشراء");
  });

  it("filters by kind and priority, then sorts P1 before P2 and P3", () => {
    const opportunities = [
      {
        ...verifiedOpportunity,
        id: "low",
        kind: "REPEAT_PURCHASE" as const,
        priority: "P3" as const,
        title: "إعادة الشراء",
      },
      {
        ...verifiedOpportunity,
        id: "medium",
        kind: "PRODUCT_UNAVAILABLE_DEMAND" as const,
        priority: "P2" as const,
        title: "طلب منتج غير متاح",
      },
      {
        ...verifiedOpportunity,
        id: "high",
        kind: "CUSTOMER_ACTIVITY_DECLINE" as const,
        priority: "P1" as const,
        title: "تراجع نشاط العميل",
      },
    ];

    expect(filterAndSortGrowthOpportunities(opportunities, {
      searchText: "",
      priority: "ALL",
      kind: "ALL",
    }).map(item => item.id)).toEqual(["high", "medium", "low"]);

    expect(filterAndSortGrowthOpportunities(opportunities, {
      searchText: "إِعَادَة الشراء",
      priority: "P3",
      kind: "REPEAT_PURCHASE",
    }).map(item => item.id)).toEqual(["low"]);
  });

  it("clamps pagination and returns the final partial page without dropping records", () => {
    const opportunities = Array.from({ length: 12 }, (_, index) => ({
      ...verifiedOpportunity,
      id: "opportunity-" + index,
    }));
    const middle = paginateGrowthOpportunities(opportunities, 1, 5);
    expect(middle.items.map(item => item.id)).toEqual([
      "opportunity-5",
      "opportunity-6",
      "opportunity-7",
      "opportunity-8",
      "opportunity-9",
    ]);
    const final = paginateGrowthOpportunities(opportunities, 99, 5);
    expect(final.page).toBe(2);
    expect(final.items.map(item => item.id)).toEqual(["opportunity-10", "opportunity-11"]);
    expect(final.totalCount).toBe(12);
  });
});

describe("GrowthOpportunityRadar", () => {
  beforeEach(() => {
    mocks.user.profileId = "22222222-2222-4222-8222-222222222222";
    mocks.user.roles = ["manager"];
    mocks.createDecisionOutcomeProposal.mockReset();
    mocks.createDecisionOutcomeProposal.mockResolvedValue({
      ok: true,
      duplicate: false,
      outcome: {},
    });
  });
  afterEach(() => cleanup());

  it("renders every source's independent coverage and failure message", () => {
    render(<GrowthOpportunityRadar result={partialRadar} />);
    const coverage = screen.getByRole("region", { name: "تغطية مصادر رادار النمو" });

    expect(within(coverage).getByText("نشاط العملاء والشراء المتكرر")).toBeInTheDocument();
    expect(within(coverage).getByText("الطلب على المنتجات غير المتاحة")).toBeInTheDocument();
    expect(within(coverage).getByText("اتجاه أداء المنتجات")).toBeInTheDocument();
    expect(within(coverage).getByText("مكتمل وموثق")).toBeInTheDocument();
    expect(within(coverage).getByText("تغطية جزئية")).toBeInTheDocument();
    expect(within(coverage).getByText("غير متاح")).toBeInTheDocument();
    expect(within(coverage).getByText("مصدر أداء المنتجات غير متاح حالياً.")).toBeInTheDocument();
    expect(within(coverage).getByText("TRACKER_COVERAGE_STARTED_AFTER_PERIOD_START")).toBeInTheDocument();
  });

  it("exports filtered opportunity evidence with spreadsheet-safe cells and UTF-8 BOM", () => {
    const csv = buildGrowthOpportunityCsv([{
      ...verifiedOpportunity,
      title: '=HYPERLINK("https://example.invalid","open")',
    }]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("تنبيه التغطية");
    expect(csv).toContain('"5","-60","COUNT"');
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"",""open"")"');
    expect(csv).toContain('"retention-evidence-1 | retention-evidence-2"');
    expect(csv).toContain('"customer.orders.current | customer.orders.baseline"');
    expect(csv).toContain('"customer-retention@1 | growth-opportunity-comparison@1.0.0"');
    expect(buildGrowthOpportunityCsv([])).toContain("مراجع الإثبات");
  });

  it("does not claim that there are no opportunities when source coverage is incomplete", () => {
    render(<GrowthOpportunityRadar result={partialRadar} />);
    expect(screen.getByText(/لا توجد فرصة يمكن إثباتها حالياً/)).toBeInTheDocument();
    expect(screen.queryByText("لا توجد فرص تجاوزت العتبات المحددة في مجتمع البيانات المكتمل لهذه الفترة.")).not.toBeInTheDocument();
  });

  it("saves a verified customer opportunity as a durable decision proposal with proof and no invented financial impact", async () => {
    const onRetry = vi.fn();
    render(<GrowthOpportunityRadar result={verifiedRadar} onRetry={onRetry} />);

    fireEvent.click(screen.getByRole("button", { name: "حفظ كقرار إداري للمتابعة" }));

    await waitFor(() => expect(mocks.createDecisionOutcomeProposal).toHaveBeenCalledTimes(1));
    const input = mocks.createDecisionOutcomeProposal.mock.calls[0][0];
    expect(input).toMatchObject({
      candidateId: verifiedOpportunity.id,
      ruleId: "growth.customer.activity-decline",
      ruleVersion: "1.0.0",
      ownerProfileId: "22222222-2222-4222-8222-222222222222",
      expectedOutcome: verifiedOpportunity.expectedOutcome,
      reason: verifiedOpportunity.why,
      candidateSnapshot: {
        priority: "P1",
        priorityScore: 300,
        impact: null,
        impactStatus: "WITHHELD",
        impactReason: "GROWTH_OPPORTUNITY_IS_NOT_A_VERIFIED_FINANCIAL_FORECAST",
        proof: {
          evidenceIds: verifiedOpportunity.proof.evidenceIds,
          metricKeys: verifiedOpportunity.proof.metricKeys,
          formulaVersions: verifiedOpportunity.proof.formulaVersions,
          asOf: verifiedOpportunity.asOf,
        },
      },
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/حُفظ القرار في دورة القرارات بالخادم/)).toBeInTheDocument();
  });

  it.each([
    ["QUOTE_UNCONVERTED", "growth.quote.unconverted"],
    ["PRODUCT_UNAVAILABLE_DEMAND", "growth.product.unavailable-demand"],
    ["CUSTOMER_ACTIVITY_DECLINE", "growth.customer.activity-decline"],
    ["REPEAT_PURCHASE", "growth.customer.repeat-purchase"],
    ["PRODUCT_PERFORMANCE_CHANGE", "growth.product.performance-change"],
  ] as const)("maps the %s opportunity to its own decision rule", async (kind, ruleId) => {
    const opportunity = {
      ...verifiedOpportunity,
      id: "growth:" + kind + ":2026-11-13T04:00:00.000Z",
      kind,
    };
    render(<GrowthOpportunityRadar result={{ ...verifiedRadar, opportunities: [opportunity] }} />);
    fireEvent.click(screen.getByRole("button", { name: "حفظ كقرار إداري للمتابعة" }));

    await waitFor(() => expect(mocks.createDecisionOutcomeProposal).toHaveBeenCalledTimes(1));
    expect(mocks.createDecisionOutcomeProposal.mock.calls[0][0]).toMatchObject({
      candidateId: opportunity.id,
      ruleId,
    });
  });

  it("reuses an existing decision proposal without creating a duplicate", async () => {
    mocks.createDecisionOutcomeProposal.mockResolvedValue({
      ok: true,
      duplicate: true,
      outcome: {},
    });
    render(<GrowthOpportunityRadar result={verifiedRadar} />);

    fireEvent.click(screen.getByRole("button", { name: "حفظ كقرار إداري للمتابعة" }));

    expect(await screen.findByText(/هذا القرار محفوظ مسبقاً/)).toBeInTheDocument();
    expect(mocks.createDecisionOutcomeProposal).toHaveBeenCalledTimes(1);
  });

  it("does not offer server decision creation without an authenticated manager profile", () => {
    mocks.user.profileId = null;
    render(<GrowthOpportunityRadar result={verifiedRadar} />);
    expect(screen.queryByRole("button", { name: "حفظ كقرار إداري للمتابعة" })).not.toBeInTheDocument();
  });

  it("preserves the explicit error and retry state when the radar request itself is unavailable", () => {
    const onRetry = vi.fn();
    render(<GrowthOpportunityRadar state="error" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
  });
});
