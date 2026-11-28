import { describe, expect, it } from "vitest";
import type { DecisionMemoryRecord } from "@/lib/intelligence/decision-memory";
import {
  buildDailyDecisionBoardCsv,
  filterDailyDecisionRecords,
  normalizeDailyDecisionSearch,
  selectDailyDecisionBoardRows,
  splitDailyDecisionTimelineEvents,
  type DailyDecisionFilters,
} from "./DailyDecisionBoard";

const now = Date.parse("2026-11-28T00:00:00.000Z");
const allFilters: DailyDecisionFilters = {
  searchText: "",
  state: "ALL",
  priority: "ALL",
  due: "ALL",
};

function decision(overrides: Partial<DecisionMemoryRecord> = {}): DecisionMemoryRecord {
  return {
    decisionId: "decision-1",
    candidateRef: "candidate-1",
    ruleId: "customers.retention.follow-up",
    ruleVersion: "1.0.0",
    state: "PROPOSED",
    version: 1,
    createdAt: "2026-11-27T00:00:00.000Z",
    updatedAt: "2026-11-27T00:00:00.000Z",
    owner: "مسؤول العملاء",
    ownerProfileId: null,
    proposedResult: "إعادة تنشيط عميل متوقف",
    decisionReason: "متابعة نشاط العملاء",
    approvalAt: null,
    executionAt: null,
    eventCount: 1,
    events: [],
    legacyMeasurement: null,
    candidateSnapshot: {
      schemaVersion: "1.0.0",
      candidateId: "candidate-1",
      ruleId: "customers.retention.follow-up",
      ruleVersion: "1.0.0",
      priority: "P1",
      priorityScore: 300,
      what: "إعادة تنشيط العميل",
      why: "لم يظهر طلب",
      risk: "تراجع النشاط",
      soWhat: "مخاطر فقدان العميل",
      whatNext: "راجع آخر تعامل",
      owner: "مسؤول العملاء",
      expectedOutcome: "توثيق نتيجة المتابعة",
      impact: null,
      impactStatus: "WITHHELD",
      impactReason: "CUSTOMER_FINANCIAL_VALUE_NOT_AVAILABLE",
      proof: { evidenceIds: ["evidence-1"], metricKeys: ["customer.orders.current"], asOf: "2026-11-27T00:00:00.000Z", formulaVersions: ["orders@1"] },
      createdAt: "2026-11-27T00:00:00.000Z",
      expiresAt: null,
    },
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
    metricComparison: { status: "WITHHELD", expected: null, actual: null, difference: null, differencePercent: null, reason: null },
    lessons: [],
    corrections: [],
    missingFields: [],
    warnings: [],
    memoryStatus: "PARTIAL",
    precedents: [],
    ...overrides,
  } as DecisionMemoryRecord;
}

