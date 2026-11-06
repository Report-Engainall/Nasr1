import { describe, expect, it } from "vitest";
import {
  buildDecisionPolicyReviewSuggestions,
  searchSimilarDecisionMemory,
  type DecisionMemoryMetricResult,
  type DecisionMemoryRecord,
} from "./decision-memory";

const metric = (
  overrides: Partial<DecisionMemoryMetricResult> = {},
): DecisionMemoryMetricResult => ({
  metricKey: "inventory.stockout_events",
  value: 4,
  unit: "COUNT",
  currency: null,
  unitOfMeasure: null,
  period: { from: "2026-10-01", to: "2026-10-31" },
  asOf: "2026-10-31T23:00:00.000Z",
  formulaId: "nasr1.inventory.stockout-events",
  formulaVersion: "1",
  evidenceIds: ["movement:one"],
  ...overrides,
});

function decision(overrides: Partial<DecisionMemoryRecord> = {}): DecisionMemoryRecord {
  const expected = metric({ value: 10 });
  const actual = metric({ value: 4 });
  return {
    decisionId: "decision-target",
    candidateRef: "inventory.stockout:warehouse-a",
    ruleId: "inventory.replenishment",
    ruleVersion: "2",
    state: "MEASURED",
    version: 3,
    createdAt: "2026-11-10T10:00:00.000Z",
    updatedAt: "2026-11-10T11:00:00.000Z",
    owner: "الإدارة",
    ownerProfileId: null,
    proposedResult: "مراجعة نقص مخزون الأصناف",
    decisionReason: "تكرار نفاد المخزون قبل موعد إعادة الطلب",
    approvalAt: "2026-11-10T10:10:00.000Z",
    executionAt: "2026-11-10T10:20:00.000Z",
    eventCount: 3,
    events: [],
    legacyMeasurement: null,
    snapshotVersion: 1,
    capturedAt: "2026-11-10T09:00:00.000Z",
    snapshot: null,
    problem: "نقص مخزون الأصناف في المستودع",
    factsReviewed: true,
    facts: [],
    opinions: [],
    hypotheses: [],
    assumptionsReviewed: true,
    assumptions: [],
    lessonsReviewed: true,
    withheldFacts: 0,
    alternatives: [],
    chosenAlternative: null,
    actionTaken: "تفعيل مراجعة حد إعادة الطلب",
    reviewDisposition: "NOT_REQUIRED",
    reviewAt: null,
    expectedMetric: expected,
    metricComparison: {
      status: "VERIFIED",
      expected,
      actual,
      difference: -6,
      differencePercent: -60,
      reason: null,
    },
    lessons: ["مراجعة حد إعادة الطلب"],
    corrections: [],
    missingFields: [],
    warnings: [],
    memoryStatus: "VERIFIED",
    precedents: [],
    ...overrides,
  };
}

