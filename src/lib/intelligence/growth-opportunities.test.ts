import { describe, expect, it } from "vitest";
import { buildGrowthOpportunityRadar, type GrowthOpportunitySignal } from "./growth-opportunities";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot, MetricUnit } from "./types";

const asOf = "2026-11-13T04:00:00.000Z";
const currentPeriod: EvidencePeriod = { from: "2026-08-16", to: "2026-11-13" };
const baselinePeriod: EvidencePeriod = { from: "2026-05-18", to: "2026-08-15" };

function evidence(id: string, period: EvidencePeriod = currentPeriod): EvidenceRecord {
  return {
    id,
    source: { kind: "RPC", name: "growth-radar-test-fixture", version: "1" },
    sourceTimestamp: asOf,
    asOf,
    period,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

function metric(input: {
  id: string;
  key: string;
  value: number;
  unit?: MetricUnit;
  unitOfMeasure?: string;
  period?: EvidencePeriod;
  evidenceId: string;
  formulaId?: string;
}): MetricSnapshot {
  const unit = input.unit ?? "COUNT";
  return {
    id: input.id,
    key: input.key,
    value: input.value,
    unit,
    ...(unitOfMeasureValue(unit, input.unitOfMeasure) ? { unitOfMeasure: input.unitOfMeasure } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: input.period ?? currentPeriod,
    asOf,
    lineage: {
      evidenceIds: [input.evidenceId],
      calculatedAt: asOf,
      formulaId: input.formulaId ?? input.key + ".test",
      formulaVersion: "1",
      transformations: ["deterministic test fixture"],
    },
    warnings: [],
  };
}

function unitOfMeasureValue(unit: MetricUnit, value: string | undefined): boolean {
  return (unit === "QUANTITY" || unit === "CURRENCY_PER_UNIT") && Boolean(value);
}

function build(input: {
  evidenceRecords: EvidenceRecord[];
  metrics: MetricSnapshot[];
  signals: GrowthOpportunitySignal[];
  sourceSnapshotVerified?: boolean;
}) {
  return buildGrowthOpportunityRadar({
    id: "growth-radar-test",
    generatedAt: asOf,
    asOf,
    evidenceRecords: input.evidenceRecords,
    metrics: input.metrics,
    signals: input.signals,
    sourceSnapshotVerified: input.sourceSnapshotVerified ?? true,
  });
}

describe("multi-source growth opportunity radar", () => {
  it("admits unavailable-product demand only after the minimum verified search and distinct-searcher sample", () => {
    const signal: GrowthOpportunitySignal = {
      id: "unavailable-product:rice",
      kind: "PRODUCT_UNAVAILABLE_DEMAND",
      subjectRef: "product-rice",
      subjectLabel: "أرز بسمتي",
      observedMetricId: "searches",
      sampleMetricId: "searchers",
    };
    const result = build({
      evidenceRecords: [evidence("demand")],
      metrics: [
        metric({ id: "searches", key: "storefront.unavailable_product_searches", value: 5, evidenceId: "demand" }),
        metric({ id: "searchers", key: "storefront.distinct_unavailable_product_searchers", value: 3, evidenceId: "demand" }),
      ],
      signals: [signal],
    });
    expect(result.status).toBe("VERIFIED");
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({
      kind: "PRODUCT_UNAVAILABLE_DEMAND",
      subjectRef: "product-rice",
      observedValue: 5,
      sampleSize: 3,
    });
  });

  it("withholds unavailable-product demand below either sample threshold", () => {
    const result = build({
      evidenceRecords: [evidence("demand")],
      metrics: [
        metric({ id: "searches", key: "storefront.unavailable_product_searches", value: 4, evidenceId: "demand" }),
        metric({ id: "searchers", key: "storefront.distinct_unavailable_product_searchers", value: 3, evidenceId: "demand" }),
      ],
      signals: [{
        id: "unavailable-product:rice",
        kind: "PRODUCT_UNAVAILABLE_DEMAND",
        subjectRef: "product-rice",
        observedMetricId: "searches",
        sampleMetricId: "searchers",
      }],
    });
    expect(result.opportunities).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "SAMPLE_INSUFFICIENT" }]);
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it("detects a product trend only with equal-length periods, matching UOM and five orders in both periods", () => {
    const signal: GrowthOpportunitySignal = {
      id: "product-performance:rice:EA",
      kind: "PRODUCT_PERFORMANCE_CHANGE",
      subjectRef: "product-rice",
      subjectLabel: "أرز بسمتي · EA",
      observedMetricId: "current-quantity",
      sampleMetricId: "current-orders",
      baselineMetricId: "baseline-quantity",
      baselineSampleMetricId: "baseline-orders",
    };
    const result = build({
      evidenceRecords: [evidence("current", currentPeriod), evidence("baseline", baselinePeriod)],
      metrics: [
        metric({ id: "current-quantity", key: "product.order_items.quantity", value: 6, unit: "QUANTITY", unitOfMeasure: "EA", evidenceId: "current", formulaId: "quantity.v1" }),
        metric({ id: "current-orders", key: "product.orders.sample_count", value: 5, evidenceId: "current", formulaId: "orders.v1" }),
        metric({ id: "baseline-quantity", key: "product.order_items.quantity", value: 5, unit: "QUANTITY", unitOfMeasure: "EA", period: baselinePeriod, evidenceId: "baseline", formulaId: "quantity.v1" }),
        metric({ id: "baseline-orders", key: "product.orders.sample_count", value: 5, period: baselinePeriod, evidenceId: "baseline", formulaId: "orders.v1" }),
      ],
      signals: [signal],
    });
    expect(result.opportunities).toHaveLength(1);
    expect(result.opportunities[0]).toMatchObject({ direction: "INCREASING", changePercent: 20, unitOfMeasure: "EA" });
  });

  it("withholds product trends when units differ even when the numeric periods appear comparable", () => {
    const result = build({
      evidenceRecords: [evidence("current", currentPeriod), evidence("baseline", baselinePeriod)],
      metrics: [
        metric({ id: "current-quantity", key: "product.order_items.quantity", value: 6, unit: "QUANTITY", unitOfMeasure: "EA", evidenceId: "current", formulaId: "quantity.v1" }),
        metric({ id: "current-orders", key: "product.orders.sample_count", value: 5, evidenceId: "current", formulaId: "orders.v1" }),
        metric({ id: "baseline-quantity", key: "product.order_items.quantity", value: 5, unit: "QUANTITY", unitOfMeasure: "CARTON", period: baselinePeriod, evidenceId: "baseline", formulaId: "quantity.v1" }),
        metric({ id: "baseline-orders", key: "product.orders.sample_count", value: 5, period: baselinePeriod, evidenceId: "baseline", formulaId: "orders.v1" }),
      ],
      signals: [{
        id: "product-performance:rice:EA",
        kind: "PRODUCT_PERFORMANCE_CHANGE",
        subjectRef: "product-rice",
        observedMetricId: "current-quantity",
        sampleMetricId: "current-orders",
        baselineMetricId: "baseline-quantity",
        baselineSampleMetricId: "baseline-orders",
      }],
    });
    expect(result.opportunities).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "INVALID_COMPARISON" }]);
  });

  it("prioritizes a verified major customer activity decline from equal-length periods", () => {
    const result = build({
      evidenceRecords: [evidence("current", currentPeriod), evidence("baseline", baselinePeriod)],
      metrics: [
        metric({ id: "current-orders", key: "customer.orders.current", value: 4, evidenceId: "current" }),
        metric({ id: "baseline-orders", key: "customer.orders.baseline", value: 10, period: baselinePeriod, evidenceId: "baseline" }),
      ],
      signals: [{
        id: "customer-decline:opaque-ref",
        kind: "CUSTOMER_ACTIVITY_DECLINE",
        subjectRef: "opaque-customer-ref",
        observedMetricId: "current-orders",
        sampleMetricId: "current-orders",
        baselineMetricId: "baseline-orders",
      }],
    });
    expect(result.opportunities[0]).toMatchObject({ direction: "DECLINING", changePercent: -60, priority: "P1" });
  });

  it("recognizes repeated purchases without assuming the next order or customer consent", () => {
    const result = build({
      evidenceRecords: [evidence("customer")],
      metrics: [metric({ id: "orders", key: "customer.orders.current", value: 3, evidenceId: "customer" })],
      signals: [{
        id: "repeat:opaque-ref",
        kind: "REPEAT_PURCHASE",
        subjectRef: "opaque-customer-ref",
        observedMetricId: "orders",
        sampleMetricId: "orders",
      }],
    });
    expect(result.opportunities[0]).toMatchObject({ kind: "REPEAT_PURCHASE", direction: "REPEAT", observedValue: 3 });
  });

  it("withholds metrics whose evidence lineage is missing", () => {
    const result = build({
      evidenceRecords: [],
      metrics: [metric({ id: "searches", key: "storefront.unavailable_product_searches", value: 5, evidenceId: "missing" })],
      signals: [{
        id: "unavailable-product:missing-lineage",
        kind: "PRODUCT_UNAVAILABLE_DEMAND",
        subjectRef: "product-rice",
        observedMetricId: "searches",
        sampleMetricId: "searches",
      }],
    });
    expect(result.opportunities).toHaveLength(0);
    expect(result.withheld).toMatchObject([{ reason: "METRIC_NOT_VERIFIED" }]);
  });

  it("never labels a partial source population as a fully verified radar", () => {
    const result = build({
      evidenceRecords: [evidence("demand")],
      metrics: [
        metric({ id: "searches", key: "storefront.unavailable_product_searches", value: 5, evidenceId: "demand" }),
        metric({ id: "searchers", key: "storefront.distinct_unavailable_product_searchers", value: 3, evidenceId: "demand" }),
      ],
      signals: [{
        id: "unavailable-product:partial-coverage",
        kind: "PRODUCT_UNAVAILABLE_DEMAND",
        subjectRef: "product-rice",
        observedMetricId: "searches",
        sampleMetricId: "searchers",
      }],
      sourceSnapshotVerified: false,
    });
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.warnings).toContain("SOURCE_POPULATION_INCOMPLETE");
  });

  it("rejects duplicate signal identifiers instead of counting the same opportunity twice", () => {
    const signal: GrowthOpportunitySignal = {
      id: "repeat:opaque-ref",
      kind: "REPEAT_PURCHASE",
      subjectRef: "opaque-customer-ref",
      observedMetricId: "orders",
      sampleMetricId: "orders",
    };
    const result = build({
      evidenceRecords: [evidence("customer")],
      metrics: [metric({ id: "orders", key: "customer.orders.current", value: 3, evidenceId: "customer" })],
      signals: [signal, signal],
    });
    expect(result.opportunities).toHaveLength(1);
    expect(result.withheld).toMatchObject([{ reason: "DUPLICATE_SIGNAL" }]);
  });
});
