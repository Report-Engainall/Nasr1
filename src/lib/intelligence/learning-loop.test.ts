import { describe, expect, it } from "vitest";
import { evaluateDecisionLearning } from "./learning-loop";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";

const measuredAt = "2026-11-26T00:00:00.000Z";
const period: EvidencePeriod = { from: "2026-11-01", to: "2026-11-25" };

function metric(
  id: string,
  value: number | string,
  unit: MetricSnapshot["unit"] = "CURRENCY",
  options: { currency?: string; unitOfMeasure?: string; period?: EvidencePeriod | null } = {},
): MetricSnapshot {
  return {
    id,
    key: "outcome.net",
    value,
    unit,
    ...(options.currency === undefined ? {} : { currency: options.currency }),
    ...(options.unitOfMeasure === undefined ? {} : { unitOfMeasure: options.unitOfMeasure }),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: options.period === undefined ? period : options.period,
    asOf: measuredAt,
    lineage: {
      evidenceIds: ["evidence:" + id],
      calculatedAt: measuredAt,
      formulaId: "outcome.net",
      formulaVersion: "1.0.0",
      transformations: [],
    },
    warnings: [],
  };
}

function evidence(source: MetricSnapshot): EvidenceRecord {
  return {
    id: source.lineage.evidenceIds[0],
    source: { kind: "RPC", name: "test.decision_learning", version: "1.0.0" },
    sourceTimestamp: "2026-11-25T23:50:00.000Z",
    asOf: measuredAt,
    period: source.period,
    ...(source.currency ? { currency: source.currency } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

function evaluate(
  expected: MetricSnapshot,
  actual: MetricSnapshot,
  extraEvidence: EvidenceRecord[] = [],
) {
  return evaluateDecisionLearning({
    id: "learning-fixture",
    measuredAt,
    evidenceRecords: [
      ...new Map(
        [evidence(expected), evidence(actual), ...extraEvidence].map((record) => [record.id, record]),
      ).values(),
    ],
    expected,
    actual,
    expectedRuleId: "daily.sales",
    expectedRuleVersion: "1.0.0",
    currentRuleId: "daily.sales",
    currentRuleVersion: "1.1.0",
  });
}

describe("decision outcome learning precision and dimensional safety", () => {
  it("calculates decimal currency variance without binary floating-point drift", () => {
    const result = evaluate(
      metric("expected", "0.1", "CURRENCY", { currency: "YER" }),
      metric("actual", "0.3", "CURRENCY", { currency: "YER" }),
    );

    expect(result).toMatchObject({
      status: "VERIFIED",
      expectedValue: 0.1,
      actualValue: 0.3,
      variance: 0.2,
      variancePercent: 200,
      currency: "YER",
    });
  });

  it("rounds negative variance percentage to two decimal places", () => {
    const result = evaluate(
      metric("expected", "3", "CURRENCY", { currency: "USD" }),
      metric("actual", "2", "CURRENCY", { currency: "USD" }),
    );

    expect(result).toMatchObject({
      status: "VERIFIED",
      variance: -1,
      variancePercent: -33.33,
    });
  });

  it("leaves percentage undefined when the expected value is zero", () => {
    const result = evaluate(
      metric("expected", "0", "CURRENCY", { currency: "YER" }),
      metric("actual", "1.25", "CURRENCY", { currency: "YER" }),
    );

    expect(result).toMatchObject({
      status: "VERIFIED",
      variance: 1.25,
      variancePercent: null,
    });
  });

  it("withholds quantity comparisons across different units of measure", () => {
    const result = evaluate(
      metric("expected", 10, "QUANTITY", { unitOfMeasure: "EA" }),
      metric("actual", 12, "QUANTITY", { unitOfMeasure: "KG" }),
    );

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.variance).toBeNull();
    expect(result.warnings).toContain("UNIT_OF_MEASURE_MISMATCH");
  });

  it("withholds quantity comparisons when the unit of measure is missing", () => {
    const result = evaluate(
      metric("expected", 10, "QUANTITY"),
      metric("actual", 12, "QUANTITY"),
    );

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.warnings).toContain("UNIT_OF_MEASURE_MISSING");
  });

  it("withholds fractional values for count metrics", () => {
    const result = evaluate(
      metric("expected", 1, "COUNT"),
      metric("actual", 1.5, "COUNT"),
    );

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.variance).toBeNull();
    expect(result.warnings).toContain("COUNT_VALUE_NOT_INTEGER");
  });

  it("withholds values more precise than the supported six decimal places", () => {
    const result = evaluate(
      metric("expected", "1.0000001", "CURRENCY", { currency: "YER" }),
      metric("actual", "1.0000002", "CURRENCY", { currency: "YER" }),
    );

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.variance).toBeNull();
    expect(result.warnings).toContain("OUTCOME_PRECISION_UNSUPPORTED");
  });

  it("withholds otherwise valid metrics when their measurement periods differ", () => {
    const result = evaluate(
      metric("expected", "10.00", "CURRENCY", { currency: "YER" }),
      metric("actual", "11.00", "CURRENCY", {
        currency: "YER",
        period: { from: "2026-11-02", to: "2026-11-25" },
      }),
    );

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.warnings).toContain("PERIOD_MISMATCH");
    expect(result.variance).toBeNull();
  });
});


describe("decision learning strict evidence clocks", () => {
  it("rejects a measured-at timestamp with an impossible calendar day", () => {
    expect(() => evaluateDecisionLearning({
      id: "invalid-measurement-clock",
      measuredAt: "2026-02-31T00:00:00.000Z",
      evidenceRecords: [],
      expected: metric("expected", 1),
      actual: metric("actual", 2),
      expectedRuleId: "daily.sales",
      expectedRuleVersion: "1.0.0",
      currentRuleId: "daily.sales",
      currentRuleVersion: "1.1.0",
    })).toThrow();
  });

  it("withholds measured variance when source evidence has an impossible timestamp", () => {
    const expected = metric("expected", "1.00");
    const actual = metric("actual", "2.00");
    const invalidEvidence = {
      ...evidence(expected),
      sourceTimestamp: "2026-02-31T00:00:00.000Z",
    };
    const result = evaluate(expected, actual, [invalidEvidence]);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.variance).toBeNull();
    expect(result.warnings).toContain("EXPECTED_OR_ACTUAL_NOT_VERIFIED");
  });

  it("withholds measured variance when metric calculation occurred after its measurement clock", () => {
    const expected = metric("expected", "1.00");
    const actual = metric("actual", "2.00");
    const futureCalculatedMetric = {
      ...expected,
      lineage: {
        ...expected.lineage,
        calculatedAt: "2026-11-26T00:00:01.000Z",
      },
    };
    const result = evaluate(futureCalculatedMetric, actual);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.variance).toBeNull();
    expect(result.warnings).toContain("EXPECTED_OR_ACTUAL_NOT_VERIFIED");
  });

  it("withholds metrics whose reporting period contains an impossible date", () => {
    const invalidPeriod = { from: "2026-11-01", to: "2026-11-31" };
    const expected = metric("expected", "1.00", "CURRENCY", { currency: "YER", period: invalidPeriod });
    const actual = metric("actual", "2.00", "CURRENCY", { currency: "YER", period: invalidPeriod });
    const result = evaluate(expected, actual);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.variance).toBeNull();
    expect(result.warnings).toContain("EXPECTED_OR_ACTUAL_NOT_VERIFIED");
  });
});
