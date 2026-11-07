import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EvidenceSourceComparisonPanel,
  type EvidenceSourceComparisonPanelProps,
} from "./EvidenceSourceComparisonPanel";
import type { EvidenceSourceComparison } from "@/lib/intelligence/evidence-source-comparison";

function comparison(overrides: Partial<EvidenceSourceComparison> = {}): EvidenceSourceComparison {
  const source = {
    sourceName: "operational.orders",
    sourceKind: "TABLE" as const,
    sourceVersion: "v1",
    sourceTimestamp: "2026-11-06T19:55:00.000Z",
    asOf: "2026-11-06T20:00:00.000Z",
    sourceAgeMilliseconds: 300_000,
    status: "VERIFIED" as const,
    completeness: "COMPLETE" as const,
    quality: "ACCEPTABLE" as const,
  };
  const side = (amount: number) => ({
    value: amount,
    unit: "COUNT" as const,
    currency: null,
    unitOfMeasure: null,
    period: { from: "2026-10-01", to: "2026-10-31" },
    asOf: "2026-11-06T20:00:00.000Z",
    status: "VERIFIED" as const,
    completeness: "COMPLETE" as const,
    quality: "ACCEPTABLE" as const,
    formulaId: "orders.completed.count",
    formulaVersion: "1",
    sources: [source],
  });
  return {
    status: "VARIANCE",
    comparisonKey: "product:item_code:000125",
    metricKey: "orders.completed",
    left: side(10),
    right: { ...side(14), sources: [{ ...source, sourceName: "analytics.orders" }] },
    difference: 4,
    differencePercent: 40,
    reasons: [],
    explanation: "يوجد فرق بين المصدرين؛ لم يُحسب متوسط ولم يُعدّل أي مصدر.",
    ...overrides,
  };
}

describe("EvidenceSourceComparisonPanel", () => {
  it("renders both source values, names and source timestamps without averaging", () => {
    render(<EvidenceSourceComparisonPanel comparison={comparison()} />);
    expect(screen.getByText("الفرق المحسوب")).toBeInTheDocument();
    expect(screen.getByText("الفرق المحسوب").parentElement?.textContent).toContain("٤");
    expect(screen.getByText(/operational\.orders/)).toBeInTheDocument();
    expect(screen.getByText(/analytics\.orders/)).toBeInTheDocument();
    expect(screen.getAllByText(/2026-11-06T19:55:00.000Z/)).toHaveLength(2);
    expect(screen.getByText(/لم يتم حساب متوسط بين المصدرين/)).toBeInTheDocument();
  });

  it("shows both values and the context mismatch but does not display a calculated difference", () => {
    render(<EvidenceSourceComparisonPanel comparison={comparison({
      status: "NOT_COMPARABLE",
      difference: null,
      differencePercent: null,
      reasons: ["CURRENCY_MISMATCH", "FORMULA_MISMATCH"],
      explanation: "سياق القياس مختلف.",
    })} />);
    expect(screen.getByText("المصدر الأول")).toBeInTheDocument();
    expect(screen.getByText("المصدر الثاني")).toBeInTheDocument();
    expect(screen.getByText(/العملة مختلفة أو غير محددة/)).toBeInTheDocument();
    expect(screen.getByText(/معادلة الحساب أو إصدارها مختلف/)).toBeInTheDocument();
    expect(screen.queryByText("الفرق المحسوب")).toBeNull();
  });

  it("does not reveal withheld values when evidence is unavailable", () => {
    render(<EvidenceSourceComparisonPanel comparison={comparison({
      status: "WITHHELD",
      left: { ...comparison().left!, value: null, status: "UNVERIFIED", completeness: "PARTIAL" },
      right: null,
      difference: null,
      differencePercent: null,
      reasons: ["RIGHT_EVIDENCE_NOT_VERIFIED"],
      explanation: "حُجبت المقارنة.",
    })} />);
    expect(screen.getByText("لا توجد لقطة موثوقة لهذا الجانب.")).toBeInTheDocument();
    expect(screen.queryByText("14")).toBeNull();
    expect(screen.queryByText("الفرق المحسوب")).toBeNull();
    expect(screen.getByText(/أدلة المصدر الثاني غير مكتملة أو غير مقبولة/)).toBeInTheDocument();
  });

  it.each([
    ["loading", "جارٍ تحميل لقطتي المصدر…"],
    ["empty", "لا توجد مقارنة محددة للفترة أو المؤشر المختار."],
    ["unavailable", "مصدر المقارنة غير متاح؛ لم تُعرض قيم بديلة."],
  ] as const)("renders the %s state without substitute values", (state, message) => {
    render(<EvidenceSourceComparisonPanel state={state} />);
    expect(screen.getByRole("status")).toHaveTextContent(message);
  });

  it("keeps error recovery explicit", () => {
    const onRetry = vi.fn();
    const props: EvidenceSourceComparisonPanelProps = {
      state: "error",
      errorMessage: "تعذر قراءة المصدر",
      onRetry,
    };
    render(<EvidenceSourceComparisonPanel {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "إعادة المحاولة" }));
    expect(screen.getByRole("alert")).toHaveTextContent("تعذر قراءة المصدر");
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
