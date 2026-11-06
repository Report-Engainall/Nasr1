import { describe, expect, it } from "vitest";
import { parseCommercePolicyCatalog } from "./commerce-policy-governance-client";

const policy = {
  id: "99999999-9999-4999-8999-999999999999",
  policyKey: "PROMOTION", sourceTable: "promotions",
  sourceId: "00000000-0000-4000-8000-000000000001", version: 1,
  ownerProfileId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  effectiveFrom: "2026-11-01T00:00:00.000Z", effectiveUntil: null, conflictPriority: 10,
  businessRule: "قاعدة صالحة", rationale: "مبرر صالح",
  testExamples: [{ case: "before", input: {}, expected: "review" }],
  sourceFingerprint: "a".repeat(32), sourceChanged: false,
  currentSource: { is_active: true }, lifecycle: "EFFECTIVE", createdAt: "2026-11-06T12:00:00.000Z",
};
const valid = () => ({
  asOf: "2026-11-06T12:00:00.000Z", totalCount: 1, returnedCount: 1,
  completePopulation: true, items: [policy],
});

describe("parseCommercePolicyCatalog", () => {
  it("accepts a population whose counts and rows reconcile", () => {
    const result = parseCommercePolicyCatalog(valid());
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ totalCount: 1, returnedCount: 1, completePopulation: true });
  });
  it("accepts a deliberately partial population without claiming completeness", () => {
    const value = valid();
    value.totalCount = 201; value.completePopulation = false;
    const result = parseCommercePolicyCatalog(value);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.completePopulation).toBe(false);
  });
  it.each([
    ["complete flag contradicts counts", { totalCount: 2, returnedCount: 1, completePopulation: true }],
    ["partial flag contradicts complete counts", { totalCount: 1, returnedCount: 1, completePopulation: false }],
    ["returned count differs from row count", { totalCount: 2, returnedCount: 2, completePopulation: true }],
    ["returned count exceeds total", { totalCount: 0, returnedCount: 1, completePopulation: false }],
  ])("rejects inconsistent population metadata: %s", (_label, patch) => {
    expect(parseCommercePolicyCatalog({ ...valid(), ...patch }).ok).toBe(false);
  });
  it("rejects invalid as-of and duplicate policy IDs", () => {
    expect(parseCommercePolicyCatalog({ ...valid(), asOf: "bad-date" }).ok).toBe(false);
    expect(parseCommercePolicyCatalog({ ...valid(), totalCount: 2, returnedCount: 2, completePopulation: true, items: [policy, policy] }).ok).toBe(false);
  });
});
