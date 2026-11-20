// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GrowthOpportunityRadarResult } from "@/lib/intelligence/growth-opportunities";
import { GrowthOpportunityRadar } from "./GrowthOpportunityRadar";

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: null }) }));
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

describe("GrowthOpportunityRadar", () => {
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

  it("does not claim that there are no opportunities when source coverage is incomplete", () => {
    render(<GrowthOpportunityRadar result={partialRadar} />);
    expect(screen.getByText(/لا توجد فرصة يمكن إثباتها حالياً/)).toBeInTheDocument();
    expect(screen.queryByText("لا توجد فرص تجاوزت العتبات المحددة في مجتمع البيانات المكتمل لهذه الفترة.")).not.toBeInTheDocument();
  });

  it("preserves the explicit error and retry state when the radar request itself is unavailable", () => {
    const onRetry = vi.fn();
    render(<GrowthOpportunityRadar state="error" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeInTheDocument();
  });
});
