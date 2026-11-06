import { describe, expect, it } from "vitest";
import type { CommercePolicyCatalog, CommercePolicyMetadata } from "./commerce-policy-governance-client";
import { buildPromotionPolicyOverlapReview } from "./commerce-policy-overlap-review";

const AS_OF = "2026-11-06T12:00:00.000Z";
const PRODUCT_A = "11111111-1111-4111-8111-111111111111";
const PRODUCT_B = "22222222-2222-4222-8222-222222222222";
const CATEGORY_A = "33333333-3333-4333-8333-333333333333";
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function promotion(index: number, overrides: Partial<CommercePolicyMetadata> = {}): CommercePolicyMetadata {
  const sourceId = "00000000-0000-4000-8000-" + String(index).padStart(12, "0");
  return {
    id: "99999999-9999-4999-8999-" + String(index).padStart(12, "0"),
    policyKey: "PROMOTION", sourceTable: "promotions", sourceId, version: 1,
    ownerProfileId: OWNER, effectiveFrom: "2026-11-01T00:00:00.000Z",
    effectiveUntil: "2026-11-30T23:59:59.000Z", conflictPriority: 100 + index,
    businessRule: "قاعدة عرض ترويجي موثقة", rationale: "اختبار تداخل الفترات والنطاق",
    testExamples: [], sourceFingerprint: "a".repeat(32), sourceChanged: false,
    currentSource: {
      title: "عرض " + index, is_active: true, start_date: "2026-11-01", end_date: "2026-11-30",
      product_ids: [PRODUCT_A], category_ids: [],
    },
    lifecycle: "EFFECTIVE", createdAt: AS_OF,
    ...overrides,
  };
}
function catalog(items: CommercePolicyMetadata[], completePopulation = true): CommercePolicyCatalog {
  return { asOf: AS_OF, totalCount: completePopulation ? items.length : items.length + 10,
    returnedCount: items.length, completePopulation, items };
}

describe("buildPromotionPolicyOverlapReview", () => {
  it("finds a same-product overlap only when both source and policy windows overlap", () => {
    const result = buildPromotionPolicyOverlapReview(catalog([promotion(1), promotion(2, {
      effectiveFrom: "2026-11-10T00:00:00.000Z",
      currentSource: { title: "عرض 2", is_active: true, start_date: "2026-11-08", end_date: "2026-11-25",
        product_ids: [PRODUCT_A], category_ids: [] },
    })]));
    expect(result).toMatchObject({ state: "READY", completePopulation: true, inspectedPromotionCount: 2, candidatePairCount: 1, withheldCount: 0 });
    expect(result.candidates[0]).toMatchObject({
      sharedScope: { kind: "PRODUCT", count: 1 }, classification: "POTENTIAL_OVERLAP_REVIEW",
      overlapPeriod: { from: "2026-11-10T00:00:00.000Z", to: "2026-11-25T00:00:00.000Z" },
    });
  });

  it("does not report an overlap for different products or disjoint windows", () => {
    const differentProducts = buildPromotionPolicyOverlapReview(catalog([
      promotion(1), promotion(2, { currentSource: { title: "عرض 2", is_active: true, start_date: "2026-11-01", end_date: "2026-11-30", product_ids: [PRODUCT_B], category_ids: [] } }),
    ]));
    expect(differentProducts).toMatchObject({ state: "EMPTY", candidatePairCount: 0, withheldCount: 0 });
    const disjoint = buildPromotionPolicyOverlapReview(catalog([
      promotion(1), promotion(2, { effectiveFrom: "2026-12-01T00:00:00.000Z", effectiveUntil: "2026-12-10T00:00:00.000Z" }),
    ]));
    expect(disjoint).toMatchObject({ state: "EMPTY", candidatePairCount: 0 });
  });

  it("withholds changed, unavailable, malformed and non-comparable source records", () => {
    const result = buildPromotionPolicyOverlapReview(catalog([
      promotion(1, { sourceChanged: true }),
      promotion(2, { currentSource: null as unknown as Record<string, unknown> }),
      promotion(3, { currentSource: { is_active: null, start_date: "2026-11-01", end_date: "2026-11-30", product_ids: [PRODUCT_A], category_ids: [] } }),
      promotion(4, { currentSource: { is_active: true, start_date: "2026-11-01", end_date: null, product_ids: [PRODUCT_A], category_ids: [] } }),
      promotion(5, { currentSource: { is_active: true, start_date: "2026-11-01", end_date: "2026-11-30", product_ids: ["bad-id"], category_ids: [] } }),
    ]));
    expect(result.state).toBe("PARTIAL");
    expect(result.completePopulation).toBe(false);
    expect(result.withheldReasons).toEqual(expect.arrayContaining([
      { reason: "SOURCE_CHANGED", count: 1 },
      { reason: "SOURCE_STATUS_UNAVAILABLE", count: 1 },
      { reason: "SOURCE_DATE_MISSING", count: 1 },
      { reason: "SCOPE_NOT_COMPARABLE", count: 1 },
    ]));
    expect(result.withheldCount).toBe(5);
  });

  it("does not compare product scope with category scope as if they were interchangeable", () => {
    const result = buildPromotionPolicyOverlapReview(catalog([
      promotion(1),
      promotion(2, { currentSource: { title: "عرض فئة", is_active: true, start_date: "2026-11-01", end_date: "2026-11-30", product_ids: [], category_ids: [CATEGORY_A] } }),
    ]));
    expect(result).toMatchObject({ state: "PARTIAL", candidatePairCount: 0, withheldCount: 1,
      withheldReasons: [{ reason: "SCOPE_NOT_COMPARABLE", count: 1 }] });
  });

  it("keeps incomplete catalogue populations partial even when no pair was found", () => {
    const result = buildPromotionPolicyOverlapReview(catalog([promotion(1)], false));
    expect(result).toMatchObject({ state: "PARTIAL", completePopulation: false, candidatePairCount: 0 });
  });

  it("bounds rendered pair detail while preserving the total candidate count", () => {
    const items = Array.from({ length: 11 }, (_, i) => promotion(i + 1));
    const result = buildPromotionPolicyOverlapReview(catalog(items));
    expect(result.candidatePairCount).toBe(55);
    expect(result.candidates).toHaveLength(50);
    expect(result.completePopulation).toBe(true);
  });

  it("does not duplicate a policy source against itself", () => {
    const first = promotion(1);
    const second = promotion(2, { sourceId: first.sourceId });
    expect(buildPromotionPolicyOverlapReview(catalog([first, second])).candidatePairCount).toBe(0);
  });

  it("rejects an invalid as-of instant instead of silently using local time", () => {
    expect(() => buildPromotionPolicyOverlapReview({ ...catalog([]), asOf: "not-a-date" }))
      .toThrow("commerce_policy_overlap_as_of_invalid");
  });
});
