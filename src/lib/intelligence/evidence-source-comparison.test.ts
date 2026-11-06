import { describe, expect, it } from "vitest";
import { buildEvidencePassport } from "./evidence-passport";
import { compareEvidenceMetricSources } from "./evidence-source-comparison";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";

const asOf = "2026-11-06T20:00:00.000Z";
const period: EvidencePeriod = { from: "2026-10-01", to: "2026-10-31" };

function metric(value: number | string | null, overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    id: "metric-main",
    key: "orders.completed",
    value,
    unit: "COUNT",
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period,
    asOf,
    lineage: {
      evidenceIds: ["evidence-1"],
      calculatedAt: "2026-11-06T20:01:00.000Z",
      formulaId: "orders.completed.count",
      formulaVersion: "1",
      transformations: ["COUNT(status=completed)"],
    },
    warnings: [],
    ...overrides,
  };
}

function passport(
  id: string,
  sourceName: string,
  value: number | string | null,
  overrides: {
    metric?: Partial<MetricSnapshot>;
    evidence?: Partial<EvidenceRecord>;
    passportAsOf?: string;
  } = {},
) {
  const passportAsOf = overrides.passportAsOf ?? asOf;
  const evidence: EvidenceRecord = {
    id: "evidence-1",
    source: { kind: "TABLE", name: sourceName, recordId: "private-record-ref", version: "v1" },
    sourceTimestamp: "2026-11-06T19:55:00.000Z",
    asOf: passportAsOf,
    period,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
    ...overrides.evidence,
  };
  return buildEvidencePassport({
    id,
    generatedAt: "2026-11-06T20:02:00.000Z",
    asOf: passportAsOf,
    evidenceRecords: [evidence],
    metrics: [metric(value, overrides.metric)],
  });
}

