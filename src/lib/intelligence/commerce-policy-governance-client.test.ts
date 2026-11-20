import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCommercePolicySimulationHistory,
  parseCommercePolicySimulation,
  parseCommercePolicySimulationHistory,
  parseCommercePolicyCatalog,
  type CommercePolicySimulationType,
  type CommercePolicyCatalog,
  type CommercePolicyMetadata,
} from "./commerce-policy-governance-client";
import { buildPromotionPolicyOverlapReview } from "./commerce-policy-overlap-review";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const TYPES: CommercePolicySimulationType[] = [
  "PROMOTION_PREVIEW",
  "CUSTOMER_CREDIT",
  "PRODUCT_ORDER_QUANTITY",
  "INVENTORY_REORDER_POINT",
  "TASK_DEDUPLICATION",
];
const AS_OF = "2026-11-13T06:00:00.000Z";
const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const FINGERPRINT_A = "a".repeat(32);
const FINGERPRINT_B = "b".repeat(32);

function simulation(type: string, overrides: Record<string, unknown> = {}) {
  return {
    simulationId: ID_A,
    simulationType: type,
    asOf: "2026-11-13T05:55:00.000Z",
    inputFingerprint: FINGERPRINT_A,
    sourceFingerprint: FINGERPRINT_B,
    outcome: { simulationType: type, decision: "REVIEW", noWrite: true },
    noWrite: true,
    ...overrides,
  };
}

function historyItem(
  overrides: Record<string, unknown> = {},
  outcomeOverrides: Record<string, unknown> = {},
) {
  return {
    id: ID_A,
    simulationType: "PRODUCT_ORDER_QUANTITY",
    sourceRefs: [ID_B],
    inputFingerprint: FINGERPRINT_A,
    sourceFingerprint: FINGERPRINT_B,
    outcome: { simulationType: "PRODUCT_ORDER_QUANTITY", decision: "ALLOWED", noWrite: true, ...outcomeOverrides },
    createdAt: "2026-11-13T05:55:00.000Z",
    ...overrides,
  };
}

function history(items: unknown[], asOf = AS_OF) {
  return { asOf, returnedCount: items.length, items };
}

