import { describe, expect, it } from "vitest";
import { parseCustomerServiceIntelligenceSnapshot } from "./customer-service-intelligence-client";

const snapshot = () => ({
  as_of: "2026-11-06T00:00:00.000Z",
  scope: "ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION",
  complete_population: true,
  summary: {
    open_count: 12,
    response_overdue_count: 3,
    resolution_overdue_count: 4,
    unassigned_count: 2,
    urgent_count: 1,
    high_count: 5,
  },
});

describe("parseCustomerServiceIntelligenceSnapshot", () => {
  it("accepts a complete same-tenant aggregate and preserves the server as-of", () => {
    expect(parseCustomerServiceIntelligenceSnapshot(snapshot())).toEqual({
      asOf: "2026-11-06T00:00:00.000Z",
      scope: "ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION",
      completePopulation: true,
      summary: {
        openCount: 12,
        responseOverdueCount: 3,
        resolutionOverdueCount: 4,
        unassignedCount: 2,
        urgentCount: 1,
        highCount: 5,
      },
    });
  });

  it("rejects a truncated or unknown-population response", () => {
    const value = snapshot();
    value.complete_population = false;
    expect(parseCustomerServiceIntelligenceSnapshot(value)).toBeNull();
  });

  it("rejects impossible counts instead of clamping them", () => {
    const value = snapshot();
    value.summary.response_overdue_count = 13;
    expect(parseCustomerServiceIntelligenceSnapshot(value)).toBeNull();
  });

  it("rejects detail-bearing payloads so the assistant accepts aggregate-only data", () => {
    const value = { ...snapshot(), items: [{ customer_name: "Private customer", subject: "Private case" }] };
    expect(parseCustomerServiceIntelligenceSnapshot(value)).toBeNull();
  });

  it("rejects negative, fractional and unsafe integer counts", () => {
    const negative = snapshot();
    negative.summary.unassigned_count = -1;
    const fractional = snapshot();
    fractional.summary.high_count = 1.5;
    const unsafe = snapshot();
    unsafe.summary.open_count = Number.MAX_SAFE_INTEGER + 1;
    expect(parseCustomerServiceIntelligenceSnapshot(negative)).toBeNull();
    expect(parseCustomerServiceIntelligenceSnapshot(fractional)).toBeNull();
    expect(parseCustomerServiceIntelligenceSnapshot(unsafe)).toBeNull();
  });
});
