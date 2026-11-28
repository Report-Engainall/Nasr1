import { describe, expect, it } from "vitest";
import {
  buildDecisionMemoryBook,
  buildDecisionPolicyReviewSuggestions,
  filterDecisionMemoryPrecedents,
  searchSimilarDecisionMemory,
  summarizeDecisionMemoryPrecedents,
} from "./decision-memory";
import type { DecisionMemoryMetricResult, DecisionMemorySnapshot } from "./decision-memory";
import type { DecisionOutcomeView } from "./decision-outcome-client";
import type { EvidenceRecord, MetricSnapshot } from "./types";

const generatedAt = "2026-10-06T00:00:00.000Z";
const measurementPeriod = { from: "2026-10-01", to: "2026-10-05" };

function makeOutcome(
  id: string,
  overrides: Partial<DecisionOutcomeView> = {},
): DecisionOutcomeView {
  const createdAt = "2026-10-01T00:00:00.000Z";
  return {
    id,
    candidateId: "cashflow.expected_collections:YER:2026-10-01:2026-10-05",
    ruleId: "cashflow.collection.followup",
    ruleVersion: "1.0.0",
    state: "APPROVED",
    version: 2,
    ownerProfileId: null,
    ownerLabel: "مدير المالية",
    expectedOutcome: "متابعة التحصيل المتأخر",
    reason: "وجود تحصيلات مستحقة",
    createdAt,
    updatedAt: "2026-10-02T00:00:00.000Z",
    approvedAt: "2026-10-02T00:00:00.000Z",
    assignedAt: null,
    executedAt: null,
    measuredOutcome: null,
    memorySnapshot: null,
    candidateSnapshot: null,
    eventCount: 2,
    history: [],
    ...overrides,
  };
}

function makeSnapshot(
  decisionId: string,
  overrides: Partial<DecisionMemorySnapshot> = {},
): DecisionMemorySnapshot {
  return {
    id: "snapshot-" + decisionId,
    decisionId,
    version: 1,
    capturedAt: "2026-10-05T00:00:00.000Z",
    asOf: "2026-10-01T00:00:00.000Z",
    period: measurementPeriod,
    problem: "تأخر تحصيل مستحقات العملاء",
    factsReviewed: true,
    opinions: [],
    hypotheses: [],
    facts: [],
    assumptions: [],
    alternatives: [{ id: "follow-up", label: "متابعة موثقة", rationale: null, evidenceIds: [] }],
    chosenOptionId: "follow-up",
    assumptionsReviewed: true,
    actionTaken: "إرسال متابعة موثقة وفق الإجراءات المعتمدة",
    reviewDisposition: "NOT_SCHEDULED",
    reviewAt: null,
    expectedMetric: null,
    actualMetric: null,
    lessonsReviewed: false,
    lessons: [],
    corrections: [],
    evidenceRecords: [],
    ...overrides,
  };
}