describe("decision memory precedent search", () => {
  it("finds older decisions from shared Arabic context and excludes the current and future records", () => {
    const prior = decision({
      decisionId: "decision-prior",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-02T10:00:00.000Z",
      problem: "تكرار نقص مخزون الأصناف",
      proposedResult: "رفع حد إعادة الطلب",
    });
    const future = decision({
      decisionId: "decision-future",
      createdAt: "2026-11-20T10:00:00.000Z",
      problem: "نقص مخزون الأصناف",
    });
    const result = searchSimilarDecisionMemory({
      records: [future, prior, decision()],
      decisionId: "decision-target",
      query: "مخزون الأصناف",
    });
    expect(result.map(item => item.record.decisionId)).toEqual(["decision-prior"]);
    expect(result[0].matchedTerms).toEqual(expect.arrayContaining(["مخزون", "الاصناف"]));
    expect(result[0].matchReasons).toContain("نفس قاعدة القرار");
  });

  it("ranks same-rule precedents before weaker text-only matches", () => {
    const sameRule = decision({
      decisionId: "same-rule",
      createdAt: "2026-10-03T10:00:00.000Z",
      problem: "نفاد المخزون",
    });
    const textOnly = decision({
      decisionId: "text-only",
      ruleId: "inventory.other-rule",
      createdAt: "2026-10-04T10:00:00.000Z",
      problem: "نفاد المخزون",
    });
    const result = searchSimilarDecisionMemory({
      records: [textOnly, sameRule, decision()],
      decisionId: "decision-target",
    });
    expect(result.map(item => item.record.decisionId)).toEqual(["same-rule", "text-only"]);
  });

  it("marks different currency, period or formula outcomes as not comparable", () => {
    const prior = decision({
      decisionId: "different-context",
      createdAt: "2026-10-01T10:00:00.000Z",
      metricComparison: {
        status: "VERIFIED",
        expected: metric({ currency: "YER", period: { from: "2026-09-01", to: "2026-09-30" } }),
        actual: metric({
          currency: "USD",
          period: { from: "2026-09-01", to: "2026-09-30" },
          formulaVersion: "2",
        }),
        difference: 0,
        differencePercent: 0,
        reason: null,
      },
    });
    const result = searchSimilarDecisionMemory({
      records: [prior, decision()],
      decisionId: "decision-target",
      query: "نقص مخزون",
    });
    expect(result[0].comparisonStatus).toBe("NOT_COMPARABLE");
    expect(result[0].contextDifferences).toEqual(expect.arrayContaining([
      "النتيجة الفعلية: العملة مختلفة أو غير محددة",
      "النتيجة الفعلية: الفترة مختلفة",
      "النتيجة الفعلية: المعادلة أو إصدارها مختلف",
    ]));
  });

  it("withholds comparability when either decision lacks a verified actual metric", () => {
    const prior = decision({
      decisionId: "unmeasured-prior",
      createdAt: "2026-10-01T10:00:00.000Z",
      state: "EXECUTED",
      metricComparison: {
        status: "WITHHELD",
        expected: metric(),
        actual: null,
        difference: null,
        differencePercent: null,
        reason: "ACTUAL_METRIC_MISSING",
      },
    });
    const result = searchSimilarDecisionMemory({
      records: [prior, decision()],
      decisionId: "decision-target",
    });
    expect(result[0].comparisonStatus).toBe("OUTCOME_UNVERIFIED");
    expect(result[0].contextDifferences[0]).toContain("النتيجة الفعلية الموثقة غير متاحة");
  });

  it("rejects unbounded or invalid search input", () => {
    expect(() => searchSimilarDecisionMemory({
      records: [decision()],
      decisionId: "decision-target",
      query: "x".repeat(501),
    })).toThrow("decision_memory_search_input_invalid");
    expect(() => searchSimilarDecisionMemory({
      records: [decision()],
      decisionId: "decision-target",
      limit: 1000,
    })).toThrow("decision_memory_search_input_invalid");
  });
  it("creates review-only rule suggestions from verified measured lessons", () => {
    const result = buildDecisionPolicyReviewSuggestions([
      decision({ decisionId: "measured-one", lessons: ["تعديل نقطة إعادة الطلب بعد مراجعة الدليل"] }),
      decision({
        decisionId: "measured-two",
        createdAt: "2026-11-12T10:00:00.000Z",
        lessons: ["مراجعة فترة التوريد"],
        metricComparison: {
          status: "VERIFIED",
          expected: metric({ value: 12, evidenceIds: ["invoice:two"] }),
          actual: metric({ value: 7, evidenceIds: ["movement:two"] }),
          difference: -5,
          differencePercent: -41.67,
          reason: null,
        },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      ruleId: "inventory.replenishment",
      ruleVersion: "2",
      status: "DRAFT_REQUIRES_HUMAN_REVIEW",
      observations: [{ decisionId: "measured-two" }, { decisionId: "measured-one" }],
    });
    expect(result[0].lessons).toEqual(expect.arrayContaining([
      "تعديل نقطة إعادة الطلب بعد مراجعة الدليل",
      "مراجعة فترة التوريد",
    ]));
    expect(result[0].evidenceIds).toEqual(expect.arrayContaining(["invoice:two", "movement:two"]));
    expect(result[0].reviewInstruction).toContain("لا يغيّر هذا الاقتراح القاعدة");
  });

  it("summarizes measured calibration without assigning good or bad direction", () => {
    const zeroBaseline = metric({ value: 0, evidenceIds: ["invoice:zero"] });
    const result = buildDecisionPolicyReviewSuggestions([
      decision({ decisionId: "sample-one" }),
      decision({
        decisionId: "sample-two",
        metricComparison: {
          status: "VERIFIED",
          expected: metric({ value: 12, evidenceIds: ["invoice:two"] }),
          actual: metric({ value: 7, evidenceIds: ["movement:two"] }),
          difference: -5,
          differencePercent: -41.67,
          reason: null,
        },
      }),
      decision({
        decisionId: "sample-three",
        metricComparison: {
          status: "VERIFIED",
          expected: metric({ value: 8, evidenceIds: ["invoice:three"] }),
          actual: metric({ value: 10, evidenceIds: ["movement:three"] }),
          difference: 2,
          differencePercent: 25,
          reason: null,
        },
      }),
      decision({
        decisionId: "sample-zero-baseline",
        metricComparison: {
          status: "VERIFIED",
          expected: zeroBaseline,
          actual: metric({ value: 3, evidenceIds: ["movement:zero"] }),
          difference: 3,
          differencePercent: null,
          reason: "ZERO_BASELINE_PERCENT_WITHHELD",
        },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].calibration).toMatchObject({
      sampleCount: 4,
      meanExpectedValue: 7.5,
      meanActualValue: 6,
      meanSignedDifference: -1.5,
      medianSignedDifference: -1.5,
      meanAbsoluteDifference: 4,
      percentageSampleCount: 3,
      zeroBaselineCount: 1,
      aboveExpectedCount: 2,
      belowExpectedCount: 2,
      equalExpectedCount: 0,
    });
    expect(result[0].calibration.meanAbsoluteDifferencePercent).toBeCloseTo((60 + 41.67 + 25) / 3, 8);
    expect(result[0].reviewInstruction).toContain("لا تثبت جودة القرار أو سببيته");
  });

  it("withholds a review sample if supplied variance does not reconcile to expected and actual", () => {
    const inconsistent = decision({
      metricComparison: {
        status: "VERIFIED",
        expected: metric({ value: 10 }),
        actual: metric({ value: 4 }),
        difference: -4,
        differencePercent: -40,
        reason: null,
      },
    });
    expect(buildDecisionPolicyReviewSuggestions([inconsistent])).toEqual([]);
  });

  it("does not overflow calibration means or medians for bounded finite samples", () => {
    const max = Number.MAX_SAFE_INTEGER;
    const result = buildDecisionPolicyReviewSuggestions([
      decision({
        decisionId: "large-positive",
        metricComparison: {
          status: "VERIFIED",
          expected: metric({ value: -max, evidenceIds: ["e1"] }),
          actual: metric({ value: 0, evidenceIds: ["a1"] }),
          difference: max,
          differencePercent: 100,
          reason: null,
        },
      }),
      decision({
        decisionId: "large-negative",
        metricComparison: {
          status: "VERIFIED",
          expected: metric({ value: max, evidenceIds: ["e2"] }),
          actual: metric({ value: 0, evidenceIds: ["a2"] }),
          difference: -max,
          differencePercent: -100,
          reason: null,
        },
      }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].calibration.meanSignedDifference).toBe(0);
    expect(result[0].calibration.medianSignedDifference).toBe(0);
    expect(result[0].calibration.meanAbsoluteDifference).toBe(max);
  });

  it("keeps suggestions separate when rule version or metric context changes", () => {
    const differentRuleVersion = decision({
      decisionId: "rule-version-three",
      ruleVersion: "3",
    });
    const differentFormula = decision({
      decisionId: "other-formula",
      metricComparison: {
        status: "VERIFIED",
        expected: metric({ formulaId: "inventory.stockout-events.v2", formulaVersion: "2" }),
        actual: metric({ formulaId: "inventory.stockout-events.v2", formulaVersion: "2" }),
        difference: 0,
        differencePercent: 0,
        reason: null,
      },
    });
    const result = buildDecisionPolicyReviewSuggestions([
      decision(),
      differentRuleVersion,
      differentFormula,
    ]);
    expect(result).toHaveLength(3);
  });

  it("withholds suggestions for unmeasured, partial, unreviewed or unsupported outcomes", () => {
    const records = [
      decision({ decisionId: "partial", memoryStatus: "PARTIAL" }),
      decision({ decisionId: "not-measured", state: "EXECUTED" }),
      decision({ decisionId: "lessons-unreviewed", lessonsReviewed: false }),
      decision({
        decisionId: "no-evidence",
        metricComparison: {
          status: "VERIFIED",
          expected: metric({ evidenceIds: [] }),
          actual: metric(),
          difference: -6,
          differencePercent: -60,
          reason: null,
        },
      }),
      decision({
        decisionId: "context-mismatch",
        metricComparison: {
          status: "VERIFIED",
          expected: metric({ currency: "YER" }),
          actual: metric({ currency: "USD" }),
          difference: -6,
          differencePercent: -60,
          reason: null,
        },
      }),
    ];
    expect(buildDecisionPolicyReviewSuggestions(records)).toEqual([]);
  });
});
