import { describe, expect, it } from "vitest";
import type { EvidenceRecord, MetricSnapshot } from "./types";
import { buildLiquiditySnapshot } from "./liquidity";
import type { LiquidityForecastFlowInput } from "./liquidity";

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


type ForecastFlowFixture = LiquidityForecastFlowInput;
function forecastFlow(
  id: string,
  direction: ForecastFlowFixture["direction"],
  dueOn: string,
  amount: number | string,
  currency = "YER",
  flowId = id,
): ForecastFlowFixture {
  return {
    id: flowId,
    direction,
    dueOn,
    amount: metric("forecast:" + id, "forecast." + id, amount, currency),
  };
}

function buildForecast(
  flows: ForecastFlowFixture[],
  options: { expectedFlowCount?: number; returnedFlowCount?: number; truncated?: boolean } = {},
) {
  const base = position("YER", { available: "100.1", collections: 0, obligations: 0 });
  const coverageEvidence = evidence("forecast-coverage", "YER");
  const coverage = {
    status: "VERIFIED" as const,
    completeness: "COMPLETE" as const,
    quality: "ACCEPTABLE" as const,
    expectedFlowCount: options.expectedFlowCount ?? flows.length,
    returnedFlowCount: options.returnedFlowCount ?? flows.length,
    truncated: options.truncated ?? false,
    evidenceIds: [coverageEvidence.id],
  };
  return buildLiquiditySnapshot({
    id: "liquidity-forecast-fixture",
    generatedAt: asOf,
    asOf,
    period,
    evidenceRecords: [
      ...base.metrics.map(source => evidence(source.id, "YER")),
      coverageEvidence,
      ...flows.map(flow => evidence(flow.amount.id, flow.amount.currency ?? "YER")),
    ],
    currencies: [{
      ...base.input,
      forecast: { coverage, flows },
    }],
  });
}

