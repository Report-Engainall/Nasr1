import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInventoryIntelligencePeriod, fetchInventoryIntelligence } from "./inventory-intelligence-client";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

const period = { from: "2026-08-01", to: "2026-10-31" };
const asOf = "2026-10-31T09:00:00.000Z";
function payload() {
  const evidence = [
    { id: "movement-window:p1", source: { kind: "RPC", name: "inventory.movement_history", recordId: "p1", version: "v1" }, sourceTimestamp: asOf, asOf, period, status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
    { id: "inventory-balance:p1", source: { kind: "RPC", name: "inventory.current_balances", recordId: "p1", version: "v1" }, sourceTimestamp: asOf, asOf, period: null, status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
    { id: "sales-window:p1", source: { kind: "RPC", name: "orders.completed_sales_quantity", recordId: "p1", version: "v1" }, sourceTimestamp: asOf, asOf, period, status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
    { id: "purchase-receipt-item:r1", source: { kind: "TABLE", name: "purchase_receipt_items", recordId: "r1" }, sourceTimestamp: "2026-07-03T09:00:00.000Z", asOf, period: null, status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE", warnings: [] },
  ];
  const metric = (id: string, key: string, unit: string, value: number, periodValue: typeof period | null, sourceIds: string[], unitOfMeasure?: string) => ({
    id, key, value, unit, ...(unitOfMeasure ? { unitOfMeasure } : {}),
    status: "VERIFIED", completeness: "COMPLETE", quality: "ACCEPTABLE",
    period: periodValue, asOf,
    lineage: { evidenceIds: sourceIds, calculatedAt: asOf, formulaId: id + ".formula", formulaVersion: "1", transformations: ["server aggregate"] },
    warnings: [],
  });
  const available = metric("available:p1", "inventory.available_to_promise", "QUANTITY", 5, null, ["inventory-balance:p1"], "EA");
  const reorder = metric("reorder:p1", "inventory.reorder_point", "QUANTITY", 20, null, ["inventory-balance:p1"], "EA");
  const sold = metric("sold:p1", "inventory.sold_quantity_window", "QUANTITY", 30, period, ["sales-window:p1"], "EA");
  const lead = metric("lead:p1", "inventory.observed_supplier_lead_time_days", "DAYS", 10, null, ["purchase-receipt-item:r1"]);
  return {
    status: "OK", asOf, period,
    authorization: { tenantScope: "SERVER_RESOLVED_AUTHENTICATED_TENANT", effectiveRole: "admin" },
    totalProducts: 1, returnedProducts: 1, sideEffects: "NONE", warnings: [],
    evidenceRecords: evidence,
    deadStockProducts: [{
      productRef: "SKU-1", lastMovementAt: "2026-09-11T09:00:00.000Z",
      movementCoverage: { status: "VERIFIED", period, completeness: "COMPLETE", quality: "ACCEPTABLE", evidenceIds: ["movement-window:p1"] },
      availableQuantity: available, quantityUnit: "EA", unitCost: null, soldQuantityWindow: sold, averageInventoryWindow: null,
    }],
    replenishmentProducts: [{
      productRef: "SKU-1", availableToPromise: available, reorderPoint: reorder,
      soldQuantityWindow: sold, supplierLeadTimeDays: lead, quantityUnit: "EA",
    }],
  };
}
describe("tenant-safe inventory intelligence client", () => {
  beforeEach(() => rpc.mockReset());
  it("creates a bounded 92-day period ending at the UTC as-of day", () => {
    expect(createInventoryIntelligencePeriod(new Date(asOf))).toEqual({ asOf, period });
  });
  it("calls the server-derived RPC without tenant selectors and strictly validates all evidence", async () => {
    rpc.mockResolvedValue({ data: payload(), error: null });
    const result = await fetchInventoryIntelligence(period, asOf);
    expect(rpc).toHaveBeenCalledWith("get_inventory_intelligence_aggregate", {
      p_period_from: period.from, p_period_to: period.to, p_as_of: asOf,
    });
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_organization_id");
    expect(result).toMatchObject({ ok: true, data: { totalProducts: 1, deadStockProducts: [{ productRef: "SKU-1" }], replenishmentProducts: [{ productRef: "SKU-1" }] } });
  });
  it("withholds a product whose movement coverage or evidence does not resolve", async () => {
    const malformed = payload();
    malformed.deadStockProducts[0].movementCoverage.evidenceIds = ["missing"];
    rpc.mockResolvedValue({ data: malformed, error: null });
    expect(await fetchInventoryIntelligence(period, asOf)).toMatchObject({ ok: false, status: "ERROR" });
  });
  it("maps server role denial to a safe response", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "private detail" } });
    const result = await fetchInventoryIntelligence(period, asOf);
    expect(result).toMatchObject({ ok: false, status: "DENIED" });
    expect(JSON.stringify(result)).not.toContain("private detail");
  });
  it("does not treat a truncated product population as a successful report", async () => {
    rpc.mockResolvedValue({ data: { status: "PARTIAL" }, error: null });
    expect(await fetchInventoryIntelligence(period, asOf)).toMatchObject({ ok: false, status: "PARTIAL" });
  });
});
