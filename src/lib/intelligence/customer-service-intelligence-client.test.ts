import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import {
  fetchCustomerServiceIntelligenceSummary,
  parseCustomerServiceIntelligenceSnapshot,
} from "./customer-service-intelligence-client";

const AS_OF = "2026-11-28T12:00:00.123456Z";

function response(overrides: Record<string, unknown> = {}) {
  return {
    as_of: AS_OF,
    scope: "ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION",
    complete_population: true,
    summary: {
      open_count: 12,
      response_overdue_count: 3,
      resolution_overdue_count: 2,
      unassigned_count: 4,
      urgent_count: 1,
      high_count: 2,
    },
    ...overrides,
  };
}

describe("customer service intelligence strict source contract", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("accepts the complete aggregate-only current snapshot", () => {
    expect(parseCustomerServiceIntelligenceSnapshot(response())).toEqual({
      asOf: AS_OF,
      scope: "ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION",
      completePopulation: true,
      summary: {
        openCount: 12,
        responseOverdueCount: 3,
        resolutionOverdueCount: 2,
        unassignedCount: 4,
        urgentCount: 1,
        highCount: 2,
      },
    });
  });

  it.each([
    ["timezone-less local time", "2026-11-28T12:00:00.123456"],
    ["impossible calendar date", "2026-02-30T12:00:00.123456Z"],
    ["offset above ISO maximum", "2026-11-28T12:00:00.123456+14:01"],
    ["unsupported large offset", "2026-11-28T12:00:00.123456+23:59"],
    ["precision beyond PostgreSQL microseconds", "2026-11-28T12:00:00.1234567Z"],
    ["fractional precision with ten digits", "2026-11-28T12:00:00.1234567890Z"],
  ])("withholds %s", (_label, asOf) => {
    expect(parseCustomerServiceIntelligenceSnapshot(response({ as_of: asOf }))).toBeNull();
  });

  it("rejects unexpected root fields that could expose case or customer details", () => {
    expect(parseCustomerServiceIntelligenceSnapshot(response({
      customer_id: "11111111-1111-4111-8111-111111111111",
    }))).toBeNull();
  });

  it("rejects unexpected aggregate fields instead of accepting a detail-bearing payload", () => {
    expect(parseCustomerServiceIntelligenceSnapshot(response({
      summary: { ...response().summary, case_ids: ["case-1"] },
    }))).toBeNull();
  });

  it("rejects impossible count relationships without normalizing them", () => {
    expect(parseCustomerServiceIntelligenceSnapshot(response({
      summary: { ...response().summary, urgent_count: 13 },
    }))).toBeNull();
  });

  it("reads the authorized aggregate RPC without sending client-selected scope", async () => {
    mocks.rpc.mockResolvedValue({ data: response(), error: null });

    await expect(fetchCustomerServiceIntelligenceSummary()).resolves.toMatchObject({
      ok: true,
      data: { asOf: AS_OF, summary: { openCount: 12 } },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith("get_customer_service_work_queue_summary");
  });

  it("maps denied source access without substituting another data source", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    await expect(fetchCustomerServiceIntelligenceSummary()).resolves.toMatchObject({
      ok: false,
      status: "DENIED",
    });
  });

  it("keeps an unapplied aggregate migration explicitly unavailable", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    });

    await expect(fetchCustomerServiceIntelligenceSummary()).resolves.toMatchObject({
      ok: false,
      status: "UNAVAILABLE",
    });
  });

  it("withholds malformed RPC payloads rather than returning partial counts", async () => {
    mocks.rpc.mockResolvedValue({ data: response({ summary: { open_count: 12 } }), error: null });

    await expect(fetchCustomerServiceIntelligenceSummary()).resolves.toMatchObject({
      ok: false,
      status: "ERROR",
    });
  });

  it("maps an unavailable transport result to UNAVAILABLE without leaking or fabricating counts", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: "FETCH_ERROR", message: "network unavailable" },
    });

    await expect(fetchCustomerServiceIntelligenceSummary()).resolves.toMatchObject({
      ok: false,
      status: "UNAVAILABLE",
    });
  });
});
