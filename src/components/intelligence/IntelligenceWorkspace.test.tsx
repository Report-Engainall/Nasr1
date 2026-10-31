import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "@/lib/intelligence/types";
import type { InventoryIntelligenceData } from "@/lib/intelligence/inventory-intelligence-client";

const mocks = vi.hoisted(() => ({
  user: { profileId: "admin-profile", name: "مدير المالية", roles: ["admin"] as string[] },
  fetchCashflow: vi.fn(),
  fetchOutcomes: vi.fn(),
  fetchInventory: vi.fn(),
  asOf: "2026-10-31T09:00:00.000Z",
  period: { from: "2026-08-01", to: "2026-10-31" },
}));

vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user }) }));
vi.mock("@/lib/intelligence/cashflow-schedule-client", () => ({
  createCashflowScheduleRequest: vi.fn(() => ({
    requestId: "req-cashflow",
    metricKeys: ["cashflow.schedule"],
    period: { from: "2026-10-31", to: "2026-11-30" },
    asOf: "2026-10-31T09:00:00.000Z",
  })),
  fetchCashflowSchedule: mocks.fetchCashflow,
}));
vi.mock("@/lib/intelligence/inventory-intelligence-client", () => ({
  createInventoryIntelligencePeriod: vi.fn(() => ({ asOf: mocks.asOf, period: mocks.period })),
  fetchInventoryIntelligence: mocks.fetchInventory,
}));
vi.mock("@/lib/intelligence/decision-outcome-client", () => ({
  fetchDecisionOutcomes: mocks.fetchOutcomes,
  createDecisionOutcomeProposal: vi.fn(),
  commandDecisionOutcome: vi.fn(),
}));

import { IntelligenceWorkspace } from "./IntelligenceWorkspace";

