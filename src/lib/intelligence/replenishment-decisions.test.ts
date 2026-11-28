import { describe, expect, it } from "vitest";
import { buildReplenishmentDecisionCandidates } from "./replenishment-decisions";
import type { ReplenishmentProductInput, ReplenishmentRecommendation } from "./replenishment";
import type { MetricSnapshot } from "./types";

const asOf = "2026-11-27T02:00:00.000Z";
function metric(id: string, key: string, value = 10): MetricSnapshot {
  return {
    id, key, value, unit: "QUANTITY", unitOfMeasure: "EA",
    status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE",
    period: { from: "2026-10-28", to: "2026-11-26" }, asOf,
    lineage: {
      evidenceIds: ["evidence:" + id], calculatedAt: asOf,
      formulaId: "fixture." + key, formulaVersion: "1.0.0", transformations: [],
    },
    warnings: [],
  };
}
function product(available = 4): ReplenishmentProductInput {
  return {
    productRef: "SKU-1",
    availableToPromise: metric("atp", "inventory.available_to_promise", available),
    reorderPoint: metric("rop", "inventory.reorder_point", 15),
    soldQuantityWindow: metric("sold", "inventory.sold_quantity_window", 3),
    supplierLeadTimeDays: {
      ...metric("lead", "inventory.supplier_lead_time_days", 100),
      unit: "DAYS", unitOfMeasure: undefined, period: null,
    },
    incomingPurchaseQuantity: metric("incoming", "inventory.incoming_purchase_quantity", 2),
    quantityUnit: "EA",
  };
}
function recommendation(overrides: Partial<ReplenishmentRecommendation> = {}): ReplenishmentRecommendation {
  return {
    productRef: "SKU-1", status: "VERIFIED", action: "RECOMMEND", quantityUnit: "EA",
    availableToPromise: 4, incomingPurchaseQuantity: 2, coveredAfterIncoming: 6,
    reorderPoint: 15, dailyDemand: 0.1, leadTimeDemand: 10, targetStock: 15,
    recommendedQuantity: 9, formulaId: "inventory.replenishment-target", formulaVersion: "1.1.1",
    evidenceIds: ["evidence:atp", "evidence:rop", "evidence:sold", "evidence:lead", "evidence:incoming"],
    warnings: [], automaticPurchase: false, ...overrides,
  };
}

describe("replenishment decision integration", () => {
  it("creates an urgent P1 daily decision when verified incoming coverage is below lead-time demand", () => {
    const candidates = buildReplenishmentDecisionCandidates({
      asOf, products: [product()], recommendations: [recommendation()],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      ruleId: "inventory.replenishment.review",
      priority: "P1", priorityScore: 300,
      ruleVersion: "1.0.0",
      impact: null, impactStatus: "WITHHELD",
      impactReason: "UNIT_COST_OR_CURRENCY_NOT_VERIFIED",
      owner: "مسؤول المشتريات والمخزون",
      expectedOutcome: expect.stringContaining("مهلة التوريد"),
    });
    expect(candidates[0].proof.evidenceIds).toContain("evidence:incoming");
    expect(candidates[0].proof.metricKeys).toContain("inventory.sold_quantity_window");
  });

  it("keeps a reorder-point gap at P2 when coverage still meets lead-time demand", () => {
    const candidates = buildReplenishmentDecisionCandidates({
      asOf, products: [product(10)],
      recommendations: [recommendation({ availableToPromise: 10, coveredAfterIncoming: 12, recommendedQuantity: 3, leadTimeDemand: 10 })],
    });
    expect(candidates[0]?.priority).toBe("P2");
    expect(candidates[0]?.soWhat).toContain("دون ادعاء نفاد وشيك"); // Conditional risk language stays explicit.
  });

  it("withholds recommendations without verified, complete and time-valid source metrics", () => {
    const source = product();
    source.availableToPromise = {
      ...source.availableToPromise,
      lineage: { ...source.availableToPromise.lineage, calculatedAt: "2026-11-27T02:00:01.000Z" },
    };
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [source], recommendations: [recommendation()],
    })).toEqual([]);
  });

  it("does not create candidates for NO_ACTION, WITHHELD or automatic-purchase recommendations", () => {
    const valid = recommendation();
    const autoPurchaseAttempt = { ...valid, automaticPurchase: true } as unknown as ReplenishmentRecommendation;
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [product()],
      recommendations: [
        { ...valid, action: "NO_ACTION" },
        { ...valid, action: "WITHHELD" },
        autoPurchaseAttempt,
      ],
    })).toEqual([]);
  });

  it("rejects recommendation evidence that is not linked to the product source metrics", () => {
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [product()],
      recommendations: [recommendation({ evidenceIds: ["evidence:unrelated"] })],
    })).toEqual([]);
  });

  it("rejects duplicate product references and malformed snapshot clocks", () => {
    expect(buildReplenishmentDecisionCandidates({
      asOf: "2026-02-31T02:00:00.000Z",
      products: [product()], recommendations: [recommendation()],
    })).toEqual([]);
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [product(), product()], recommendations: [recommendation()],
    })).toEqual([]);
  });

  it.each([
    ["availableToPromise", 99],
    ["incomingPurchaseQuantity", 99],
    ["coveredAfterIncoming", 99],
    ["reorderPoint", 99],
    ["leadTimeDemand", 99],
    ["targetStock", 99],
    ["recommendedQuantity", 99],
    ["dailyDemand", 99],
  ] as const)("rejects a forged %s that conflicts with verified source metrics", (field, value) => {
    const forged = recommendation({ [field]: value } as Partial<ReplenishmentRecommendation>);
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [product()], recommendations: [forged],
    })).toEqual([]);
  });

  it("requires the recommendation evidence set to cover every source metric exactly", () => {
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [product()],
      recommendations: [recommendation({ evidenceIds: ["evidence:atp"] })],
    })).toEqual([]);
  });

  it("rejects quantity snapshots with a mismatched UOM even when the recommendation says EA", () => {
    const source = product();
    source.incomingPurchaseQuantity = {
      ...source.incomingPurchaseQuantity,
      unitOfMeasure: "CASE",
    };
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [source], recommendations: [recommendation()],
    })).toEqual([]);
  });

  it("rejects source periods that extend beyond the recommendation snapshot", () => {
    const source = product();
    source.soldQuantityWindow = {
      ...source.soldQuantityWindow,
      period: { from: "2026-10-28", to: "2026-11-28" },
    };
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [source], recommendations: [recommendation()],
    })).toEqual([]);
  });


  it.each([
    ["formulaId", "unknown.replenishment"],
    ["formulaVersion", "999.0.0"],
  ] as const)("rejects a recommendation with an unregistered %s", (field, value) => {
    const unregistered = recommendation({ [field]: value } as Partial<ReplenishmentRecommendation>);
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [product()], recommendations: [unregistered],
    })).toEqual([]);
  });

  it("withholds duplicate recommendations for the same product instead of emitting duplicate decisions", () => {
    const valid = recommendation();
    expect(buildReplenishmentDecisionCandidates({
      asOf, products: [product()],
      recommendations: [valid, { ...valid, productRef: " SKU-1 " }],
    })).toEqual([]);
  });



});
