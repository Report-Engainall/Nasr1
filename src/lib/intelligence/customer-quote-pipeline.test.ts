import { describe, expect, it } from "vitest";
import { buildCustomerQuotePipeline, parseCustomerQuotePipelineSnapshot } from "./customer-quote-pipeline";

function snapshot(overrides: Record<string, unknown> = {}) {
  return {
    asOf: "2026-11-27T12:30:00.000Z",
    period: { from: "2026-11-01", to: "2026-11-27", timeZone: "UTC" },
    completePopulation: true,
    totalQuotes: 5,
    requestedForPricing: 1,
    awaitingCustomerResponse: 1,
    accepted: 1,
    rejected: 1,
    expired: 1,
    sideEffects: "NONE",
    ...overrides,
  };
}

describe("customer quote pipeline evidence clock", () => {
  it("accepts a strict UTC timestamp and preserves the quote cohort", () => {
    const parsed = parseCustomerQuotePipelineSnapshot(snapshot());
    expect(parsed).not.toBeNull();
    expect(buildCustomerQuotePipeline(parsed!)).toMatchObject({
      state: "READY",
      totalQuotes: 5,
      decidedCount: 2,
      acceptanceRatePercent: null,
      asOf: "2026-11-27T12:30:00.000Z",
      statusAsOf: "2026-11-27T12:30:00.000Z",
    });
  });

  it("accepts an explicit offset at the ISO maximum of fourteen hours", () => {
    expect(parseCustomerQuotePipelineSnapshot(snapshot({
      asOf: "2026-11-27T12:30:00+14:00",
    }))?.asOf).toBe("2026-11-27T12:30:00+14:00");
  });

  it.each([
    ["timezone-less local time", "2026-11-27T12:30:00"],
    ["impossible calendar day", "2026-02-30T12:30:00Z"],
    ["offset beyond fourteen hours", "2026-11-27T12:30:00+14:01"],
    ["offset beyond twenty-three hours", "2026-11-27T12:30:00+23:00"],
    ["invalid wall-clock hour", "2026-11-27T24:00:00Z"],
    ["invalid seconds", "2026-11-27T12:30:60Z"],
    ["date only", "2026-11-27"],
  ])("rejects %s instead of accepting Date.parse normalization", (_label, asOf) => {
    expect(parseCustomerQuotePipelineSnapshot(snapshot({ asOf }))).toBeNull();
  });

  it("continues to reject overflowing quote counts after timestamp validation", () => {
    expect(parseCustomerQuotePipelineSnapshot(snapshot({
      totalQuotes: Number.MAX_SAFE_INTEGER,
      requestedForPricing: Number.MAX_SAFE_INTEGER,
      awaitingCustomerResponse: 1,
    }))).toBeNull();
  });
});