const asOf = "2026-10-31T09:00:00.000Z";
const period: EvidencePeriod = { from: "2026-08-01", to: "2026-10-31" };
function evidence(id: string, sourceName: string, sourceTimestamp = asOf, sourcePeriod: EvidencePeriod | null = period): EvidenceRecord {
  return {
    id,
    source: { kind: "RPC", name: sourceName, version: "v1" },
    sourceTimestamp,
    asOf,
    period: sourcePeriod,
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}
function metric(
  id: string,
  key: string,
  value: number,
  unit: MetricSnapshot["unit"],
  evidenceIds: string[],
  metricPeriod: EvidencePeriod | null,
  unitOfMeasure?: string,
): MetricSnapshot {
  return {
    id, key, value, unit,
    ...(unitOfMeasure ? { unitOfMeasure } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period: metricPeriod,
    asOf,
    lineage: {
      evidenceIds,
      calculatedAt: asOf,
      formulaId: id + ".formula",
      formulaVersion: "1",
      transformations: ["server-provided evidence"],
    },
    warnings: [],
  };
}
function inventoryFixture(): InventoryIntelligenceData {
  const evidenceRecords = [
    evidence("movement-window:p1", "inventory.movement_history"),
    evidence("inventory-balance:p1", "inventory.current_balances", asOf, null),
    evidence("sales-window:p1", "orders.completed_sales_quantity"),
    evidence("purchase-receipt-item:r1", "purchase_receipt_items", "2026-10-20T09:00:00.000Z", null),
  ];
  const available = metric("available:p1", "inventory.available_to_promise", 5, "QUANTITY", ["inventory-balance:p1"], null, "EA");
  const reorder = metric("reorder:p1", "inventory.reorder_point", 20, "QUANTITY", ["inventory-balance:p1"], null, "EA");
  const sold = metric("sold:p1", "inventory.sold_quantity_window", 30, "QUANTITY", ["sales-window:p1"], period, "EA");
  const lead = metric("lead:p1", "inventory.observed_supplier_lead_time_days", 10, "DAYS", ["purchase-receipt-item:r1"], null);
  return {
    asOf,
    period,
    totalProducts: 1,
    returnedProducts: 1,
    evidenceRecords,
    deadStockProducts: [{
      productRef: "SKU-1",
      lastMovementAt: "2026-08-01T09:00:00.000Z",
      movementCoverage: {
        status: "VERIFIED",
        period,
        completeness: "COMPLETE",
        quality: "ACCEPTABLE",
        evidenceIds: ["movement-window:p1"],
      },
      availableQuantity: available,
      quantityUnit: "EA",
      unitCost: null,
      soldQuantityWindow: sold,
      averageInventoryWindow: null,
    }],
    replenishmentProducts: [{
      productRef: "SKU-1",
      availableToPromise: available,
      reorderPoint: reorder,
      soldQuantityWindow: sold,
      supplierLeadTimeDays: lead,
      quantityUnit: "EA",
      minimumOrderQuantity: null,
      orderMultiple: null,
    }],
    warnings: [],
  };
}

describe("production intelligence workspace inventory screens", () => {
  beforeEach(() => {
    mocks.user = { profileId: "admin-profile", name: "مدير المالية", roles: ["admin"] };
    mocks.fetchCashflow.mockReset().mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "cashflow fixture deliberately unavailable",
    });
    mocks.fetchOutcomes.mockReset().mockResolvedValue({ ok: true, items: [], total: 0 });
    mocks.fetchInventory.mockReset().mockResolvedValue({ ok: true, data: inventoryFixture() });
  });
  afterEach(() => cleanup());

  it("renders movement classification and a verified replenishment quantity from server evidence", async () => {
    render(<IntelligenceWorkspace />);

    expect(await screen.findByRole("heading", { name: "حركة المخزون والأصناف الراكدة" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "توصيات إعادة التوريد" })).toBeInTheDocument();

    const deadStock = screen.getByRole("region", { name: "تحليل المخزون الراكد" });
    expect(deadStock).toHaveTextContent("SKU-1");
    expect(deadStock).toHaveTextContent("راكد");
    expect(deadStock).toHaveTextContent("غير متاح");
    expect(deadStock).toHaveTextContent("UNIT_COST_NOT_AVAILABLE");

    const replenishment = screen.getByRole("region", { name: "توصيات إعادة التوريد" });
    expect(replenishment).toHaveTextContent("توجد توصية لإعادة التوريد");
    expect(replenishment.textContent).toMatch(/١٥\s*EA/);
    expect(replenishment).toHaveTextContent("طلب مهلة التوريد");
    expect(replenishment).toHaveTextContent("الشراء التلقائي: ممنوع");

    expect(mocks.fetchInventory).toHaveBeenCalledTimes(1);
    expect(mocks.fetchInventory.mock.calls[0][0]).toEqual(period);
    expect(mocks.fetchInventory.mock.calls[0][1]).toBe(asOf);
    expect(mocks.fetchCashflow).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOutcomes).toHaveBeenCalledTimes(1);
  });

  it("does not render inventory figures for an ordinary staff role", async () => {
    mocks.user = { profileId: "staff-profile", name: "موظف", roles: ["staff"] };
    render(<IntelligenceWorkspace />);
    expect(await screen.findByRole("alert")).toHaveTextContent("صلاحية غير متاحة");
    await waitFor(() => expect(mocks.fetchInventory).not.toHaveBeenCalled());
  });

  it("keeps unavailable inventory sources in the unavailable state instead of showing zero", async () => {
    mocks.fetchInventory.mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "لا توجد منتجات نشطة موثقة في هذه المؤسسة.",
    });
    render(<IntelligenceWorkspace />);
    expect(await screen.findByText("لا توجد منتجات نشطة موثقة في هذه المؤسسة.")).toBeInTheDocument();
    expect(screen.getByText(/المصدر غير متاح/)).toBeInTheDocument();
    expect(screen.queryByText("0 EA")).not.toBeInTheDocument();
  });
});
