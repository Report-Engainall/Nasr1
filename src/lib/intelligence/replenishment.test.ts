import { describe, expect, it } from "vitest";
import { buildReplenishmentRecommendations, type ReplenishmentProductInput } from "./replenishment";
import type { DemandForecastResult } from "./demand-forecast";
import type { EvidenceRecord, EvidencePeriod, MetricSnapshot } from "./types";

const asOf = "2026-11-26T00:00:00.000Z";
const period: EvidencePeriod = { from: "2026-11-01", to: "2026-11-10" };

function metric(
  id: string,
  value: number | string,
  unit: MetricSnapshot["unit"],
  metricPeriod: EvidencePeriod | null = null,
  unitOfMeasure?: string,
): MetricSnapshot {
  return {
    id,
    key: "inventory." + id,
    value,
    unit,
    ...(unit === "QUANTITY" ? { unitOfMeasure: unitOfMeasure ?? "EA" } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: metricPeriod,
    asOf,
    lineage: {
      evidenceIds: ["evidence:" + id],
      calculatedAt: asOf,
      formulaId: "fixture." + id,
      formulaVersion: "1.0.0",
      transformations: [],
    },
    warnings: [],
  };
}

function product(
  ref: string,
  options: {
    available?: number | string;
    reorderPoint?: number | string;
    sold?: number | string;
    leadDays?: number | string;
    incoming?: number | string;
    minimum?: number | string;
    multiple?: number | string;
    quantityUnit?: string;
    soldPeriod?: EvidencePeriod | null;
    soldUnit?: string;
  } = {},
): ReplenishmentProductInput {
  const prefix = ref || "missing-product";
  return {
    productRef: ref,
    quantityUnit: options.quantityUnit ?? "EA",
    availableToPromise: metric(prefix + ":available", options.available ?? 10, "QUANTITY"),
    reorderPoint: metric(prefix + ":reorder", options.reorderPoint ?? 25, "QUANTITY"),
    soldQuantityWindow: metric(prefix + ":sold", options.sold ?? 100, "QUANTITY", options.soldPeriod ?? period, options.soldUnit),
    supplierLeadTimeDays: metric(prefix + ":lead", options.leadDays ?? 3, "DAYS"),
    incomingPurchaseQuantity: metric(prefix + ":incoming", options.incoming ?? 5, "QUANTITY"),
    ...(options.minimum === undefined ? {} : { minimumOrderQuantity: metric(prefix + ":minimum", options.minimum, "QUANTITY") }),
    ...(options.multiple === undefined ? {} : { orderMultiple: metric(prefix + ":multiple", options.multiple, "QUANTITY") }),
  };
}

function evidenceFor(metricValue: MetricSnapshot): EvidenceRecord {
  return {
    id: metricValue.lineage.evidenceIds[0],
    source: { kind: "RPC", name: "test.inventory_replenishment", version: "1.0.0" },
    sourceTimestamp: "2026-11-25T23:59:00.000Z",
    asOf,
    period: metricValue.period,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

function build(
  products: ReplenishmentProductInput[],
  options: { period?: EvidencePeriod; omitEvidence?: boolean; asOf?: string; demandForecast?: DemandForecastResult | null } = {},
) {
  const metrics = products.flatMap((item) => [
    item.availableToPromise,
    item.reorderPoint,
    item.soldQuantityWindow,
    item.supplierLeadTimeDays,
    item.incomingPurchaseQuantity,
    ...(item.minimumOrderQuantity ? [item.minimumOrderQuantity] : []),
    ...(item.orderMultiple ? [item.orderMultiple] : []),
  ]);
  return buildReplenishmentRecommendations({
    id: "replenishment-fixture",
    asOf: options.asOf ?? asOf,
    period: options.period ?? period,
    evidenceRecords: options.omitEvidence ? [] : metrics.map(evidenceFor),
    products,
    demandForecast: options.demandForecast,
  });
}

describe("replenishment recommendation engine", () => {
  it("calculates lead-time demand and subtracts available plus confirmed incoming stock", () => {
    const result = build([product("p-1")]);
    expect(result.recommendations[0]).toMatchObject({
      productRef: "p-1",
      status: "VERIFIED",
      action: "RECOMMEND",
      quantityUnit: "EA",
      availableToPromise: 10,
      incomingPurchaseQuantity: 5,
      coveredAfterIncoming: 15,
      dailyDemand: 10,
      leadTimeDemand: 30,
      targetStock: 30,
      recommendedQuantity: 15,
      automaticPurchase: false,
    });
  });

  it("does not recommend a purchase when available and confirmed incoming stock cover the target", () => {
    const result = build([product("p-2", { available: 20, incoming: 15 })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "VERIFIED",
      action: "NO_ACTION",
      coveredAfterIncoming: 35,
      targetStock: 30,
      recommendedQuantity: 0,
      automaticPurchase: false,
    });
  });

  it("respects a verified minimum order quantity", () => {
    const result = build([product("p-3", { incoming: 15, minimum: 12 })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "VERIFIED",
      action: "RECOMMEND",
      recommendedQuantity: 12,
    });
  });

  it("rounds a recommendation upward to a verified order multiple", () => {
    const result = build([product("p-4", { available: 10, incoming: 6, multiple: 5 })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "VERIFIED",
      recommendedQuantity: 15,
    });
  });

  it("withholds recommendations when the source quantity unit differs from the product unit", () => {
    const result = build([product("p-5", { soldUnit: "KG" })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "UNVERIFIED",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
    expect(result.recommendations[0].warnings).toContain("QUANTITY_UOM_MISMATCH");
  });

  it("withholds recommendations when the sales window differs from the requested period", () => {
    const result = build([product("p-6", {
      soldPeriod: { from: "2026-10-20", to: "2026-10-29" },
    })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
  });

  it("does not calculate from evidence that is missing", () => {
    const result = build([product("p-7")], { omitEvidence: true });
    expect(result.recommendations[0]).toMatchObject({
      status: "UNVERIFIED",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
  });

  it("withholds products with duplicate references rather than emitting duplicate purchase advice", () => {
    const result = build([product("p-8"), product(" p-8 ")]);
    expect(result.recommendations).toHaveLength(2);
    expect(result.recommendations.every((item) =>
      item.status === "UNVERIFIED" &&
      item.action === "WITHHELD" &&
      item.recommendedQuantity === null &&
      item.warnings.includes("DUPLICATE_PRODUCT_REFERENCE")
    )).toBe(true);
  });

  it("withholds a missing product reference", () => {
    const result = build([product(" ")]);
    expect(result.recommendations[0]).toMatchObject({
      productRef: "",
      status: "UNVERIFIED",
      action: "WITHHELD",
      recommendedQuantity: null,
      warnings: ["PRODUCT_REFERENCE_MISSING"],
    });
  });

  it("rejects impossible calendar dates instead of normalizing them into another period", () => {
    expect(() => build([product("p-9")], {
      period: { from: "2026-02-31", to: "2026-03-10" },
    })).toThrow("invalid or incomplete period");
  });

  it("rejects reversed periods", () => {
    expect(() => build([product("p-10")], {
      period: { from: "2026-11-10", to: "2026-11-01" },
    })).toThrow("invalid or incomplete period");
  });

  it("rejects a reporting window that has not completed by the snapshot time", () => {
    expect(() => build([product("p-11")], {
      period: { from: "2026-11-20", to: "2026-11-27" },
    })).toThrow("invalid or incomplete period");
  });

  it("requires an explicit timezone on the snapshot instant", () => {
    expect(() => build([product("p-12")], {
      asOf: "2026-11-26T00:00:00",
    })).toThrow("asOf must be valid");
  });

  it("withholds a zero minimum-order quantity instead of silently ignoring it", () => {
    const result = build([product("p-13", { minimum: 0 })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
    expect(result.recommendations[0].warnings).toContain("MINIMUM_ORDER_QUANTITY_MUST_BE_POSITIVE");
  });

  it("withholds a zero order multiple instead of silently disabling its constraint", () => {
    const result = build([product("p-14", { multiple: 0 })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
    expect(result.recommendations[0].warnings).toContain("ORDER_MULTIPLE_MUST_BE_POSITIVE");
  });

  it("withholds negative incoming stock instead of increasing the purchase recommendation", () => {
    const result = build([product("p-15", { incoming: -4 })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
  });

  it("withholds negative supplier lead time instead of treating it as zero demand", () => {
    const result = build([product("p-16", { leadDays: -2 })]);
    expect(result.recommendations[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
  });
});


describe("replenishment snapshot calculation clock", () => {
  it("withholds a recommendation when a required metric was calculated after the snapshot", () => {
    const item = product("p-17");
    item.availableToPromise = {
      ...item.availableToPromise,
      lineage: {
        ...item.availableToPromise.lineage,
        calculatedAt: "2026-11-26T00:00:00.001Z",
      },
    };

    const result = build([item]);
    expect(result.recommendations[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
    expect(result.recommendations[0].warnings).toContain("METRIC_CALCULATED_AFTER_SNAPSHOT");
  });

  it("accepts a required metric calculated exactly at the snapshot boundary", () => {
    const item = product("p-18");
    item.availableToPromise = {
      ...item.availableToPromise,
      lineage: {
        ...item.availableToPromise.lineage,
        calculatedAt: asOf,
      },
    };

    const result = build([item]);
    expect(result.recommendations[0]).toMatchObject({
      status: "VERIFIED",
      action: "RECOMMEND",
    });
  });

  it("withholds a recommendation when a metric calculation timestamp has no timezone", () => {
    const item = product("p-19");
    item.soldQuantityWindow = {
      ...item.soldQuantityWindow,
      lineage: {
        ...item.soldQuantityWindow.lineage,
        calculatedAt: "2026-11-26T00:00:00",
      },
    };

    const result = build([item]);
    expect(result.recommendations[0]).toMatchObject({
      status: "NEEDS_REVIEW",
      action: "WITHHELD",
      recommendedQuantity: null,
    });
    expect(result.recommendations[0].warnings).toContain("METRIC_CALCULATION_TIMESTAMP_INVALID");
  });
});

describe("replenishment UTC offset ceiling", () => {
  it.each([
    ["+14:00", "2026-11-26T14:00:00.000+14:00"],
    ["-14:00", "2026-11-25T10:00:00.000-14:00"],
  ])("accepts the ISO maximum UTC offset %s", (_label, asOf) => {
    const result = build([], { asOf });
    expect(result.asOf).toBe(asOf);
  });

  it.each([
    "2026-11-26T14:00:00.000+14:01",
    "2026-11-25T10:00:00.000-14:01",
    "2026-11-26T23:59:00.000+23:59",
  ])("rejects a replenishment snapshot clock beyond the ISO offset range: %s", asOf => {
    expect(() => build([], { asOf })).toThrow("asOf must be valid");
  });
});


describe("verified demand forecast in replenishment calculations", () => {
  const forecastPeriod: EvidencePeriod = { from: "2026-11-01", to: "2026-11-10" };
  const baselinePeriod: EvidencePeriod = { from: "2026-10-22", to: "2026-10-31" };
  const demandForecast: DemandForecastResult = {
    id: "demand-forecast-fixture", asOf, status: "VERIFIED", completePopulation: true,
    period: forecastPeriod, baselinePeriod,
    forecasts: [{
      productRef: "forecast-product", productLabel: "Forecast product", unitOfMeasure: "EA",
      trend: "INCREASING", currentDailyDemand: 20, baselineDailyDemand: 10,
      changePercentHundredths: 10000, currentOrders: 10, baselineOrders: 8,
      horizons: [
        { days: 7, lowQuantity: 70, expectedQuantity: 140, highQuantity: 140 },
        { days: 30, lowQuantity: 300, expectedQuantity: 600, highQuantity: 600 },
        { days: 90, lowQuantity: 900, expectedQuantity: 1800, highQuantity: 1800 },
      ],
      period: forecastPeriod, baselinePeriod, asOf,
      evidenceIds: ["forecast-current-evidence", "forecast-baseline-evidence"],
      metricKeys: ["product.order_items.quantity", "product.orders.sample_count"],
      formulaVersions: ["product.quantity@1.0.0", "product.sample@1.0.0"],
      warnings: [],
    }],
    withheld: [], warnings: [],
  };

  it("uses the aligned 30-day forecast projection for a 12-day supplier lead time", () => {
    const result = build([product("forecast-product", { leadDays: 12 })], { period: forecastPeriod, demandForecast });
    expect(result.recommendations[0]).toMatchObject({
      status: "VERIFIED", action: "RECOMMEND", demandSource: "FORECAST", demandTrend: "INCREASING",
      dailyDemand: 20, leadTimeDemand: 240,
      forecastLeadTimeDemand: { horizonDays: 30, lowQuantity: 120, expectedQuantity: 240, highQuantity: 240 },
      targetStock: 240, coveredAfterIncoming: 15, recommendedQuantity: 225,
      forecastEvidenceIds: ["forecast-current-evidence", "forecast-baseline-evidence"],
      forecastMetricKeys: ["product.order_items.quantity", "product.orders.sample_count"],
    });
    expect(result.recommendations[0].evidenceIds).toContain("forecast-current-evidence");
  });

  it.each([
    ["partial forecast", { ...demandForecast, status: "NEEDS_REVIEW" as const }],
    ["incomplete population", { ...demandForecast, completePopulation: false }],
    ["different snapshot", { ...demandForecast, asOf: "2026-11-26T00:00:00.001Z" }],
    ["different period", { ...demandForecast, period: { from: "2026-10-31", to: "2026-11-09" } }],
  ])("falls back to the historical formula for %s", (_label, rejectedForecast) => {
    const result = build([product("forecast-product", { leadDays: 12 })], { period: forecastPeriod, demandForecast: rejectedForecast });
    expect(result.recommendations[0]).toMatchObject({
      status: "VERIFIED", demandSource: "HISTORICAL", dailyDemand: 10, leadTimeDemand: 12,
    });
    expect(result.recommendations[0].warnings).toContain(
      "DEMAND_FORECAST_UNVERIFIED_OR_SCOPE_MISMATCH_HISTORICAL_RATE_USED",
    );
  });

  it("retains historical demand when supplier lead time exceeds 90 forecast days", () => {
    const result = build([product("forecast-product", { leadDays: 120 })], { period: forecastPeriod, demandForecast });
    expect(result.recommendations[0]).toMatchObject({
      demandSource: "HISTORICAL", dailyDemand: 10, leadTimeDemand: 120,
    });
    expect(result.recommendations[0].warnings).toContain(
      "DEMAND_FORECAST_UNVERIFIED_OR_SCOPE_MISMATCH_HISTORICAL_RATE_USED",
    );
  });
});
