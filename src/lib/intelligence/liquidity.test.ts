import { describe, expect, it } from "vitest";
import type { EvidenceRecord, MetricSnapshot } from "./types";
import { buildLiquiditySnapshot } from "./liquidity";

const asOf = "2026-11-26T00:00:00.000Z";
const period = { from: "2026-11-01", to: "2026-11-25" };

function metric(id: string, key: string, value: number | string, currency: string): MetricSnapshot {
  return {
    id,
    key,
    value,
    unit: "CURRENCY",
    currency,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period,
    asOf,
    lineage: {
      evidenceIds: ["evidence:" + id],
      calculatedAt: asOf,
      formulaId: "fixture." + key,
      formulaVersion: "1.0.0",
      transformations: [],
    },
    warnings: [],
  };
}

function evidence(id: string, currency: string): EvidenceRecord {
  return {
    id: "evidence:" + id,
    source: { kind: "RPC", name: "test.liquidity", version: "1.0.0" },
    sourceTimestamp: "2026-11-25T23:59:00.000Z",
    asOf,
    period,
    currency,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

function position(currency: string, values: { available: number | string; collections: number | string; obligations: number | string }) {
  const availableBalance = metric(currency + ":available", "cash.available", values.available, currency);
  const expectedCollections = metric(currency + ":collections", "cash.collections", values.collections, currency);
  const dueObligations = metric(currency + ":obligations", "cash.obligations", values.obligations, currency);
  return {
    input: { currency, availableBalance, expectedCollections, dueObligations },
    metrics: [availableBalance, expectedCollections, dueObligations],
  };
}

function build(positions: ReturnType<typeof position>[]) {
  return buildLiquiditySnapshot({
    id: "liquidity-fixture",
    generatedAt: asOf,
    asOf,
    period,
    evidenceRecords: positions.flatMap(item => item.metrics.map(source => evidence(source.id, item.input.currency))),
    currencies: positions.map(item => item.input),
  });
}

describe("liquidity financial precision", () => {
  it("adds and subtracts decimal money without binary floating-point residue", () => {
    const result = build([position("YER", { available: "0.1", collections: "0.2", obligations: "0.1" })]);
    expect(result.positions[0]).toMatchObject({
      status: "VERIFIED",
      completeness: "COMPLETE",
      netAvailableLiquidity: 0.2,
    });
  });

  it("withholds net liquidity when a source amount exceeds the supported decimal precision", () => {
    const result = build([position("YER", { available: "1.0000001", collections: "0", obligations: "0" })]);
    expect(result.positions[0].netAvailableLiquidity).toBeNull();
    expect(result.positions[0].status).toBe("NEEDS_REVIEW");
    expect(result.positions[0].warnings).toContain("FINANCIAL_PRECISION_UNSUPPORTED_OR_OVERFLOW");
  });

  it("withholds an aggregate that exceeds the bounded exact arithmetic range", () => {
    const result = build([position("YER", { available: "999999999.999999", collections: "0.000002", obligations: "0" })]);
    expect(result.positions[0].netAvailableLiquidity).toBeNull();
    expect(result.positions[0].status).toBe("NEEDS_REVIEW");
    expect(result.positions[0].warnings).toContain("LIQUIDITY_ARITHMETIC_OVERFLOW");
  });

  it("keeps each currency in a separate position and never combines cross-currency amounts", () => {
    const result = build([
      position("YER", { available: "100", collections: "25", obligations: "10" }),
      position("USD", { available: "20", collections: "5", obligations: "3" }),
    ]);
    expect(result.positions).toHaveLength(2);
    expect(result.positions.map(item => [item.currency, item.netAvailableLiquidity])).toEqual([
      ["YER", 115],
      ["USD", 22],
    ]);
  });

  it("withholds duplicated same-currency positions instead of making an ambiguous balance", () => {
    const result = build([
      position("YER", { available: "100", collections: "10", obligations: "5" }),
      position("YER", { available: "200", collections: "20", obligations: "10" }),
    ]);
    expect(result.positions.every(item => item.netAvailableLiquidity === null)).toBe(true);
    expect(result.positions.every(item => item.warnings.includes("DUPLICATE_CURRENCY_POSITION"))).toBe(true);
  });
});
