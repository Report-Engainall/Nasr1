import { describe, expect, it } from "vitest";
import { buildSalesScenario } from "./scenario-lab";
import type { SalesForecastResult } from "../sales-forecast";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";

const asOf = "2026-11-26T12:00:00.000Z";
const period: EvidencePeriod = { from: "2026-10-29", to: "2026-11-26" };

const forecast: SalesForecastResult = {
  ready: true,
  availableDays: 28,
  historicalDays: 28,
  dailyBaseline: 2.5,
  expectedTotal: 70,
  lowerScenario: 65,
  upperScenario: 75,
  meanAbsoluteError: 0.1,
  lastHistoricalDay: "2026-11-26",
  days: [],
};

function fixture(options: { value?: number | string; currency?: string } = {}) {
  const evidence: EvidenceRecord = {
    id: "sales-forecast-evidence",
    source: { kind: "RPC", name: "sales-forecast", version: "1" },
    sourceTimestamp: "2026-11-26T11:55:00.000Z",
    asOf,
    period,
    currency: options.currency ?? "YER",
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
  const metric: MetricSnapshot = {
    id: "sales-baseline",
    key: "sales.forecast.expected_total",
    value: options.value ?? "70.00",
    unit: "CURRENCY",
    currency: options.currency ?? "YER",
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period,
    asOf,
    lineage: {
      evidenceIds: [evidence.id],
      calculatedAt: "2026-11-26T11:56:00.000Z",
      formulaId: "sales.forecast.moving_average",
      formulaVersion: "1.0.0",
      transformations: ["7-day moving average"],
    },
    warnings: [],
  };

  return buildSalesScenario({
    id: "scenario-1",
    createdAt: "2026-11-26T12:01:00.000Z",
    asOf,
    currency: options.currency ?? "YER",
    forecast,
    baselineMetric: metric,
    evidenceRecords: [evidence],
    assumptions: [{ id: "growth", label: "Sales growth", changePercent: 10, owner: "Sales manager" }],
    constraints: { minimumChangePercent: -100, maximumChangePercent: 500 },
  });
}

describe("financial scenario baseline integrity", () => {
  it("simulates only when the verified baseline exactly matches the forecast at currency minor-unit precision", () => {
    expect(fixture()).toMatchObject({
      status: "SIMULATED",
      baseline: 70,
      result: 77,
      changeAmount: 7,
      sourceEvidenceIds: ["sales-forecast-evidence"],
      assumptionBoundary: "USER_SUPPLIED",
      accountingFact: false,
    });
  });

  it("withholds a sub-cent baseline instead of accepting it inside a half-cent tolerance", () => {
    const result = fixture({ value: "70.001" });
    expect(result).toMatchObject({
      status: "WITHHELD",
      baseline: null,
      result: null,
      changeAmount: null,
    });
    expect(result.limitations).toContain("BASELINE_FINANCIAL_PRECISION_INVALID");
  });

  it("withholds non-canonical currency identities even when both sources repeat the same value", () => {
    const result = fixture({ currency: "yer" });
    expect(result.status).toBe("WITHHELD");
    expect(result.baseline).toBeNull();
    expect(result.limitations).toContain("CURRENCY_IDENTITY_INVALID");
  });

  it("withholds baselines whose minor-unit amount exceeds the exact financial precision ceiling", () => {
    const result = fixture({ value: "10000000000000.01" });
    expect(result.status).toBe("WITHHELD");
    expect(result.baseline).toBeNull();
    expect(result.limitations).toContain("BASELINE_FINANCIAL_PRECISION_INVALID");
  });
});
