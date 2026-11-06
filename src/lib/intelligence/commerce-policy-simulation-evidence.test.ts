import { describe, expect, it } from "vitest";
import {
  parseCommercePolicySimulation,
  parseCommercePolicySimulationHistory,
} from "./commerce-policy-governance-client";

const AS_OF = "2026-11-06T12:00:00.000Z";
const ID = "99999999-9999-4999-8999-999999999999";
const SOURCE = "00000000-0000-4000-8000-000000000001";
const simulation = () => ({
  simulationId: ID, simulationType: "TASK_DEDUPLICATION", asOf: AS_OF,
  inputFingerprint: "a".repeat(32), sourceFingerprint: "b".repeat(32),
  outcome: { simulationType: "TASK_DEDUPLICATION", decision: "NO_EQUIVALENT_OPEN_TASK_FOUND", noWrite: true },
  noWrite: true,
});
const historyItem = () => ({
  id: ID, simulationType: "TASK_DEDUPLICATION", sourceRefs: [SOURCE],
  inputFingerprint: "a".repeat(32), sourceFingerprint: "b".repeat(32),
  outcome: { simulationType: "TASK_DEDUPLICATION", decision: "NO_EQUIVALENT_OPEN_TASK_FOUND", noWrite: true },
  createdAt: "2026-11-06T11:59:00.000Z",
});
const history = () => ({ asOf: AS_OF, returnedCount: 1, items: [historyItem()] });

describe("commerce policy simulation evidence parsers", () => {
  it("accepts only a typed simulation with matching no-write evidence", () => {
    expect(parseCommercePolicySimulation(simulation(), "TASK_DEDUPLICATION").ok).toBe(true);
    expect(parseCommercePolicySimulation(simulation(), "CUSTOMER_CREDIT").ok).toBe(false);
    expect(parseCommercePolicySimulation({ ...simulation(), noWrite: false }, "TASK_DEDUPLICATION").ok).toBe(false);
    expect(parseCommercePolicySimulation({ ...simulation(), asOf: "not-a-date" }, "TASK_DEDUPLICATION").ok).toBe(false);
    expect(parseCommercePolicySimulation({ ...simulation(), outcome: { ...simulation().outcome, noWrite: false } }, "TASK_DEDUPLICATION").ok).toBe(false);
  });
  it("accepts history when returned count, fingerprints, source refs and as-of reconcile", () => {
    expect(parseCommercePolicySimulationHistory(history(), 30).ok).toBe(true);
  });
  it("rejects inconsistent counts, duplicate ids and malformed evidence", () => {
    expect(parseCommercePolicySimulationHistory({ ...history(), returnedCount: 2 }, 30).ok).toBe(false);
    expect(parseCommercePolicySimulationHistory({ ...history(), returnedCount: 31 }, 30).ok).toBe(false);
    expect(parseCommercePolicySimulationHistory({ ...history(), items: [historyItem(), historyItem()], returnedCount: 2 }, 30).ok).toBe(false);
    expect(parseCommercePolicySimulationHistory({ ...history(), items: [{ ...historyItem(), sourceRefs: ["bad-id"] }] }, 30).ok).toBe(false);
    expect(parseCommercePolicySimulationHistory({ ...history(), items: [{ ...historyItem(), createdAt: "2026-11-06T13:00:00.000Z" }] }, 30).ok).toBe(false);
    expect(parseCommercePolicySimulationHistory({ ...history(), items: [{ ...historyItem(), sourceFingerprint: "not-a-fingerprint" }] }, 30).ok).toBe(false);
  });
});
