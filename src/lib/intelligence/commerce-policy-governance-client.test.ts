import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchCommercePolicySimulationHistory,
  parseCommercePolicySimulation,
  parseCommercePolicySimulationHistory,
  type CommercePolicySimulationType,
} from "./commerce-policy-governance-client";

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