describe("evidence-gated liquidity forecasts", () => {
  it("calculates cumulative 7, 30 and 90 day projections from dated flows", () => {
    const result = buildForecast([
      forecastFlow("today-collection", "COLLECTION", "2026-11-26", "0.2"),
      forecastFlow("day-7-collection", "COLLECTION", "2026-12-03", "4.7"),
      forecastFlow("day-7-obligation", "COMMITTED_OBLIGATION", "2026-12-03", "20"),
      forecastFlow("day-8-collection", "COLLECTION", "2026-12-04", "30"),
      forecastFlow("day-30-obligation", "COMMITTED_OBLIGATION", "2026-12-26", "5"),
      forecastFlow("day-31-collection", "COLLECTION", "2026-12-27", "20"),
      forecastFlow("day-90-obligation", "COMMITTED_OBLIGATION", "2027-02-24", "3"),
    ]);
    const horizons = result.positions[0].forecast.horizons;
    expect(horizons.map(item => item.days)).toEqual([7, 30, 90]);
    expect(horizons.map(item => item.expectedCollections)).toEqual([4.9, 34.9, 54.9]);
    expect(horizons.map(item => item.committedObligations)).toEqual([20, 25, 28]);
    expect(horizons.map(item => item.projectedBalance)).toEqual([85, 110, 127]);
    expect(horizons.every(item => item.status === "VERIFIED")).toBe(true);
  });

  it("does not treat overdue collections as future cash and carries overdue committed obligations into the first horizon", () => {
    const result = buildForecast([
      forecastFlow("overdue-collection", "COLLECTION", "2026-11-25", 50),
      forecastFlow("overdue-obligation", "COMMITTED_OBLIGATION", "2026-11-24", 5),
    ]);
    const first = result.positions[0].forecast.horizons[0];
    expect(first).toMatchObject({
      status: "VERIFIED",
      expectedCollections: 0,
      committedObligations: 5,
      projectedBalance: 95.1,
      overdueCollections: 1,
      overdueObligations: 1,
    });
  });

  it("withholds every horizon when the scheduled-flow population is incomplete or truncated", () => {
    const result = buildForecast([
      forecastFlow("known-flow", "COLLECTION", "2026-11-27", 10),
    ], { expectedFlowCount: 2, truncated: true });
    expect(result.positions[0].forecast.horizons.every(item =>
      item.status === "NEEDS_REVIEW" && item.projectedBalance === null,
    )).toBe(true);
  });

  it("withholds a horizon when a due flow has a mismatched currency", () => {
    const result = buildForecast([
      forecastFlow("foreign-flow", "COLLECTION", "2026-11-27", 500, "USD"),
    ]);
    const forecast = result.positions[0].forecast;
    expect(forecast.status).toBe("UNVERIFIED");
    expect(forecast.horizons.every(item => item.projectedBalance === null)).toBe(true);
    expect(forecast.horizons[0].warnings).toContain("FORECAST_AMOUNT_CURRENCY_MISMATCH");
  });

  it("withholds malformed and duplicate flow identities rather than double-counting", () => {
    const result = buildForecast([
      forecastFlow("first-flow", "COLLECTION", "2026-11-27", 10, "YER", "duplicate-id"),
      forecastFlow("second-flow", "COMMITTED_OBLIGATION", "2026-11-28", 4, "YER", "duplicate-id"),
    ]);
    expect(result.positions[0].forecast.horizons.every(item => item.projectedBalance === null)).toBe(true);
    expect(result.positions[0].forecast.warnings).toContain("FORECAST_FLOW_ID_DUPLICATED");
  });

  it("withholds all horizons when a flow date is not a real ISO calendar day", () => {
    const result = buildForecast([
      forecastFlow("impossible-date", "COLLECTION", "2026-02-30", 10),
    ]);
    expect(result.positions[0].forecast.horizons.every(item => item.projectedBalance === null)).toBe(true);
    expect(result.positions[0].forecast.warnings).toContain("FORECAST_FLOW_METADATA_INVALID");
  });

  it("does not calculate a projection without an independently verified coverage snapshot", () => {
    const base = position("YER", { available: 100, collections: 0, obligations: 0 });
    const result = buildLiquiditySnapshot({
      id: "liquidity-no-forecast",
      generatedAt: asOf,
      asOf,
      period,
      evidenceRecords: base.metrics.map(source => evidence(source.id, "YER")),
      currencies: [base.input],
    });
    expect(result.positions[0].forecast.status).toBe("UNAVAILABLE");
    expect(result.positions[0].forecast.horizons.every(item => item.projectedBalance === null)).toBe(true);
    expect(result.positions[0].forecast.warnings).toContain("FORECAST_COVERAGE_NOT_SUPPLIED");
  });
});


describe("liquidity forecast arithmetic safety", () => {
  it("withholds forecast amounts with precision beyond the supported six places", () => {
    const result = buildForecast([
      forecastFlow("unsupported-precision", "COLLECTION", "2026-11-27", "1.0000001"),
    ]);
    expect(result.positions[0].forecast.horizons.every(item =>
      item.status === "NEEDS_REVIEW" && item.projectedBalance === null,
    )).toBe(true);
    expect(result.positions[0].forecast.horizons[0].warnings).toContain("FORECAST_AMOUNT_PRECISION_UNSUPPORTED");
  });

  it("withholds cumulative flow totals that exceed the bounded exact arithmetic range", () => {
    const result = buildForecast([
      forecastFlow("large-collection-a", "COLLECTION", "2026-11-27", "999999999.999999"),
      forecastFlow("large-collection-b", "COLLECTION", "2026-11-28", "999999999.999999"),
    ]);
    expect(result.positions[0].forecast.horizons.every(item =>
      item.status === "NEEDS_REVIEW" && item.projectedBalance === null,
    )).toBe(true);
    expect(result.positions[0].forecast.horizons[0].warnings).toContain("FORECAST_ARITHMETIC_OVERFLOW");
  });
});
