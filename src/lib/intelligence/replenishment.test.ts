import { describe, expect, it } from "vitest";
import { buildReplenishmentRecommendations, type ReplenishmentProductInput } from "./replenishment";
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
  options: { period?: EvidencePeriod; omitEvidence?: boolean } = {},
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
    asOf,
    period: options.period ?? period,
    evidenceRecords: options.omitEvidence ? [] : metrics.map(evidenceFor),
    products,
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
    })).toThrow("invalid period");
  });

  it("rejects reversed periods", () => {
    expect(() => build([product("p-10")], {
      period: { from: "2026-11-10", to: "2026-11-01" },
    })).toThrow("invalid period");
  });
});
