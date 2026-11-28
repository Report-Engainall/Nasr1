import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { fetchCustomerRetentionAggregate } from "./customer-retention-client";

const asOf = "2026-11-28T12:00:00.123456Z";
const currentPeriod = { from: "2026-10-30", to: "2026-11-28" };
const previousPeriod = { from: "2026-09-30", to: "2026-10-29" };

function response(sourceTimestamp = asOf) {
  return {
    id: "retention-source-test",
    asOf,
    period: currentPeriod,
    previousPeriod,
    coverage: {
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      expectedCustomerCount: 0,
      returnedCustomerCount: 0,
      expectedSalesRecordCount: 0,
      returnedSalesRecordCount: 0,
      truncated: false,
      evidenceIds: ["retention-evidence-1"],
    },
    evidenceRecords: [{
      id: "retention-evidence-1",
      source: { kind: "TABLE", name: "orders", recordId: "tenant-scoped-orders", version: "1" },
      sourceTimestamp,
      asOf,
      period: currentPeriod,
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      warnings: [],
    }],
    customers: [],
    salesByCurrency: [],
    warnings: [],
    sideEffects: "NONE",
  };
}

describe("customer retention source timestamp contract", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it.each([
    ["timezone-less clock", "2026-11-28T12:00:00"],
    ["impossible calendar date", "2026-02-30T12:00:00.000Z"],
    ["offset beyond fourteen hours", "2026-11-28T12:00:00+14:01"],
    ["precision finer than PostgreSQL microseconds", "2026-11-28T12:00:00.1234567Z"],
  ])("rejects %s before calling the authenticated aggregate", async (_label, invalidAsOf) => {
    await expect(fetchCustomerRetentionAggregate(30, invalidAsOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects an impossible source evidence clock instead of normalizing it", async () => {
    mocks.rpc.mockResolvedValue({ data: response("2026-02-30T12:00:00.000Z"), error: null });

    await expect(fetchCustomerRetentionAggregate(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
  });

  it("rejects source evidence with an offset beyond the ISO maximum", async () => {
    mocks.rpc.mockResolvedValue({ data: response("2026-11-28T12:00:00.000+14:01"), error: null });

    await expect(fetchCustomerRetentionAggregate(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
  });
});


describe("customer retention exact source chronology", () => {
  beforeEach(() => mocks.rpc.mockReset());

  it("rejects evidence timestamp one microsecond later than the requested snapshot", async () => {
    mocks.rpc.mockResolvedValue({
      data: response("2026-11-28T12:00:00.123457Z"),
      error: null,
    });

    await expect(fetchCustomerRetentionAggregate(30, asOf))
      .resolves.toMatchObject({ ok: false, status: "ERROR" });
  });
});