describe("commerce policy simulation evidence contract", () => {
  beforeEach(() => rpc.mockReset());

  for (const type of TYPES) {
    it("accepts " + type + " only with matching typed no-write evidence", () => {
      const result = parseCommercePolicySimulation(simulation(type), type);
      expect(result).toMatchObject({ ok: true, data: { simulationType: type, noWrite: true } });
      if (result.ok) expect(result.data.outcome).toMatchObject({ simulationType: type, noWrite: true });
    });
  }

  it("rejects an unsupported runtime expected type even when the returned row uses a known type", () => {
    expect(parseCommercePolicySimulation(
      simulation("PROMOTION_PREVIEW"),
      "UNREGISTERED_SIMULATION" as CommercePolicySimulationType,
    )).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects a result or nested outcome for a different simulation type", () => {
    expect(parseCommercePolicySimulation(
      simulation("CUSTOMER_CREDIT"),
      "PROMOTION_PREVIEW",
    )).toMatchObject({ ok: false, status: "ERROR" });
    expect(parseCommercePolicySimulation(
      simulation("PROMOTION_PREVIEW", {
        outcome: { simulationType: "CUSTOMER_CREDIT", noWrite: true },
      }),
      "PROMOTION_PREVIEW",
    )).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("requires explicit noWrite=true on both the outer result and nested outcome", () => {
    expect(parseCommercePolicySimulation(
      simulation("PROMOTION_PREVIEW", { noWrite: false }),
      "PROMOTION_PREVIEW",
    )).toMatchObject({ ok: false, status: "ERROR" });
    expect(parseCommercePolicySimulation(
      simulation("PROMOTION_PREVIEW", {
        outcome: { simulationType: "PROMOTION_PREVIEW", noWrite: false },
      }),
      "PROMOTION_PREVIEW",
    )).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects malformed run UUID, as-of instant, fingerprints and non-object outcome", () => {
    for (const change of [
      { simulationId: "not-a-uuid" },
      { asOf: "not-a-date" },
      { inputFingerprint: "A".repeat(32) },
      { sourceFingerprint: "f".repeat(31) },
      { outcome: [] },
      { outcome: null },
    ]) {
      expect(parseCommercePolicySimulation(
        simulation("PROMOTION_PREVIEW", change),
        "PROMOTION_PREVIEW",
      )).toMatchObject({ ok: false, status: "ERROR" });
    }
  });

  it("accepts a valid empty history without inventing a record", () => {
    expect(parseCommercePolicySimulationHistory(history([]), 30)).toMatchObject({ ok: true, data: [] });
  });

  it("accepts a complete valid history item with source lineage and typed no-write outcome", () => {
    expect(parseCommercePolicySimulationHistory(history([historyItem()]), 30)).toMatchObject({
      ok: true,
      data: [{
        id: ID_A,
        simulationType: "PRODUCT_ORDER_QUANTITY",
        sourceRefs: [ID_B],
        inputFingerprint: FINGERPRINT_A,
        sourceFingerprint: FINGERPRINT_B,
        outcome: { simulationType: "PRODUCT_ORDER_QUANTITY", noWrite: true },
      }],
    });
  });

  it.each([0, -1, 101, 1.5, Number.NaN])(
    "rejects invalid parser history limits (%s) even when the payload is empty",
    limit => {
      expect(parseCommercePolicySimulationHistory(history([]), limit)).toMatchObject({
        ok: false, status: "ERROR",
      });
    },
  );

  it("requires a non-empty bounded source reference list", () => {
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({ sourceRefs: [] }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({ sourceRefs: Array.from({ length: 21 }, (_, index) =>
        "00000000-0000-4000-8000-" + (index + 1).toString(16).padStart(12, "0")) }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects malformed and duplicate source UUID references case-insensitively", () => {
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({ sourceRefs: ["not-a-uuid"] }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({ sourceRefs: [ID_B, ID_B.toUpperCase()] }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects history rows that violate typed outcome and no-write evidence", () => {
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({}, { simulationType: "CUSTOMER_CREDIT" }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({}, { noWrite: false }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects duplicate history IDs case-insensitively", () => {
    expect(parseCommercePolicySimulationHistory(history([
      historyItem(),
      historyItem({ id: ID_A.toUpperCase() }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects changed counts, malformed fingerprints, invalid timestamps and future-created rows", () => {
    expect(parseCommercePolicySimulationHistory({
      asOf: AS_OF, returnedCount: 2, items: [historyItem()],
    }, 30)).toMatchObject({ ok: false, status: "ERROR" });
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({ inputFingerprint: "bad" }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({ createdAt: "not-a-date" }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
    expect(parseCommercePolicySimulationHistory(history([
      historyItem({ createdAt: "2026-11-14T00:00:00.000Z" }),
    ]), 30)).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("does not issue an RPC when the public history helper receives an invalid limit", async () => {
    const result = await fetchCommercePolicySimulationHistory(undefined, 101);
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
    expect(rpc).not.toHaveBeenCalled();
  });
});


const uuidFor = (index: number) =>
  "00000000-0000-4000-8000-" + String(index).padStart(12, "0");

function promotionPolicy(
  index: number,
  overrides: Partial<CommercePolicyMetadata> = {},
): CommercePolicyMetadata {
  return {
    id: uuidFor(1000 + index),
    policyKey: "PROMOTION",
    sourceTable: "promotions",
    sourceId: uuidFor(2000 + index),
    version: 1,
    ownerProfileId: ID_A,
    effectiveFrom: "2026-11-01T00:00:00.000Z",
    effectiveUntil: "2026-11-30T23:59:59.000Z",
    conflictPriority: 100 + index,
    businessRule: "قاعدة عرض ترويجي موثقة",
    rationale: "مراجعة تعارض النطاق والفترة دون تغيير السعر",
    testExamples: [],
    sourceFingerprint: FINGERPRINT_A,
    sourceChanged: false,
    currentSource: {
      title: "عرض " + index,
      is_active: true,
      start_date: "2026-11-01",
      end_date: "2026-11-30",
      product_ids: [ID_B],
      category_ids: [],
    },
    lifecycle: "EFFECTIVE",
    createdAt: AS_OF,
    ...overrides,
  };
}

function promotionCatalog(
  items: CommercePolicyMetadata[],
  totalCount = items.length,
): CommercePolicyCatalog {
  return {
    asOf: AS_OF,
    totalCount,
    returnedCount: items.length,
    completePopulation: items.length === totalCount,
    items,
  };
}

describe("commerce policy catalogue population contract", () => {
  it("accepts a complete 200-row catalogue with unique policy identities", () => {
    const items = Array.from({ length: 200 }, (_, index) =>
      promotionPolicy(index + 1, {
        currentSource: {
          title: "عرض " + (index + 1),
          is_active: true,
          start_date: "2026-11-01",
          end_date: "2026-11-30",
          product_ids: [uuidFor(3000 + index)],
          category_ids: [],
        },
      }),
    );
    const parsed = parseCommercePolicyCatalog(promotionCatalog(items));
    expect(parsed).toMatchObject({
      ok: true,
      data: { totalCount: 200, returnedCount: 200, completePopulation: true },
    });
    if (parsed.ok) expect(parsed.data.items).toHaveLength(200);
  });

  it("accepts a bounded 200-row slice of a larger catalogue as partial, never complete", () => {
    const items = Array.from({ length: 200 }, (_, index) =>
      promotionPolicy(index + 1, {
        currentSource: {
          title: "عرض " + (index + 1),
          is_active: true,
          start_date: "2026-11-01",
          end_date: "2026-11-30",
          product_ids: [uuidFor(4000 + index)],
          category_ids: [],
        },
      }),
    );
    const parsed = parseCommercePolicyCatalog(promotionCatalog(items, 240));
    expect(parsed).toMatchObject({
      ok: true,
      data: { totalCount: 240, returnedCount: 200, completePopulation: false },
    });
    if (parsed.ok) {
      const review = buildPromotionPolicyOverlapReview(parsed.data);
      expect(review).toMatchObject({
        state: "PARTIAL",
        completePopulation: false,
        candidatePairCount: 0,
      });
    }
  });

  it("rejects catalogue responses beyond the 200-row server contract", () => {
    const items = Array.from({ length: 201 }, (_, index) => promotionPolicy(index + 1));
    expect(parseCommercePolicyCatalog(promotionCatalog(items, 201))).toMatchObject({
      ok: false,
      status: "ERROR",
    });
  });

  it("rejects every catalogue count and completeness contradiction", () => {
    const valid = promotionCatalog([promotionPolicy(1)], 2);
    const invalid = [
      { ...valid, returnedCount: 2 },
      { ...valid, totalCount: 0 },
      { ...valid, returnedCount: -1 },
      { ...valid, returnedCount: 1.5 },
      { ...valid, totalCount: -1 },
      { ...valid, totalCount: 1.5 },
      { ...valid, completePopulation: true },
      { ...valid, completePopulation: "false" },
      { ...valid, items: [] },
      { ...valid, asOf: "not-a-date" },
    ];
    for (const value of invalid) {
      expect(parseCommercePolicyCatalog(value)).toMatchObject({
        ok: false,
        status: "ERROR",
      });
    }
  });

  it("rejects duplicate policy IDs case-insensitively", () => {
    const first = promotionPolicy(1);
    const duplicate = promotionPolicy(2, { id: first.id.toUpperCase() });
    expect(parseCommercePolicyCatalog(promotionCatalog([first, duplicate]))).toMatchObject({
      ok: false,
      status: "ERROR",
    });
  });

  it("rejects malformed, reversed and missing policy validity timestamps", () => {
    const invalid = [
      promotionPolicy(1, { effectiveFrom: "not-a-date" }),
      promotionPolicy(2, { effectiveUntil: "not-a-date" }),
      promotionPolicy(3, {
        effectiveFrom: "2026-11-20T00:00:00.000Z",
        effectiveUntil: "2026-11-19T23:59:59.000Z",
      }),
      promotionPolicy(4, { createdAt: "not-a-date" }),
    ];
    for (const item of invalid) {
      expect(parseCommercePolicyCatalog(promotionCatalog([item]))).toMatchObject({
        ok: false,
        status: "ERROR",
      });
    }
  });
});

describe("promotion overlap source evidence integrity", () => {
  it("finds same-category overlap without treating product and category IDs as interchangeable", () => {
    const first = promotionPolicy(11, {
      currentSource: {
        title: "عرض فئة 1",
        is_active: true,
        start_date: "2026-11-01",
        end_date: "2026-11-30",
        product_ids: [],
        category_ids: [ID_B],
      },
    });
    const second = promotionPolicy(12, {
      currentSource: {
        title: "عرض فئة 2",
        is_active: true,
        start_date: "2026-11-05",
        end_date: "2026-11-25",
        product_ids: [],
        category_ids: [ID_B],
      },
    });
    const result = buildPromotionPolicyOverlapReview(promotionCatalog([first, second]));
    expect(result).toMatchObject({
      state: "READY",
      candidatePairCount: 1,
      candidates: [{ sharedScope: { kind: "CATEGORY", count: 1 } }],
    });
  });

  it("withholds duplicate UUIDs inside an explicit scope, including case-only duplicates", () => {
    const item = promotionPolicy(13, {
      currentSource: {
        title: "عرض بنطاق مشوه",
        is_active: true,
        start_date: "2026-11-01",
        end_date: "2026-11-30",
        product_ids: [ID_B, ID_B.toUpperCase()],
        category_ids: [],
      },
    });
    const result = buildPromotionPolicyOverlapReview(promotionCatalog([item]));
    expect(result).toMatchObject({
      state: "PARTIAL",
      completePopulation: false,
      candidatePairCount: 0,
      withheldReasons: [{ reason: "SCOPE_NOT_COMPARABLE", count: 1 }],
    });
  });

  it("withholds a reversed policy validity window instead of falsely reporting EMPTY", () => {
    const invalid = promotionPolicy(14, {
      effectiveFrom: "2026-11-25T00:00:00.000Z",
      effectiveUntil: "2026-11-10T00:00:00.000Z",
    });
    const result = buildPromotionPolicyOverlapReview(promotionCatalog([invalid]));
    expect(result).toMatchObject({
      state: "PARTIAL",
      completePopulation: false,
      candidatePairCount: 0,
      withheldReasons: [{ reason: "SOURCE_DATE_MISSING", count: 1 }],
    });
  });

  it("does not mutate promotion source or commercial policy data during overlap review", () => {
    const catalog = promotionCatalog([
      promotionPolicy(15),
      promotionPolicy(16, {
        currentSource: {
          title: "عرض 16",
          is_active: true,
          start_date: "2026-11-10",
          end_date: "2026-11-25",
          product_ids: [ID_B],
          category_ids: [],
          price: 1250,
          discount_value: 10,
        },
      }),
    ]);
    const before = structuredClone(catalog);
    const result = buildPromotionPolicyOverlapReview(catalog);
    expect(result.candidatePairCount).toBe(1);
    expect(catalog).toEqual(before);
  });

  it("keeps a no-match result PARTIAL when the source catalogue is truncated", () => {
    const item = promotionPolicy(17, {
      currentSource: {
        title: "عرض نطاق منفصل",
        is_active: true,
        start_date: "2026-11-01",
        end_date: "2026-11-30",
        product_ids: [uuidFor(9017)],
        category_ids: [],
      },
    });
    const incomplete = { ...promotionCatalog([item], 2), completePopulation: false };
    const result = buildPromotionPolicyOverlapReview(incomplete);
    expect(result).toMatchObject({
      state: "PARTIAL",
      completePopulation: false,
      candidatePairCount: 0,
      candidates: [],
    });
  });
});
