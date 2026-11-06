import { describe, expect, it } from "vitest";
import { buildGrowthOpportunityRadar } from "./growth-opportunities";
import type { EvidenceRecord, MetricSnapshot } from "./types";

const asOf = "2026-11-06T06:00:00.000Z";
const generatedAt = "2026-11-06T06:01:00.000Z";
const period = { from: "2026-10-01", to: "2026-10-31" };

const evidence: EvidenceRecord = {
  id: "growth-evidence",
  source: { kind: "RPC", name: "growth.quote_conversion", version: "1" },
  sourceTimestamp: "2026-11-06T05:59:00.000Z",
  asOf,
  period,
  status: "VERIFIED",
  completeness: "COMPLETE",
  quality: "ACCEPTABLE",
  warnings: [],
};

const metric = (id: string, key: string, value: number): MetricSnapshot => ({
  id,
  key,
  value,
  unit: "COUNT",
  status: "VERIFIED",
  completeness: "COMPLETE",
  quality: "ACCEPTABLE",
  period,
  asOf,
  lineage: {
    evidenceIds: [evidence.id],
    calculatedAt: "2026-11-06T05:59:30.000Z",
    formulaId: key + ".count",
    formulaVersion: "1",
    transformations: [],
  },
  warnings: [],
});

function input(sourceSnapshotVerified?: boolean) {
  return {
    id: "growth-radar-test",
    generatedAt,
    asOf,
    evidenceRecords: [evidence],
    metrics: [
      metric("quotes-open", "quotes.not_converted", 2),
      metric("quotes-total", "quotes.total", 5),
    ],
    signals: [{
      id: "quote-signal",
      kind: "QUOTE_UNCONVERTED" as const,
      subjectRef: "opaque-product-or-quote-reference",
      observedMetricId: "quotes-open",
      sampleMetricId: "quotes-total",
    }],
    ...(sourceSnapshotVerified === undefined ? {} : { sourceSnapshotVerified }),
  };
}

describe("growth opportunity source population confidence", () => {
  it("does not promote an omitted population-completeness assertion to VERIFIED", () => {
    const result = buildGrowthOpportunityRadar(input());
    expect(result.opportunities).toHaveLength(1);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.warnings).toContain("SOURCE_POPULATION_COMPLETENESS_NOT_CONFIRMED");
  });

  it("allows VERIFIED only when the caller explicitly confirms complete source populations", () => {
    const result = buildGrowthOpportunityRadar(input(true));
    expect(result.opportunities).toHaveLength(1);
    expect(result.status).toBe("VERIFIED");
    expect(result.warnings).not.toContain("SOURCE_POPULATION_COMPLETENESS_NOT_CONFIRMED");
  });

  it("keeps explicitly incomplete source populations in NEEDS_REVIEW", () => {
    const result = buildGrowthOpportunityRadar(input(false));
    expect(result.opportunities).toHaveLength(1);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.warnings).toContain("SOURCE_POPULATION_INCOMPLETE");
  });

  it("does not call an empty unconfirmed population a verified absence of opportunities", () => {
    const result = buildGrowthOpportunityRadar({
      id: "empty-growth-radar-test",
      generatedAt,
      asOf,
      evidenceRecords: [],
      metrics: [],
      signals: [],
    });
    expect(result.status).toBe("UNAVAILABLE");
    expect(result.opportunities).toEqual([]);
  });
});
