import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCashflowScheduleRequest, fetchCashflowSchedule } from "./cashflow-schedule-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

function response(overrides: Record<string, unknown> = {}) {
  const asOf = "2026-10-31T09:00:00.000Z";
  const evidenceIds = ["invoice:11111111-1111-4111-8111-111111111111", "payment:22222222-2222-4222-8222-222222222222"];
  return {
    status: "OK",
    requestId: "req-1",
    asOf,
    period: { from: "2026-10-31", to: "2026-11-30" },
    currency: "YER",
    authorization: { tenantScope: "SERVER_RESOLVED_AUTHENTICATED_TENANT", effectiveRole: "admin", capabilities: ["can_manage_finance"] },
    sourceTables: ["customer_invoices", "customer_payments"],
    evidenceRecords: [{ id: evidenceIds[0], source: { kind: "TABLE", name: "customer_invoices" } }, { id: evidenceIds[1], source: { kind: "TABLE", name: "customer_payments" } }],
    metrics: [{
      id: "metric:cashflow:YER",
      key: "cashflow.expected_collections",
      value: 375,
      unit: "CURRENCY",
      currency: "YER",
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      period: { from: "2026-10-31", to: "2026-11-30" },
      asOf,
      lineage: { evidenceIds, calculatedAt: asOf, formulaId: "nasr1.receivables-outstanding", formulaVersion: "1" },
      warnings: [],
    }],
    formulaVersions: ["nasr1.receivables-outstanding:1"],
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
    errors: [],
    sqlState: null,
    sideEffects: "NONE",
    cashflowSchedule: {
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      warnings: [],
      entries: [{
        id: "11111111-1111-4111-8111-111111111111",
        direction: "INFLOW",
        dueDate: "2026-11-10",
        customerEmail: "should-not-escape@example.test",
        amount: {
          id: "metric:11111111-1111-4111-8111-111111111111",
          key: "receivables.outstanding",
          value: 375,
          unit: "CURRENCY",
          currency: "YER",
          status: "VERIFIED",
          completeness: "COMPLETE",
          quality: "ACCEPTABLE",
          period: { from: "2026-10-31", to: "2026-11-30" },
          asOf,
          lineage: { evidenceIds, calculatedAt: asOf, formulaId: "nasr1.receivables-outstanding", formulaVersion: "1", transformations: ["invoice total minus same-tenant payments"] },
          warnings: [],
        },
      }],
    },
    ...overrides,
  };
}
const request = () => ({
  requestId: "req-1",
  metricKeys: ["cashflow.schedule"],
  period: { from: "2026-10-31", to: "2026-11-30" },
  asOf: "2026-10-31T09:00:00.000Z",
  currency: "YER",
});

describe("tenant-bound cashflow aggregate client", () => {
  beforeEach(() => rpc.mockReset());

  it("builds a date-scoped request without tenant or actor selectors", () => {
    const created = createCashflowScheduleRequest({ horizonDays: 30, now: new Date("2026-10-31T09:00:00.000Z"), requestId: "req-1", currency: "yer" });
    expect(created).toEqual(request());
    expect(Object.keys(created).sort()).toEqual(["asOf", "currency", "metricKeys", "period", "requestId"]);
  });

  it("rejects attempts to attach a client-selected tenant", async () => {
    await expect(fetchCashflowSchedule({ ...request(), organizationId: "foreign-tenant" } as never))
      .rejects.toThrow(/لا يسمح بتحديد المؤسسة/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("calls only the server-derived aggregate RPC and projects a safe response", async () => {
    rpc.mockResolvedValue({ data: response(), error: null });
    const result = await fetchCashflowSchedule(request());
    expect(rpc).toHaveBeenCalledWith("get_intelligence_aggregate", { p_request: request() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.schedule.entries[0].amount.value).toBe(375);
    expect(JSON.stringify(result.data)).not.toContain("should-not-escape@example.test");
    expect(result.data.evidenceCount).toBe(2);
    expect(result.data.measurementMetrics).toMatchObject([{ value: 375, currency: "YER", status: "VERIFIED" }]);
  });

  it("converts SQLSTATE 42501 to a safe financial permission denial", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private SQL detail must not escape" } });
    const result = await fetchCashflowSchedule(request());
    expect(result).toMatchObject({ ok: false, status: "DENIED" });
    expect(JSON.stringify(result)).not.toContain("private SQL detail");
  });

  it("fails closed on malformed rows and missing evidence", async () => {
    const malformed = response();
    (malformed.cashflowSchedule.entries[0] as Record<string, unknown>).amount = {
      id: "bad", key: "receivables.outstanding", value: 0, unit: "CURRENCY", currency: "YER",
      status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", asOf: malformed.asOf,
      lineage: { evidenceIds: [], formulaId: "f", formulaVersion: "1" },
    };
    rpc.mockResolvedValue({ data: malformed, error: null });
    const result = await fetchCashflowSchedule(request());
    expect(result).toMatchObject({ ok: false, status: "ERROR" });
  });

  it("withholds measurement commands when the server metric evidence is incomplete", async () => {
    const malformed = response({
      metrics: [{
        id: "metric:cashflow:YER", key: "cashflow.expected_collections", value: 375,
        unit: "CURRENCY", currency: "YER", status: "VERIFIED", completeness: "COMPLETE",
        quality: "ACCEPTABLE", period: { from: "2026-10-31", to: "2026-11-30" },
        asOf: "2026-10-31T09:00:00.000Z",
        lineage: { evidenceIds: [], calculatedAt: "2026-10-31T09:00:00.000Z", formulaId: "nasr1.receivables-outstanding", formulaVersion: "1" },
      }],
    });
    rpc.mockResolvedValue({ data: malformed, error: null });
    const result = await fetchCashflowSchedule(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.measurementMetrics).toEqual([]);
    expect(result.data.warnings).toContain("MEASUREMENT_METRIC_WITHHELD");
  });
});
