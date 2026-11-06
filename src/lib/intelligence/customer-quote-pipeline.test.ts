import { describe, expect, it } from "vitest";
import { buildCustomerQuotePipeline, parseCustomerQuotePipelineSnapshot } from "./customer-quote-pipeline";

const snapshot = {
  asOf: "2026-11-06T00:00:00.000Z",
  period: { from: "2026-08-09", to: "2026-11-06", timeZone: "UTC" },
  completePopulation: true,
  totalQuotes: 10,
  requestedForPricing: 2,
  awaitingCustomerResponse: 3,
  accepted: 3,
  rejected: 1,
  expired: 1,
  sideEffects: "NONE",
};

describe("customer quote pipeline", () => {
  it("calculates acceptance only among explicit customer decisions", () => {
    const parsed = parseCustomerQuotePipelineSnapshot(snapshot);
    expect(parsed).not.toBeNull();
    expect(buildCustomerQuotePipeline(parsed!)).toMatchObject({
      state: "READY",
      totalQuotes: 10,
      requestedForPricing: 2,
      awaitingCustomerResponse: 3,
      accepted: 3,
      rejected: 1,
      expired: 1,
      decidedCount: 4,
      acceptanceRatePercent: 75,
      cohortBasis: "SALES_QUOTES.CREATED_AT",
      completePopulation: true,
    });
  });

  it("withholds acceptance percentage below three explicit decisions", () => {
    const parsed = parseCustomerQuotePipelineSnapshot({
      ...snapshot,
      totalQuotes: 3,
      requestedForPricing: 1,
      awaitingCustomerResponse: 1,
      accepted: 1,
      rejected: 0,
      expired: 0,
    });
    expect(parsed).not.toBeNull();
    expect(buildCustomerQuotePipeline(parsed!).acceptanceRatePercent).toBeNull();
  });

  it("rejects partial or unbalanced count snapshots", () => {
    expect(parseCustomerQuotePipelineSnapshot({ ...snapshot, completePopulation: false })).toBeNull();
    expect(parseCustomerQuotePipelineSnapshot({ ...snapshot, totalQuotes: 99 })).toBeNull();
  });

  it("distinguishes an empty cohort", () => {
    const parsed = parseCustomerQuotePipelineSnapshot({
      ...snapshot,
      totalQuotes: 0,
      requestedForPricing: 0,
      awaitingCustomerResponse: 0,
      accepted: 0,
      rejected: 0,
      expired: 0,
    });
    expect(parsed).not.toBeNull();
    expect(buildCustomerQuotePipeline(parsed!).state).toBe("EMPTY");
  });
});
