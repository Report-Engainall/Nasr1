import { describe, expect, it } from "vitest";
import {
  areBusinessHealthAssistantSourcesComplete,
  mapBusinessHealthCashflowSource,
  mapBusinessHealthRetentionSource,
  type BusinessHealthAssistantSources,
} from "./business-health-assistant-client";
import type { CashflowScheduleSnapshot } from "./cashflow-schedule-client";
import type { CustomerRetentionReport } from "./customer-retention";

const asOf = "2026-11-17T12:00:00.000Z";
const period = { from: "2026-08-18", to: "2026-11-17" };

function cashflow(overrides: Record<string, unknown> = {}): CashflowScheduleSnapshot {
  return {
    status: "OK",
    asOf,
    period,
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    schedule: { status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", entries: [], warnings: [] },
    evidenceCount: 0,
    evidenceRecords: [],
    measurementMetrics: [],
    warnings: [],
    ...overrides,
  } as unknown as CashflowScheduleSnapshot;
}

function retention(overrides: Record<string, unknown> = {}): CustomerRetentionReport {
  return {
    id: "retention-test",
    asOf,
    period,
    previousPeriod: { from: "2026-05-18", to: "2026-08-17" },
    status: "VERIFIED",
    population: { total: 12, activeCurrentPeriod: 8, priorPeriodCohort: 9, retainedCustomers: 6, repeatPurchaseCustomers: 5 },
    retentionRate: 0.5,
    repeatPurchaseRate: 0.4,
    averageOrdersPerActiveCustomer: 2,
    activity: { active30Days: 8, cooling31To60Days: 1, atRisk61To90Days: 1, inactiveOver90Days: 1, noOrderDate: 1 },
    focusByCurrency: [],
    customers: [],
    warnings: [],
    ...overrides,
  } as unknown as CustomerRetentionReport;
}

const completeSources = (): BusinessHealthAssistantSources => ({
  inventory: { status: "READY", asOf, period, totalProducts: 114, returnedProducts: 114 },
  cashflow: mapBusinessHealthCashflowSource(cashflow()),
  retention: mapBusinessHealthRetentionSource(retention()),
  productRevenueConcentration: { status: "READY", invoiceCount: 20, currencyCount: 1, completePopulation: true, asOf },
  supplierPostedPayableActivity: { sourceStatus: "READY", resultStatus: "VERIFIED", sourceEntryCount: 10, currencyCount: 1, completeSourceAggregation: true, asOf },
});

describe("business health assistant source completeness", () => {
  it("marks cashflow READY only when the schedule, completeness and quality are all verified", () => {
    expect(mapBusinessHealthCashflowSource(cashflow())).toMatchObject({ status: "READY", asOf, period });
    const partialStatus = mapBusinessHealthCashflowSource(cashflow({ status: "PARTIAL" }));
    const partialCompleteness = mapBusinessHealthCashflowSource(cashflow({ completeness: "PARTIAL" }));
    const unknownQuality = mapBusinessHealthCashflowSource(cashflow({ quality: "UNKNOWN" }));
    const scheduleNeedsReview = mapBusinessHealthCashflowSource(cashflow({
      schedule: { status: "NEEDS_REVIEW", completeness: "PARTIAL", quality: "WARNINGS", entries: [], warnings: [] },
    }));
    for (const result of [partialStatus, partialCompleteness, unknownQuality, scheduleNeedsReview]) {
      expect(result.status).toBe("PARTIAL");
      expect(result).toHaveProperty("message");
      expect(result).toHaveProperty("warnings");
    }
  });

  it("marks retention READY only when the source is VERIFIED and its population count is known", () => {
    expect(mapBusinessHealthRetentionSource(retention())).toMatchObject({
      status: "READY", populationComplete: true, customerCount: 12,
    });
    expect(mapBusinessHealthRetentionSource(retention({ status: "NEEDS_REVIEW" }))).toMatchObject({
      status: "PARTIAL", populationComplete: false,
    });
    expect(mapBusinessHealthRetentionSource(retention({
      population: { total: null, activeCurrentPeriod: null, priorPeriodCohort: null, retainedCustomers: null, repeatPurchaseCustomers: null },
    }))).toMatchObject({ status: "PARTIAL", populationComplete: false, customerCount: null });
  });

  it("requires every ready source to reference the same valid timezone-qualified snapshot", () => {
    const complete = completeSources();
    const supplierReady: Extract<BusinessHealthAssistantSources["supplierPostedPayableActivity"], { sourceStatus: "READY" }> = {
      sourceStatus: "READY",
      resultStatus: "VERIFIED",
      sourceEntryCount: 10,
      currencyCount: 1,
      completeSourceAggregation: true,
      asOf,
    };
    expect(areBusinessHealthAssistantSourcesComplete(complete, "VERIFIED")).toBe(true);
    expect(areBusinessHealthAssistantSourcesComplete({
      ...complete,
      supplierPostedPayableActivity: { ...supplierReady, asOf: "2026-11-17T11:59:59.000Z" },
    }, "VERIFIED")).toBe(false);
    expect(areBusinessHealthAssistantSourcesComplete({
      ...complete,
      supplierPostedPayableActivity: { ...supplierReady, asOf: "2026-02-31T12:00:00.000Z" },
    }, "VERIFIED")).toBe(false);
    expect(areBusinessHealthAssistantSourcesComplete({
      ...complete,
      inventory: { ...complete.inventory, asOf: "2026-11-17T12:00:00" },
    }, "VERIFIED")).toBe(false);
  });

  it("does not elevate the complete-source rollup when one important source is partial or missing", () => {
    const complete = completeSources();
    expect(areBusinessHealthAssistantSourcesComplete(complete, "VERIFIED")).toBe(true);
    expect(areBusinessHealthAssistantSourcesComplete({ ...complete, cashflow: {
      ...mapBusinessHealthCashflowSource(cashflow({ completeness: "PARTIAL" })),
    } }, "VERIFIED")).toBe(false);
    expect(areBusinessHealthAssistantSourcesComplete({ ...complete, retention: {
      ...mapBusinessHealthRetentionSource(retention({ status: "NEEDS_REVIEW" })),
    } }, "VERIFIED")).toBe(false);
    expect(areBusinessHealthAssistantSourcesComplete({ ...complete, supplierPostedPayableActivity: {
      sourceStatus: "READY", resultStatus: "NEEDS_REVIEW", sourceEntryCount: 10, currencyCount: 1, completeSourceAggregation: true, asOf,
    } }, "VERIFIED")).toBe(false);
    expect(areBusinessHealthAssistantSourcesComplete(complete, "PARTIAL")).toBe(false);
  });
});