describe("daily decision queue search and filters", () => {
  it("normalizes Arabic diacritics and searches loaded decision context", () => {
    const record = decision({
      proposedResult: "إِعَادَة تَنْشِيط العميل",
      owner: "مسؤول التحصيل",
    });
    expect(normalizeDailyDecisionSearch("إِعَادَة  تَنْشِيط"))
      .toBe(normalizeDailyDecisionSearch("اعادة تنشيط"));
    expect(filterDailyDecisionRecords([record], {
      ...allFilters,
      searchText: "اعادة تنشيط",
    }, now)).toEqual([record]);
    expect(filterDailyDecisionRecords([record], {
      ...allFilters,
      searchText: "مسؤول التحصيل",
    }, now)).toEqual([record]);
  });

  it("filters by exact state and only saved priorities, preserving unranked legacy decisions", () => {
    const proposed = decision({ decisionId: "proposed", state: "PROPOSED" });
    const inReview = decision({ decisionId: "review", state: "IN_REVIEW", candidateSnapshot: null });
    const p2 = decision({
      decisionId: "p2",
      candidateSnapshot: { ...proposed.candidateSnapshot!, priority: "P2" },
    });

    expect(filterDailyDecisionRecords([proposed, inReview, p2], {
      ...allFilters,
      state: "IN_REVIEW",
    }, now).map(item => item.decisionId)).toEqual(["review"]);
    expect(filterDailyDecisionRecords([proposed, inReview, p2], {
      ...allFilters,
      priority: "P2",
    }, now).map(item => item.decisionId)).toEqual(["p2"]);
    expect(filterDailyDecisionRecords([proposed, inReview, p2], {
      ...allFilters,
      priority: "UNRANKED",
    }, now).map(item => item.decisionId)).toEqual(["review"]);
  });

  it("isolates overdue, due-within-seven-days and unscheduled non-terminal decisions", () => {
    const overdue = decision({
      decisionId: "overdue",
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-11-27T23:59:59.000Z",
    });
    const dueNow = decision({
      decisionId: "due-now",
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-11-28T00:00:00.000Z",
    });
    const upcoming = decision({
      decisionId: "upcoming",
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-12-02T00:00:00.000Z",
    });
    const tooFar = decision({
      decisionId: "too-far",
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-12-10T00:00:00.000Z",
    });
    const unscheduled = decision({ decisionId: "unscheduled", reviewDisposition: "NOT_SCHEDULED", reviewAt: null });
    const inconsistentDated = decision({ decisionId: "inconsistent-dated", reviewDisposition: "NOT_SCHEDULED", reviewAt: "2026-11-29T00:00:00.000Z" });
    const notRequired = decision({ decisionId: "not-required", reviewDisposition: "NOT_REQUIRED", reviewAt: null });
    const rejected = decision({ decisionId: "rejected", state: "REJECTED", reviewDisposition: "SCHEDULED", reviewAt: "2026-11-27T00:00:00.000Z" });
    const measured = decision({ decisionId: "measured", state: "MEASURED", reviewDisposition: "SCHEDULED", reviewAt: "2026-11-27T00:00:00.000Z" });
    const records = [overdue, dueNow, upcoming, tooFar, unscheduled, inconsistentDated, notRequired, rejected, measured];

    expect(filterDailyDecisionRecords(records, { ...allFilters, due: "OVERDUE" }, now)
      .map(item => item.decisionId)).toEqual(["overdue", "due-now"]);
    expect(filterDailyDecisionRecords(records, { ...allFilters, due: "DUE_7_DAYS" }, now)
      .map(item => item.decisionId)).toEqual(["upcoming"]);
    expect(filterDailyDecisionRecords(records, { ...allFilters, due: "UNSCHEDULED" }, now)
      .map(item => item.decisionId)).toEqual(["unscheduled"]);
  });

  it("filters the entire loaded population before selecting the top ten visible cards", () => {
    const firstTen = Array.from({ length: 10 }, (_, index) => decision({
      decisionId: "top-" + index,
      proposedResult: "قرار أولوية قصوى " + index,
      candidateSnapshot: {
        ...decision().candidateSnapshot!,
        priority: "P0",
        priorityScore: 400,
      },
    }));
    const eleventh = decision({
      decisionId: "eleventh",
      proposedResult: "مراجعة خاصة لمورد متأخر",
      candidateSnapshot: {
        ...decision().candidateSnapshot!,
        priority: "P3",
        priorityScore: 100,
      },
    });

    const defaultSelection = selectDailyDecisionBoardRows([...firstTen, eleventh], allFilters, now);
    expect(defaultSelection.records).toHaveLength(10);
    expect(defaultSelection.matchedCount).toBe(11);
    expect(defaultSelection.omittedCount).toBe(1);
    expect(defaultSelection.records.some(item => item.decisionId === "eleventh")).toBe(false);

    const searchedSelection = selectDailyDecisionBoardRows([...firstTen, eleventh], {
      ...allFilters,
      searchText: "مورد متأخر",
    }, now);
    expect(searchedSelection.records.map(item => item.decisionId)).toEqual(["eleventh"]);
    expect(searchedSelection.matchedCount).toBe(1);
    expect(searchedSelection.omittedCount).toBe(0);
  });

  it("keeps the newest eight timeline events visible and preserves older events for expansion", () => {
    const events = Array.from({ length: 12 }, (_, index) => ({
      id: "event-" + (index + 1),
      type: "DEFER",
      version: index + 1,
      at: "2026-11-" + String(index + 1).padStart(2, "0") + "T00:00:00.000Z",
      actorRole: "manager",
      reason: "سبب " + (index + 1),
    }));
    const timeline = splitDailyDecisionTimelineEvents(events);

    expect(timeline.earlier.map(event => event.id)).toEqual([
      "event-1", "event-2", "event-3", "event-4",
    ]);
    expect(timeline.recent.map(event => event.id)).toEqual([
      "event-5", "event-6", "event-7", "event-8",
      "event-9", "event-10", "event-11", "event-12",
    ]);
    expect(splitDailyDecisionTimelineEvents(events, 0).recent).toHaveLength(8);
  });

  it("exports all filtered decision evidence with formula protection and a partial-source notice", () => {
    const recordWithEvidence = decision({
      decisionId: "=HYPERLINK(\"https://example.invalid\")",
      decisionReason: "=SUM(1,2)",
      metricComparison: {
        status: "VERIFIED",
        expected: {
          metricKey: "cashflow.expected_collections",
          value: 15,
          unit: "CURRENCY",
          currency: "YER",
          unitOfMeasure: null,
          period: { from: "2026-11-01", to: "2026-11-07" },
          asOf: "2026-11-08T00:00:00.000Z",
          formulaId: "receivables",
          formulaVersion: "1",
          evidenceIds: ["expected-evidence"],
        },
        actual: {
          metricKey: "cashflow.expected_collections",
          value: 12,
          unit: "CURRENCY",
          currency: "YER",
          unitOfMeasure: null,
          period: { from: "2026-11-01", to: "2026-11-07" },
          asOf: "2026-11-15T00:00:00.000Z",
          formulaId: "receivables",
          formulaVersion: "1",
          evidenceIds: ["actual-evidence"],
        },
        difference: -3,
        differencePercent: -20,
        reason: null,
      },
      facts: [{
        id: "fact-1", kind: "FACT", text: "فاتورة مستحقة",
        actorRole: "manager", recordedAt: "2026-11-08T00:00:00.000Z",
        evidenceIds: ["invoice-1"],
      }],
    });
    const csv = buildDailyDecisionBoardCsv({
      records: [recordWithEvidence],
      loadedCount: 1,
      totalCount: 4,
    });

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'=SUM(1,2)");
    expect(csv).toContain(",15,");
    expect(csv).toContain(",12,");
    expect(csv).toContain("expected-evidence");
    expect(csv).toContain("actual-evidence");
    expect(csv).toContain("invoice-1");
    expect(csv).toContain("نطاق جزئي: 1 من 4 قراراً محمّلاً");
    expect(() => buildDailyDecisionBoardCsv({
      records: [recordWithEvidence],
      loadedCount: 2,
      totalCount: 1,
    })).toThrow("daily_decision_export_invalid");
  });

  it("searches evidence references and event reasons without treating hypotheses as facts", () => {
    const record = decision({
      facts: [{ id: "fact-1", kind: "FACT", text: "طلب موثق", actorRole: "manager", recordedAt: "2026-11-27T00:00:00.000Z", evidenceIds: ["invoice-proof"] }],
      events: [{ id: "event-1", type: "DEFER", version: 2, at: "2026-11-27T00:00:00.000Z", actorRole: "manager", reason: "بانتظار مراجعة المستند" }],
      hypotheses: [{ id: "hyp-1", kind: "HYPOTHESIS", text: "قد يتأخر العميل", actorRole: "manager", recordedAt: "2026-11-27T00:00:00.000Z", evidenceIds: [] }],
    });
    expect(filterDailyDecisionRecords([record], { ...allFilters, searchText: "invoice-proof" }, now)).toEqual([record]);
    expect(filterDailyDecisionRecords([record], { ...allFilters, searchText: "بانتظار مراجعة المستند" }, now)).toEqual([record]);
    expect(filterDailyDecisionRecords([record], { ...allFilters, searchText: "قد يتأخر العميل" }, now)).toEqual([record]);
  });
});