function makeEvidence(id: string, at: string, currency = "YER", status: EvidenceRecord["status"] = "VERIFIED"): EvidenceRecord {
  return {
    id,
    source: { kind: "LEDGER", name: "دفتر الأستاذ", recordId: id },
    sourceTimestamp: at,
    asOf: at,
    period: measurementPeriod,
    currency,
    status,
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

function makeMetric(
  id: string,
  value: number | string,
  at: string,
  currency = "YER",
  unit: MetricSnapshot["unit"] = "CURRENCY",
): MetricSnapshot {
  return {
    id: "metric-" + id,
    key: "cashflow.expected_collections",
    value,
    unit,
    currency,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: measurementPeriod,
    asOf: at,
    lineage: {
      evidenceIds: [id],
      calculatedAt: at,
      formulaId: "cashflow.expected-collections",
      formulaVersion: "1.0.0",
      transformations: [],
    },
    warnings: [],
  };
}

function precedentMetric(
  evidenceId: string,
  overrides: Partial<DecisionMemoryMetricResult> = {},
): DecisionMemoryMetricResult {
  return {
    metricKey: "cashflow.expected_collections",
    value: 100,
    unit: "CURRENCY",
    currency: "YER",
    unitOfMeasure: null,
    period: measurementPeriod,
    asOf: "2026-10-05T00:00:00.000Z",
    formulaId: "cashflow.expected-collections",
    formulaVersion: "1.0.0",
    evidenceIds: [evidenceId],
    ...overrides,
  };
}

function precedentSearchRecords() {
  const result = buildDecisionMemoryBook({
    generatedAt,
    outcomes: [
      makeOutcome("older-decision", { createdAt: "2026-10-01T00:00:00.000Z" }),
      makeOutcome("target-decision", { createdAt: "2026-10-03T00:00:00.000Z" }),
    ],
    snapshots: [],
  });
  const older = result.records.find(record => record.decisionId === "older-decision");
  const target = result.records.find(record => record.decisionId === "target-decision");
  if (!older || !target) throw new Error("precedent search fixtures missing");
  older.metricComparison = {
    status: "VERIFIED",
    expected: precedentMetric("older-expected"),
    actual: precedentMetric("older-actual", { value: 80 }),
    difference: -20,
    differencePercent: -20,
    reason: null,
  };
  target.metricComparison = {
    status: "VERIFIED",
    expected: precedentMetric("target-expected"),
    actual: precedentMetric("target-actual", { value: 80 }),
    difference: -20,
    differencePercent: -20,
    reason: null,
  };
  return result.records;
}

function measuredBookWithExpectedMetric(expectedMetric: MetricSnapshot) {
  const id = "decision-measured-metric-guard";
  const expectedAt = "2026-10-02T00:00:00.000Z";
  const actualAt = "2026-10-04T00:00:00.000Z";
  return buildDecisionMemoryBook({
    generatedAt,
    outcomes: [
      makeOutcome(id, {
        state: "MEASURED",
        measuredOutcome: { value: 80, currency: "YER", asOf: actualAt },
      }),
    ],
    snapshots: [
      makeSnapshot(id, {
        lessonsReviewed: true,
        lessons: ["تمت مراجعة النتيجة"],
        expectedMetric,
        actualMetric: makeMetric("actual-metric-guard", 80, actualAt),
        evidenceRecords: [
          makeEvidence("expected-metric-guard", expectedAt),
          makeEvidence("actual-metric-guard", actualAt),
        ],
      }),
    ],
  });
}

function measuredBook(currencyMismatch = false) {
  const id = "decision-measured";
  const expectedAt = "2026-10-02T00:00:00.000Z";
  const actualAt = "2026-10-04T00:00:00.000Z";
  const actualCurrency = currencyMismatch ? "USD" : "YER";
  const result = buildDecisionMemoryBook({
    generatedAt,
    outcomes: [
      makeOutcome(id, {
        state: "MEASURED",
        measuredOutcome: { value: 80, currency: actualCurrency, asOf: actualAt },
        executedAt: "2026-10-03T00:00:00.000Z",
      }),
    ],
    snapshots: [
      makeSnapshot(id, {
        lessonsReviewed: true,
        lessons: ["تحسين توقيت متابعة التحصيل"],
        expectedMetric: makeMetric("expected-ledger", 100, expectedAt),
        actualMetric: makeMetric("actual-ledger", 80, actualAt, actualCurrency),
        evidenceRecords: [
          makeEvidence("expected-ledger", expectedAt),
          makeEvidence("actual-ledger", actualAt, actualCurrency),
        ],
      }),
    ],
  });
  return result;
}

describe("decision memory evidence engine", () => {
  it("distinguishes a verified empty source from an unavailable source", () => {
    const empty = buildDecisionMemoryBook({ generatedAt, outcomes: [], snapshots: [], totalOutcomes: 0 });
    const unavailable = buildDecisionMemoryBook({ generatedAt, outcomes: [], snapshots: [], totalOutcomes: 4 });

    expect(empty.status).toBe("EMPTY");
    expect(empty.loadedCount).toBe(0);
    expect(unavailable.status).toBe("UNAVAILABLE");
    expect(unavailable.totalCount).toBe(4);
  });

  it("orders outcomes by absolute timestamp and keeps invalid clocks last", () => {
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [
        makeOutcome("earlier-offset", { createdAt: "2026-10-01T08:00:00+03:00" }),
        makeOutcome("later-utc", { createdAt: "2026-10-01T06:00:00.000Z" }),
        makeOutcome("invalid-clock", { createdAt: "2026-10-01T12:00:00" }),
      ],
      snapshots: [],
    });
    expect(result.records.map(record => record.decisionId)).toEqual([
      "later-utc", "earlier-offset", "invalid-clock",
    ]);
  });

  it("rejects generated timestamps without a timezone or with an impossible calendar date", () => {
    for (const invalidGeneratedAt of ["2026-10-06T00:00:00", "2026-02-31T00:00:00.000Z"]) {
      expect(() => buildDecisionMemoryBook({
        generatedAt: invalidGeneratedAt,
        outcomes: [],
        snapshots: [],
      })).toThrow("decision_memory_input_invalid");
    }
  });

  it.each([
    ["timezone-less capture time", "2026-10-05T00:00:00"],
    ["impossible capture date", "2026-02-31T00:00:00.000Z"],
    ["timezone-less outcome time", "2026-10-01T00:00:00"],
  ])("withholds a decision snapshot with %s", (_label, invalidTime) => {
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [makeOutcome("decision-invalid-time", { createdAt: _label === "timezone-less outcome time" ? invalidTime : "2026-10-01T00:00:00.000Z" })],
      snapshots: [makeSnapshot("decision-invalid-time", {
        capturedAt: _label === "timezone-less outcome time" ? "2026-10-05T00:00:00.000Z" : invalidTime,
      })],
    });
    expect(result.records[0].problem).toBeNull();
    expect(result.records[0].memoryStatus).toBe("PARTIAL");
    expect(result.records[0].warnings).toContain("DECISION_MEMORY_SNAPSHOT_SCOPE_INVALID");
  });

  it("withholds metric evidence whose source timestamp is timezone-less", () => {
    const id = "decision-timezone-less-evidence";
    const expectedAt = "2026-10-02T00:00:00.000Z";
    const actualAt = "2026-10-04T00:00:00.000Z";
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [makeOutcome(id, {
        state: "MEASURED",
        measuredOutcome: { value: 80, currency: "YER", asOf: actualAt },
      })],
      snapshots: [makeSnapshot(id, {
        lessonsReviewed: true,
        lessons: ["تمت مراجعة النتيجة"],
        expectedMetric: makeMetric("expected-timezone", 100, expectedAt),
        actualMetric: makeMetric("actual-timezone", 80, actualAt),
        evidenceRecords: [
          { ...makeEvidence("expected-timezone", expectedAt), sourceTimestamp: "2026-10-02T00:00:00" },
          makeEvidence("actual-timezone", actualAt),
        ],
      })],
    });
    expect(result.records[0].metricComparison.status).toBe("WITHHELD");
    expect(result.records[0].warnings).toContain("EXPECTED_METRIC_WITHHELD:EVIDENCE_NOT_VERIFIED");
  });

  it("does not search similar decisions using a timezone-less created-at timestamp", () => {
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [
        makeOutcome("older-valid-decision", { createdAt: "2026-10-01T00:00:00.000Z" }),
        makeOutcome("target-invalid-time", { createdAt: "2026-10-03T00:00:00" }),
      ],
      snapshots: [],
    });
    expect(searchSimilarDecisionMemory({
      records: result.records,
      decisionId: "target-invalid-time",
      query: "تحصيل متأخر",
    })).toEqual([]);
  });

  it("does not create policy-review suggestions for measured decisions with invalid created-at timestamps", () => {
    const result = measuredBook();
    result.records[0].createdAt = "2026-10-01T00:00:00";
    expect(buildDecisionPolicyReviewSuggestions(result.records)).toEqual([]);
  });

  it("does not call missing persistent snapshots verified decision memory", () => {
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [makeOutcome("decision-without-snapshot")],
      snapshots: [],
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.records[0].memoryStatus).toBe("UNVERIFIED");
    expect(result.records[0].missingFields).toContain("PROBLEM_CONTEXT");
    expect(result.warnings).toContain("DECISION_MEMORY_SNAPSHOT_SOURCE_NOT_AVAILABLE");
  });

  it("keeps paginated history partial until source coverage is complete", () => {
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [makeOutcome("decision-page-one")],
      snapshots: [],
      totalOutcomes: 2,
    });

    expect(result.status).toBe("PARTIAL");
    expect(result.loadedCount).toBe(1);
    expect(result.totalCount).toBe(2);
    expect(result.warnings).toContain("DECISION_HISTORY_IS_PAGINATED");
  });

  it("rejects duplicate outcome identities instead of double-counting them", () => {
    expect(() => buildDecisionMemoryBook({
      generatedAt,
      outcomes: [makeOutcome("duplicate-id"), makeOutcome("duplicate-id")],
      snapshots: [],
    })).toThrow("decision_memory_duplicate_outcome");
  });

  it("withholds ambiguous duplicate snapshots and their content", () => {
    const first = makeSnapshot("decision-duplicate-snapshot");
    const second = makeSnapshot("decision-duplicate-snapshot", {
      id: "snapshot-second-version",
      version: 2,
      problem: "محتوى مكرر لا يجوز اختياره تلقائياً",
    });
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [makeOutcome("decision-duplicate-snapshot")],
      snapshots: [first, second],
    });

    expect(result.records[0].snapshot).toBeNull();
    expect(result.records[0].problem).toBeNull();
    expect(result.records[0].memoryStatus).toBe("UNVERIFIED");
    expect(result.records[0].warnings).toContain("DUPLICATE_DECISION_MEMORY_SNAPSHOT");
  });

  it("withholds facts whose source evidence is not verified", () => {
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [makeOutcome("decision-unverified-fact")],
      snapshots: [
        makeSnapshot("decision-unverified-fact", {
          facts: [{
            id: "fact-1",
            kind: "FACT",
            text: "رصيد مستحق غير مؤكد",
            actorRole: "manager",
            recordedAt: "2026-10-02T00:00:00.000Z",
            evidenceIds: ["unverified-source"],
          }],
          evidenceRecords: [makeEvidence("unverified-source", "2026-10-02T00:00:00.000Z", "YER", "UNVERIFIED")],
        }),
      ],
    });

    expect(result.records[0].facts).toHaveLength(0);
    expect(result.records[0].withheldFacts).toBe(1);
    expect(result.records[0].missingFields).toContain("FACTS_WITH_EVIDENCE");
    expect(result.records[0].memoryStatus).toBe("PARTIAL");
  });

  it("builds a measured comparison and human-review draft only from complete evidence", () => {
    const result = measuredBook();
    const record = result.records[0];
    const suggestions = buildDecisionPolicyReviewSuggestions(result.records);

    expect(result.status).toBe("VERIFIED");
    expect(record.memoryStatus).toBe("VERIFIED");
    expect(record.metricComparison.status).toBe("VERIFIED");
    expect(record.metricComparison.difference).toBe(-20);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].status).toBe("DRAFT_REQUIRES_HUMAN_REVIEW");
    expect(suggestions[0].observations[0].evidenceIds).toEqual(["expected-ledger", "actual-ledger"]);
    expect(suggestions[0].calibration.meanSignedDifference).toBe(-20);
  });

  it("withholds numeric-looking TEXT metrics from decision measurement", () => {
    const expectedAt = "2026-10-02T00:00:00.000Z";
    const result = measuredBookWithExpectedMetric(
      makeMetric("expected-metric-guard", "100.00", expectedAt, "YER", "TEXT"),
    );
    expect(result.records[0].metricComparison.status).toBe("WITHHELD");
    expect(result.records[0].warnings).toContain("EXPECTED_METRIC_WITHHELD:METRIC_UNIT_NOT_NUMERIC");
    expect(buildDecisionPolicyReviewSuggestions(result.records)).toHaveLength(0);
  });

  it("rejects scientific-notation numeric strings in decision measurement metrics", () => {
    const expectedAt = "2026-10-02T00:00:00.000Z";
    const result = measuredBookWithExpectedMetric(
      makeMetric("expected-metric-guard", "1e3", expectedAt),
    );
    expect(result.records[0].metricComparison.status).toBe("WITHHELD");
    expect(result.records[0].warnings).toContain("EXPECTED_METRIC_WITHHELD:METRIC_VALUE_OR_EVIDENCE_INVALID");
    expect(buildDecisionPolicyReviewSuggestions(result.records)).toHaveLength(0);
  });

  it("withholds cross-currency comparisons and does not create policy-review suggestions", () => {
    const result = measuredBook(true);

    expect(result.records[0].memoryStatus).toBe("VERIFIED");
    expect(result.records[0].metricComparison.status).toBe("WITHHELD");
    expect(result.records[0].metricComparison.reason).toBe("METRIC_PERIOD_UNIT_CURRENCY_OR_FORMULA_CHANGED");
    expect(buildDecisionPolicyReviewSuggestions(result.records)).toHaveLength(0);
  });

  it("does not create review suggestions from unverified source records", () => {
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [makeOutcome("decision-unverified-measurement", {
        state: "MEASURED",
        measuredOutcome: { value: 80, currency: "YER", asOf: "2026-10-04T00:00:00.000Z" },
      })],
      snapshots: [
        makeSnapshot("decision-unverified-measurement", {
          lessonsReviewed: true,
          lessons: ["درس غير مثبت المصدر"],
          expectedMetric: makeMetric("bad-expected", 100, "2026-10-02T00:00:00.000Z"),
          actualMetric: makeMetric("bad-actual", 80, "2026-10-04T00:00:00.000Z"),
          evidenceRecords: [
            makeEvidence("bad-expected", "2026-10-02T00:00:00.000Z", "YER", "UNVERIFIED"),
            makeEvidence("bad-actual", "2026-10-04T00:00:00.000Z"),
          ],
        }),
      ],
    });

    expect(result.records[0].metricComparison.status).toBe("WITHHELD");
    expect(result.records[0].memoryStatus).toBe("PARTIAL");
    expect(buildDecisionPolicyReviewSuggestions(result.records)).toHaveLength(0);
  });

  it("calls precedents comparable only when both expected and actual metric contexts match", () => {
    const records = precedentSearchRecords();
    const matches = searchSimilarDecisionMemory({
      records,
      decisionId: "target-decision",
      query: "تحصيل متأخر",
    });

    expect(matches).toHaveLength(1);
    expect(matches[0].comparisonStatus).toBe("COMPARABLE");
    expect(matches[0].contextDifferences).toEqual([]);
  });

  it.each([
    ["currency", { currency: "USD" }, "العملة مختلفة أو غير محددة"],
    ["period", { period: { from: "2026-10-02", to: "2026-10-05" } }, "الفترة مختلفة"],
    ["formula version", { formulaVersion: "2.0.0" }, "المعادلة أو إصدارها مختلف"],
  ] as const)("withholds comparison when the prior expected baseline has a %s mismatch", (_label, override, reason) => {
    const records = precedentSearchRecords();
    const older = records.find(record => record.decisionId === "older-decision");
    if (!older) throw new Error("older precedent fixture missing");
    older.metricComparison.expected = precedentMetric("older-expected", override);

    const matches = searchSimilarDecisionMemory({
      records,
      decisionId: "target-decision",
      query: "تحصيل متأخر",
    });

    expect(matches[0].comparisonStatus).toBe("NOT_COMPARABLE");
    expect(matches[0].contextDifferences).toContain("خط الأساس المتوقع: " + reason);
  });

  it("does not call a precedent comparable when either expected metric is missing", () => {
    const records = precedentSearchRecords();
    const older = records.find(record => record.decisionId === "older-decision");
    if (!older) throw new Error("older precedent fixture missing");
    older.metricComparison.expected = null;

    const matches = searchSimilarDecisionMemory({
      records,
      decisionId: "target-decision",
      query: "تحصيل متأخر",
    });

    expect(matches[0].comparisonStatus).toBe("OUTCOME_UNVERIFIED");
    expect(matches[0].contextDifferences).toContain("خط الأساس المتوقع غير متاح في أحد القرارين");
  });

  it("summarizes and filters precedent comparison statuses without changing the matches", () => {
    const matches = searchSimilarDecisionMemory({
      records: precedentSearchRecords(),
      decisionId: "target-decision",
      query: "تحصيل متأخر",
    });
    const mixed = [
      matches[0],
      { ...matches[0], comparisonStatus: "NOT_COMPARABLE" as const },
      { ...matches[0], comparisonStatus: "OUTCOME_UNVERIFIED" as const },
      { ...matches[0], comparisonStatus: "COMPARABLE" as const },
    ];

    expect(summarizeDecisionMemoryPrecedents(mixed)).toEqual({
      total: 4,
      comparable: 2,
      notComparable: 1,
      outcomeUnverified: 1,
    });
    expect(filterDecisionMemoryPrecedents(mixed, "NOT_COMPARABLE")).toHaveLength(1);
    expect(filterDecisionMemoryPrecedents(mixed, "OUTCOME_UNVERIFIED")).toHaveLength(1);
    expect(filterDecisionMemoryPrecedents(mixed, "ALL")).toHaveLength(4);
    expect(mixed).toHaveLength(4);
  });

  it("searches only earlier decisions and rejects unbounded search inputs", () => {
    const result = buildDecisionMemoryBook({
      generatedAt,
      outcomes: [
        makeOutcome("older-decision", { createdAt: "2026-10-01T00:00:00.000Z" }),
        makeOutcome("target-decision", { createdAt: "2026-10-03T00:00:00.000Z" }),
        makeOutcome("future-decision", { createdAt: "2026-10-04T00:00:00.000Z" }),
      ],
      snapshots: [],
    });
    const matches = searchSimilarDecisionMemory({
      records: result.records,
      decisionId: "target-decision",
      query: "تحصيل متأخر",
      limit: 8,
    });

    expect(matches.map(match => match.record.decisionId)).toEqual(["older-decision"]);
    expect(() => searchSimilarDecisionMemory({
      records: result.records,
      decisionId: "target-decision",
      limit: 21,
    })).toThrow("decision_memory_search_input_invalid");
    expect(() => searchSimilarDecisionMemory({
      records: result.records,
      decisionId: "target-decision",
      query: "x".repeat(501),
    })).toThrow("decision_memory_search_input_invalid");
  });
});

describe("decision memory UTC offset ceiling", () => {
  it.each([
    ["+14:00", "2026-10-06T14:00:00.000+14:00"],
    ["-14:00", "2026-10-05T10:00:00.000-14:00"],
  ])("accepts the ISO maximum UTC offset %s", (_label, generatedAt) => {
    const result = buildDecisionMemoryBook({ generatedAt, outcomes: [], snapshots: [], totalOutcomes: 0 });
    expect(result.status).toBe("EMPTY");
  });

  it.each([
    "2026-10-06T14:00:00.000+14:01",
    "2026-10-05T10:00:00.000-14:01",
    "2026-10-06T23:59:00.000+23:59",
  ])("rejects a decision-memory clock beyond the ISO offset range: %s", generatedAt => {
    expect(() => buildDecisionMemoryBook({ generatedAt, outcomes: [], snapshots: [], totalOutcomes: 0 }))
      .toThrow("decision_memory_input_invalid");
  });
});