describe("verified evidence source comparison", () => {
  it("matches equivalent metrics and preserves source names and timestamps", () => {
    const result = compareEvidenceMetricSources({
      comparisonKey: "product:item_code:000125",
      metricKey: "orders.completed",
      left: passport("left", "operational.orders", 12),
      right: passport("right", "analytics.orders", 12),
    });
    expect(result).toMatchObject({
      status: "MATCHED",
      comparisonKey: "product:item_code:000125",
      metricKey: "orders.completed",
      difference: 0,
      differencePercent: 0,
      left: { value: 12, sources: [{ sourceName: "operational.orders" }] },
      right: { value: 12, sources: [{ sourceName: "analytics.orders" }] },
    });
    expect(result.left?.sources[0]).toMatchObject({
      sourceTimestamp: "2026-11-06T19:55:00.000Z",
      sourceAgeMilliseconds: 5 * 60 * 1000,
    });
    expect(result.left?.sources[0]).not.toHaveProperty("recordId");
  });

  it("compares identical as-of instants expressed with different UTC offsets", () => {
    const offsetAsOf = "2026-11-06T21:00:00.000+01:00";
    const result = compareEvidenceMetricSources({
      comparisonKey: "product:item_code:000125",
      metricKey: "orders.completed",
      left: passport("left", "operational.orders", 12),
      right: passport("right", "analytics.orders", 12, {
        passportAsOf: offsetAsOf,
        metric: { asOf: offsetAsOf },
        evidence: { asOf: offsetAsOf },
      }),
    });
    expect(result).toMatchObject({
      status: "MATCHED",
      difference: 0,
      differencePercent: 0,
      right: { asOf: offsetAsOf },
    });
  });

  it("still withholds difference when as-of instants genuinely differ", () => {
    const laterAsOf = "2026-11-06T20:01:00.000Z";
    const result = compareEvidenceMetricSources({
      comparisonKey: "product:item_code:000125",
      metricKey: "orders.completed",
      left: passport("left", "operational.orders", 12),
      right: passport("right", "analytics.orders", 12, {
        passportAsOf: laterAsOf,
        metric: { asOf: laterAsOf },
        evidence: { asOf: laterAsOf },
      }),
    });
    expect(result.status).toBe("NOT_COMPARABLE");
    expect(result.reasons).toContain("AS_OF_MISMATCH");
    expect(result.difference).toBeNull();
  });

  it("reports a variance without averaging or changing either source value", () => {
    const result = compareEvidenceMetricSources({
      comparisonKey: "item:SKU-001",
      metricKey: "orders.completed",
      left: passport("left", "source-a", 10),
      right: passport("right", "source-b", 14),
    });
    expect(result).toMatchObject({
      status: "VARIANCE",
      left: { value: 10 },
      right: { value: 14 },
      difference: 4,
      differencePercent: 40,
    });
    expect(result.explanation).toContain("لم يُحسب متوسط");
  });

  it("withholds differences for currency, unit, period, as-of or formula incompatibility", () => {
    const left = passport("left", "source-a", 100, {
      metric: {
        unit: "CURRENCY",
        currency: "YER",
        formulaId: "revenue.net",
        formulaVersion: "1",
      },
      evidence: { currency: "YER" },
    });
    const right = passport("right", "source-b", 50, {
      metric: {
        unit: "CURRENCY",
        currency: "USD",
        formulaId: "revenue.net",
        formulaVersion: "2",
        period: { from: "2026-09-01", to: "2026-09-30" },
      },
      evidence: {
        currency: "USD",
        period: { from: "2026-09-01", to: "2026-09-30" },
      },
    });
    const result = compareEvidenceMetricSources({
      comparisonKey: "account:receivables",
      metricKey: "orders.completed",
      left,
      right,
    });
    expect(result.status).toBe("NOT_COMPARABLE");
    expect(result.difference).toBeNull();
    expect(result.reasons).toEqual(expect.arrayContaining([
      "CURRENCY_MISMATCH",
      "PERIOD_MISSING_OR_MISMATCH",
      "FORMULA_MISMATCH",
    ]));
    expect(result.left?.value).toBe(100);
    expect(result.right?.value).toBe(50);
  });

  it("withholds comparisons when either source lacks verified complete evidence", () => {
    const right = passport("right", "source-b", 14, {
      metric: { status: "NEEDS_REVIEW", completeness: "PARTIAL" },
      evidence: { status: "NEEDS_REVIEW", completeness: "PARTIAL" },
    });
    const result = compareEvidenceMetricSources({
      comparisonKey: "product:SKU-001",
      metricKey: "orders.completed",
      left: passport("left", "source-a", 10),
      right,
    });
    expect(result.status).toBe("WITHHELD");
    expect(result.difference).toBeNull();
    expect(result.reasons).toContain("RIGHT_EVIDENCE_NOT_VERIFIED");
  });

  it("never turns an absent or non-numeric value into zero", () => {
    const result = compareEvidenceMetricSources({
      comparisonKey: "metric:count",
      metricKey: "orders.completed",
      left: passport("left", "source-a", 10),
      right: passport("right", "source-b", null),
    });
    expect(result.status).toBe("WITHHELD");
    expect(result.difference).toBeNull();
    expect(result.reasons).toContain("RIGHT_EVIDENCE_NOT_VERIFIED");
  });

  it("keeps an absolute variance when the baseline is zero and withholds only the percentage", () => {
    const result = compareEvidenceMetricSources({
      comparisonKey: "inventory:SKU-001",
      metricKey: "orders.completed",
      left: passport("left", "source-a", 0),
      right: passport("right", "source-b", 4),
    });
    expect(result).toMatchObject({
      status: "VARIANCE",
      difference: 4,
      differencePercent: null,
      reasons: ["ZERO_BASELINE_PERCENT_UNDEFINED"],
    });
  });

  it("requires an explicit comparison key and rejects a missing or ambiguous metric", () => {
    expect(compareEvidenceMetricSources({
      comparisonKey: "",
      metricKey: "orders.completed",
      left: passport("left", "source-a", 10),
      right: passport("right", "source-b", 11),
    })).toMatchObject({ status: "WITHHELD", reasons: ["COMPARISON_KEY_REQUIRED"] });
    expect(compareEvidenceMetricSources({
      comparisonKey: "order:123",
      metricKey: "orders.missing",
      left: passport("left", "source-a", 10),
      right: passport("right", "source-b", 11),
    })).toMatchObject({ status: "WITHHELD", reasons: ["LEFT_METRIC_MISSING", "RIGHT_METRIC_MISSING"] });
  });
});
