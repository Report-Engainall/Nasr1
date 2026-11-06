import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { DailyDecisionBoard } from "@/components/intelligence/DailyDecisionBoard";
import type { DecisionMemoryBookResult, DecisionMemoryRecord } from "@/lib/intelligence/decision-memory";

const record: DecisionMemoryRecord = {
  decisionId: "decision-mobile-accessibility",
  candidateRef: "candidate:mobile-accessibility",
  ruleId: "operations.review",
  ruleVersion: "1.0.0",
  state: "PROPOSED",
  version: 1,
  createdAt: "2026-11-06T08:00:00.000Z",
  updatedAt: "2026-11-06T08:00:00.000Z",
  owner: "غير معيّن",
  ownerProfileId: null,
  proposedResult: "مراجعة استثناء تشغيلي محفوظ",
  decisionReason: "مراجعة بشرية مطلوبة",
  approvalAt: null,
  executionAt: null,
  eventCount: 0,
  events: [],
  legacyMeasurement: null,
  snapshotVersion: null,
  capturedAt: null,
  snapshot: null,
  problem: null,
  factsReviewed: false,
  facts: [],
  opinions: [],
  hypotheses: [],
  assumptionsReviewed: false,
  assumptions: [],
  lessonsReviewed: false,
  withheldFacts: 0,
  alternatives: [],
  chosenAlternative: null,
  actionTaken: null,
  reviewDisposition: "NOT_SCHEDULED",
  reviewAt: null,
  expectedMetric: null,
  metricComparison: {
    status: "WITHHELD",
    expected: null,
    actual: null,
    difference: null,
    differencePercent: null,
    reason: "لا يوجد خط أساس محفوظ",
  },
  lessons: [],
  corrections: [],
  missingFields: ["REVIEW_DISPOSITION", "REVIEW_DATE", "EXPECTED_METRIC", "ACTUAL_METRIC"],
  warnings: [],
  memoryStatus: "PARTIAL",
  precedents: [],
};

const result: DecisionMemoryBookResult = {
  generatedAt: "2026-11-06T08:00:00.000Z",
  policyVersion: "1.0.0",
  status: "PARTIAL",
  loadedCount: 1,
  totalCount: 1,
  completeCount: 0,
  partialCount: 1,
  measuredCount: 0,
  verifiedMeasurementCount: 0,
  correctionCount: 0,
  records: [record],
  warnings: [],
};

describe("daily decision board accessibility and responsive structure", () => {
  afterEach(() => cleanup());

  it("keeps decision actions in natural keyboard order with visible focus treatment", () => {
    const { container } = render(<DailyDecisionBoard result={result} />);
    const reason = screen.getByRole("textbox", { name: "سبب الإجراء وسجل القرار" });
    const action = screen.getByRole("button", { name: "إرسال للمراجعة" });
    const focusable = Array.from(container.querySelectorAll<HTMLElement>("textarea, button"));

    expect(focusable).toEqual([reason, action]);
    expect(reason.tabIndex).toBe(0);
    expect(action.tabIndex).toBe(0);
    expect(reason.className).toContain("focus-visible:outline");
    expect(action.className).toContain("focus-visible:outline");

    reason.focus();
    expect(document.activeElement).toBe(reason);
    action.focus();
    expect(document.activeElement).toBe(action);
  });

  it("keeps a stable ID-based order when saved decisions tie on every displayed ranking field", () => {
    const laterId = { ...record, decisionId: "decision-z", proposedResult: "قرار Z" };
    const earlierId = { ...record, decisionId: "decision-a", proposedResult: "قرار A" };
    render(<DailyDecisionBoard result={{ ...result, records: [laterId, earlierId] }} />);

    expect(screen.getAllByRole("heading", { level: 3 }).map(heading => heading.textContent))
      .toEqual(["قرار A", "قرار Z"]);
  });

  it("uses mobile-first grids and announces partial coverage without inventing priority", () => {
    const { container } = render(<DailyDecisionBoard result={result} />);
    const board = screen.getByRole("region", { name: "لوحة متابعة القرارات اليومية" });
    const progress = screen.getByRole("list", { name: "تسلسل انتقال القرار" });
    const summaryGrid = Array.from(container.querySelectorAll("div")).find(element => element.classList.contains("grid-cols-2") && element.classList.contains("sm:grid-cols-3"));

    expect(board.className).toContain("min-w-0");
    expect(summaryGrid).not.toBeNull();
    expect(progress.className).toContain("grid-cols-2");
    expect(progress.className).toContain("sm:grid-cols-4");
    expect(progress.className).toContain("lg:grid-cols-7");
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("تغطية جزئية");
    expect(screen.getByText("غير محفوظة في عقد القرار الحالي")).toBeInTheDocument();
    expect(screen.getByText(/لا تشمل هذه اللوحة كامل تاريخ القرارات/)).toBeInTheDocument();
  });
});
