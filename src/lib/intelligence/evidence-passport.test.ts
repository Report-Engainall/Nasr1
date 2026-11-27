import { describe, expect, it } from "vitest";
import { buildEvidencePassport, type BuildEvidencePassportInput } from "./evidence-passport";

const AS_OF = "2026-11-26T12:00:00.000Z";
const GENERATED_AT = "2026-11-26T12:05:00.000Z";

function input(overrides: {
  generatedAt?: string;
  asOf?: string;
  sourceTimestamp?: string;
  metricAsOf?: string;
  calculatedAt?: string;
} = {}): BuildEvidencePassportInput {
  const asOf = overrides.asOf ?? AS_OF;
  const metricAsOf = overrides.metricAsOf ?? asOf;
  return {
    id: "passport-test",
    generatedAt: overrides.generatedAt ?? GENERATED_AT,
    asOf,
    evidenceRecords: [{
      id: "source:1",
      source: { kind: "RPC", name: "test.evidence_passport", version: "1.0.0" },
      sourceTimestamp: overrides.sourceTimestamp ?? "2026-11-26T11:55:00.000Z",
      asOf: metricAsOf,
      period: null,
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      warnings: [],
    }],
    metrics: [{
      id: "metric:1",
      key: "test.count",
      value: 10,
      unit: "COUNT",
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      period: null,
      asOf: metricAsOf,
      lineage: {
        evidenceIds: ["source:1"],
        calculatedAt: overrides.calculatedAt ?? "2026-11-26T11:58:00.000Z",
        formulaId: "test.count",
        formulaVersion: "1.0.0",
        transformations: [],
      },
      warnings: [],
    }],
  };
}

describe("evidence passport strict clock contract", () => {
  it("preserves a metric only when the report, source and calculation clocks are coherent", () => {
    const result = buildEvidencePassport(input());
    expect(result.status).toBe("VERIFIED");
    expect(result.metrics[0]).toMatchObject({ status: "VERIFIED", completeness: "COMPLETE" });
  });

  it.each([
    ["timezone-less timestamp", "2026-11-26T12:00:00.000"],
    ["impossible calendar date", "2026-02-31T12:00:00.000Z"],
    ["hour beyond 23", "2026-11-26T25:00:00.000Z"],
    ["minute beyond 59", "2026-11-26T12:60:00.000Z"],
    ["second beyond 59", "2026-11-26T12:00:60.000Z"],
    ["more than nine fractional digits", "2026-11-26T12:00:00.1234567890Z"],
    ["UTC offset beyond 14 hours", "2026-11-26T12:00:00.000+14:01"],
  ])("rejects an invalid top-level report clock: %s", (_label, timestamp) => {
    expect(() => buildEvidencePassport(input({ generatedAt: timestamp })))
      .toThrow("generatedAt and asOf must be valid timezone-qualified timestamps");
    expect(() => buildEvidencePassport(input({ asOf: timestamp })))
      .toThrow("generatedAt and asOf must be valid timezone-qualified timestamps");
  });

  it("rejects an as-of instant later than the report generation instant", () => {
    expect(() => buildEvidencePassport(input({
      generatedAt: "2026-11-26T12:04:00.000Z",
      asOf: "2026-11-26T12:06:00.000Z",
    }))).toThrow("asOf cannot be after generatedAt");
  });

  it.each([
    ["timezone-less source time", "2026-11-26T11:55:00.000"],
    ["impossible source date", "2026-02-31T11:55:00.000Z"],
    ["out-of-range source clock", "2026-11-26T25:55:00.000Z"],
    ["over-precision source time", "2026-11-26T11:55:00.1234567890Z"],
    ["unsupported source offset", "2026-11-26T11:55:00.000+15:00"],
  ])("withholds VERIFIED status for invalid source timestamps: %s", (_label, sourceTimestamp) => {
    const result = buildEvidencePassport(input({ sourceTimestamp }));
    expect(result.metrics[0].status).toBe("NEEDS_REVIEW");
    expect(result.metrics[0].warnings).toContain("SOURCE_TIMESTAMP_INVALID");
    expect(result.status).toBe("NEEDS_REVIEW");
  });

  it("withholds a metric when its source timestamp is after the metric as-of instant", () => {
    const result = buildEvidencePassport(input({
      sourceTimestamp: "2026-11-26T12:00:01.000Z",
    }));
    expect(result.metrics[0].status).toBe("NEEDS_REVIEW");
    expect(result.metrics[0].warnings).toContain("SOURCE_TIMESTAMP_AFTER_METRIC_AS_OF");
  });

  it("allows calculation after the data as-of instant when it precedes report generation", () => {
    const result = buildEvidencePassport(input({
      calculatedAt: "2026-11-26T12:03:00.000Z",
    }));
    expect(result.metrics[0].status).toBe("VERIFIED");
    expect(result.metrics[0].warnings).not.toContain("METRIC_CALCULATED_AFTER_REPORT_GENERATION");
  });

  it("withholds a metric calculated after report generation", () => {
    const result = buildEvidencePassport(input({
      calculatedAt: "2026-11-26T12:06:00.000Z",
    }));
    expect(result.metrics[0].status).toBe("NEEDS_REVIEW");
    expect(result.metrics[0].warnings).toContain("METRIC_CALCULATED_AFTER_REPORT_GENERATION");
    expect(result.status).toBe("NEEDS_REVIEW");
  });
});
