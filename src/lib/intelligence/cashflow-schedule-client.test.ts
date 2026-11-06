import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCashflowScheduleRequest, fetchCashflowSchedule } from "./cashflow-schedule-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

function cashflowScheduleAmount(asOf: string, evidenceIds: string[]) {
  return {
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
    lineage: {
      evidenceIds,
      calculatedAt: asOf,
      formulaId: "nasr1.receivables-outstanding",
      formulaVersion: "1",
      transformations: ["invoice total minus same-tenant payments"],
    },
    warnings: [],
  };
}

function cashflowScheduleFixture(asOf: string, evidenceIds: string[]) {
  const amount = cashflowScheduleAmount(asOf, evidenceIds);
  const entry = {
    id: "11111111-1111-4111-8111-111111111111",
    direction: "INFLOW",
    dueDate: "2026-11-10",
    customerEmail: "should-not-escape@example.test",
    amount,
  };
  return {
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
    entries: [entry],
  };
}

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
    evidenceRecords: [
      { id: evidenceIds[0], source: { kind: "TABLE", name: "customer_invoices", recordId: "11111111-1111-4111-8111-111111111111" }, sourceTimestamp: asOf, asOf, period: { from: "2026-10-31", to: "2026-11-30" }, currency: "YER", status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
      { id: evidenceIds[1], source: { kind: "TABLE", name: "customer_payments", recordId: "22222222-2222-4222-8222-222222222222" }, sourceTimestamp: asOf, asOf, period: { from: "2026-10-31", to: "2026-11-30" }, currency: "YER", status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
    ],
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
    cashflowSchedule: cashflowScheduleFixture(asOf, evidenceIds),
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

function supplierOutflowResponse(overrides: Record<string, unknown> = {}) {
  const asOf = request().asOf;
  const invoiceId = "33333333-3333-4333-8333-333333333333";
  const dueId = "44444444-4444-4444-8444-444444444444";
  const receiptId = "55555555-5555-4555-8555-555555555555";
  const evidenceRecords = [
    { id: "supplier-invoice:" + invoiceId, source: { kind: "TABLE", name: "purchase_supplier_invoices", recordId: invoiceId }, sourceTimestamp: asOf, asOf, period: request().period, currency: "YER", status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
    { id: "supplier-invoice-due-date:" + dueId, source: { kind: "TABLE", name: "purchase_supplier_invoice_due_dates", recordId: dueId }, sourceTimestamp: asOf, asOf, period: request().period, currency: "YER", status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
    { id: "supplier-receipt-open-payable:" + receiptId, source: { kind: "RPC", name: "supplier_payment_open_receipts", recordId: receiptId }, sourceTimestamp: asOf, asOf, period: request().period, currency: "YER", status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
  ];
  return {
    status: "OK", completeness: "COMPLETE", quality: "ACCEPTABLE",
    asOf, period: request().period, currency: "YER", sideEffects: "NONE",
    unresolvedReceiptCount: 0, overdueReceiptCount: 0,
    entries: [{
      id: "supplier-invoice-outflow:" + invoiceId,
      direction: "OUTFLOW",
      dueDate: "2026-11-20",
      amount: {
        id: "metric:supplier-payable:" + invoiceId,
        key: "supplier.payable.outstanding",
        value: "80.25",
        unit: "CURRENCY", currency: "YER",
        status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", asOf,
        lineage: {
          evidenceIds: evidenceRecords.map((item) => item.id),
          formulaId: "nasr1.supplier-posted-payable-after-settlements",
          formulaVersion: "1",
        },
      },
    }],
    evidenceRecords, warnings: [], ...overrides,
  };
}

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

  it("combines tenant-scoped customer inflows with receipt-backed supplier outflows without leaking raw rows", async () => {
    rpc.mockImplementation(async (name: string) => name === "get_intelligence_aggregate"
      ? { data: response(), error: null }
      : { data: supplierOutflowResponse(), error: null });
    const result = await fetchCashflowSchedule(request());
    expect(rpc).toHaveBeenNthCalledWith(1, "get_intelligence_aggregate", { p_request: request() });
    expect(rpc).toHaveBeenNthCalledWith(2, "fetch_supplier_payable_cashflow_schedule", {
      p_from: request().period.from,
      p_to: request().period.to,
      p_as_of: request().asOf,
      p_currency: "YER",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.schedule.entries.map((entry) => [entry.direction, entry.amount.value])).toEqual([
      ["INFLOW", 375], ["OUTFLOW", 80.25],
    ]);
    expect(result.data.schedule.status).toBe("VERIFIED");
    expect(result.data.evidenceRecords).toHaveLength(5);
    expect(JSON.stringify(result.data)).not.toContain("should-not-escape@example.test");
    expect(result.data.measurementMetrics).toMatchObject([{ value: 375, currency: "YER", status: "VERIFIED" }]);
  });

  it("keeps verified supplier outflows visible but downgrades coverage when any open receipt is unresolved", async () => {
    rpc.mockImplementation(async (name: string) => name === "get_intelligence_aggregate"
      ? { data: response(), error: null }
      : { data: supplierOutflowResponse({
          status: "PARTIAL", completeness: "PARTIAL", quality: "WARNINGS", unresolvedReceiptCount: 1,
          warnings: ["One open receipt has no uniquely evidenced invoice due date."],
        }), error: null });
    const result = await fetchCashflowSchedule(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.schedule.entries.some((entry) => entry.direction === "OUTFLOW")).toBe(true);
    expect(result.data.schedule.completeness).toBe("PARTIAL");
    expect(result.data.schedule.status).toBe("NEEDS_REVIEW");
    expect(result.data.schedule.warnings).toContain("One open receipt has no uniquely evidenced invoice due date.");
  });

  it("retains known customer inflows as PARTIAL when the supplier payable RPC fails", async () => {
    rpc.mockImplementation(async (name: string) => name === "get_intelligence_aggregate"
      ? { data: response(), error: null }
      : { data: null, error: { code: "PGRST202", message: "supplier RPC unavailable" } });
    const result = await fetchCashflowSchedule(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.schedule.entries.map((entry) => entry.direction)).toEqual(["INFLOW"]);
    expect(result.data.schedule.status).toBe("NEEDS_REVIEW");
    expect(result.data.schedule.warnings).toContain("Supplier payable schedule is unavailable; zero outflows are not assumed.");
  });

  it("withholds supplier outflows rather than assuming zero when source evidence linkage is missing", async () => {
    const invalid = supplierOutflowResponse();
    (invalid.entries[0].amount.lineage as Record<string, unknown>).evidenceIds = ["supplier-invoice:not-in-response"];
    rpc.mockImplementation(async (name: string) => name === "get_intelligence_aggregate"
      ? { data: response(), error: null }
      : { data: invalid, error: null });
    const result = await fetchCashflowSchedule(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.schedule.entries.map((entry) => entry.direction)).toEqual(["INFLOW"]);
    expect(result.data.schedule.status).toBe("NEEDS_REVIEW");
    expect(result.data.schedule.completeness).toBe("PARTIAL");
    expect(result.data.schedule.warnings).toContain("Supplier payable schedule is unavailable; zero outflows are not assumed.");
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

  it("withholds a measurement metric whose lineage IDs do not resolve to response evidence", async () => {
    const malformed = response();
    (malformed.metrics[0] as Record<string, unknown>).lineage = {
      evidenceIds: ["invoice:not-in-response"],
      calculatedAt: malformed.asOf,
      formulaId: "nasr1.receivables-outstanding",
      formulaVersion: "1",
    };
    rpc.mockResolvedValue({ data: malformed, error: null });
    const result = await fetchCashflowSchedule(request());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.measurementMetrics).toEqual([]);
    expect(result.data.warnings).toContain("MEASUREMENT_METRIC_WITHHELD");
    expect(result.data.schedule.entries[0].amount.value).toBe(375);
  });

  it("rejects evidence with missing currency or a source timestamp after asOf", async () => {
    const malformed = response();
    (malformed.evidenceRecords[0] as Record<string, unknown>).currency = null;
    rpc.mockResolvedValue({ data: malformed, error: null });
    expect(await fetchCashflowSchedule(request())).toMatchObject({ ok: false, status: "ERROR" });

    const futureSource = response();
    (futureSource.evidenceRecords[0] as Record<string, unknown>).currency = "YER";
    (futureSource.evidenceRecords[0] as Record<string, unknown>).sourceTimestamp = "2026-11-01T00:00:00.000Z";
    rpc.mockResolvedValue({ data: futureSource, error: null });
    expect(await fetchCashflowSchedule(request())).toMatchObject({ ok: false, status: "ERROR" });
  });

});
