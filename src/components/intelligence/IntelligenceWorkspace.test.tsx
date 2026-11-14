// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "@/lib/intelligence/types";
import type { DecisionOutcomeView } from "@/lib/intelligence/decision-outcome-client";
import type { InventoryIntelligenceData } from "@/lib/intelligence/inventory-intelligence-client";

const mocks = vi.hoisted(() => ({
  user: { profileId: "admin-profile", name: "مدير المالية", roles: ["admin"] as string[] },
  fetchCashflow: vi.fn(),
  fetchExecutiveLiquidity: vi.fn(),
  fetchOutcomes: vi.fn(),
  fetchMemoryCollection: vi.fn(),
  fetchInventory: vi.fn(),
  fetchShiftWorkspace: vi.fn(),
  fetchProcessBottlenecks: vi.fn(),
  startShift: vi.fn(),
  recordShiftCash: vi.fn(),
  recordShiftHandover: vi.fn(),
  captureShiftSnapshot: vi.fn(),
  acceptShiftHandover: vi.fn(),
  fetchPolicyCatalog: vi.fn(),
  fetchPolicyOwners: vi.fn(),
  fetchPolicySources: vi.fn(),
  fetchPolicyHistory: vi.fn(),
  registerPolicyMetadata: vi.fn(),
  simulatePolicy: vi.fn(),
  previewPolicyRollback: vi.fn(),
  createProposal: vi.fn(),
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
vi.mock("@/lib/intelligence/executive-liquidity-client", () => ({
  fetchExecutiveLiquidityWorkspace: mocks.fetchExecutiveLiquidity,
}));
vi.mock("@/lib/intelligence/inventory-intelligence-client", () => ({
  createInventoryIntelligencePeriod: vi.fn(() => ({ asOf: mocks.asOf, period: mocks.period })),
  fetchInventoryIntelligence: mocks.fetchInventory,
}));
vi.mock("@/lib/intelligence/decision-outcome-client", () => ({
  fetchDecisionOutcomes: mocks.fetchOutcomes,
  fetchDecisionOutcomeCollection: mocks.fetchMemoryCollection,
  createDecisionOutcomeProposal: mocks.createProposal,
  commandDecisionOutcome: vi.fn(),
}));
vi.mock("@/lib/intelligence/shift-operations-client", () => ({
  fetchOperationalShiftWorkspace: mocks.fetchShiftWorkspace,
  startOperationalShift: mocks.startShift,
  recordOperationalShiftCashCount: mocks.recordShiftCash,
  recordOperationalShiftHandover: mocks.recordShiftHandover,
  acceptOperationalShiftHandover: mocks.acceptShiftHandover,
  captureOperationalShiftSnapshot: mocks.captureShiftSnapshot,
}));
vi.mock("@/lib/intelligence/process-bottlenecks-client", () => ({
  fetchProcessBottlenecks: mocks.fetchProcessBottlenecks,
}));
vi.mock("@/lib/intelligence/commerce-policy-governance-client", () => ({
  fetchCommercePolicyCatalog: mocks.fetchPolicyCatalog,
  fetchCommercePolicyOwners: mocks.fetchPolicyOwners,
  fetchCommercePolicySources: mocks.fetchPolicySources,
  fetchCommercePolicySimulationHistory: mocks.fetchPolicyHistory,
  registerCommercePolicyMetadata: mocks.registerPolicyMetadata,
  simulateCommercePolicy: mocks.simulatePolicy,
  previewCommercePolicyRollback: mocks.previewPolicyRollback,
}));

vi.mock("@/components/reference-model/ai-governance/PromptGovernancePanel", () => ({
  PromptGovernancePanel: () => <section role="region" aria-label="حوكمة مكتبة أوامر الذكاء">prompt-governance-mounted</section>,
}));
vi.mock("@/components/reference-model/ai-governance/AiUsageAuditPanel", () => ({
  AiUsageAuditPanel: () => <section role="region" aria-label="تدقيق محاولات الذكاء">ai-usage-audit-mounted</section>,
}));
vi.mock("@/components/intelligence/AiGatewayOperationsPanel", () => ({
  AiGatewayOperationsPanel: () => <section role="region" aria-label="مركز تشغيل بوابة الذكاء">ai-gateway-operations-mounted</section>,
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

function scheduledInvoiceAmount() {
  const lineage = {
    evidenceIds: ["invoice:invoice-1"],
    formulaId: "nasr1.scheduled-invoice",
    formulaVersion: "1",
  };
  return {
    id: "scheduled-amount:invoice-1",
    key: "cashflow.scheduled_invoice",
    value: 375,
    currency: "YER",
    status: "VERIFIED" as const,
    completeness: "COMPLETE" as const,
    quality: "ACCEPTABLE" as const,
    asOf,
    lineage,
  };
}

function cashflowScheduleFixture() {
  const entry = {
    id: "scheduled-invoice-1",
    direction: "INFLOW" as const,
    dueDate: "2026-11-01",
    amount: scheduledInvoiceAmount(),
  };
  return {
    status: "VERIFIED" as const,
    completeness: "COMPLETE" as const,
    quality: "ACCEPTABLE" as const,
    entries: [entry],
    warnings: [],
  };
}

function cashflowFixture() {
  return {
    ok: true as const,
    data: {
      status: "OK" as const,
      requestId: "req-cashflow",
      asOf,
      period: { from: "2026-10-31", to: "2026-11-30" },
      currency: "YER",
      effectiveRole: "admin",
      completeness: "COMPLETE" as const,
      quality: "ACCEPTABLE" as const,
      schedule: cashflowScheduleFixture(),
      evidenceCount: 2,
      evidenceRecords: [
        evidence("invoice:invoice-1", "customer_invoices", asOf, { from: "2026-10-31", to: "2026-11-30" }),
        evidence("payment:payment-1", "customer_payments", asOf, { from: "2026-10-31", to: "2026-11-30" }),
      ].map((item) => ({ ...item, currency: "YER" })),
      measurementMetrics: [{
        metricKey: "cashflow.expected_collections" as const,
        value: 375,
        unit: "CURRENCY" as const,
        currency: "YER",
        status: "VERIFIED" as const,
        completeness: "COMPLETE" as const,
        quality: "ACCEPTABLE" as const,
        period: { from: "2026-10-31", to: "2026-11-30" },
        asOf,
        formulaId: "nasr1.receivables-outstanding",
        formulaVersion: "1",
        evidenceIds: ["invoice:invoice-1", "payment:payment-1"],
      }],
      warnings: [],
    },
  };
}

function decisionOutcomeFixture(id: string, expectedOutcome: string): DecisionOutcomeView {
  return {
    id,
    candidateId: "cashflow.expected_collections:YER:2026-10-31:2026-11-30",
    ruleId: "cashflow.collection.followup",
    ruleVersion: "1.0.0",
    state: "PROPOSED",
    version: 1,
    ownerProfileId: null,
    ownerLabel: "مدير المالية",
    expectedOutcome,
    reason: null,
    createdAt: asOf,
    updatedAt: asOf,
    approvedAt: null,
    assignedAt: null,
    executedAt: null,
    measuredOutcome: null,
    eventCount: 1,
    history: [{ id: id + "-event", type: "PROPOSED", version: 1, at: asOf, actorRole: "admin", reason: null }],
  };
}

function inventoryFixture(): InventoryIntelligenceData {
  const evidenceRecords = [
    evidence("movement-window:p1", "inventory.movement_history"),
    evidence("inventory-balance:p1", "inventory.current_balances", asOf, null),
    evidence("sales-window:p1", "orders.completed_sales_quantity"),
    evidence("purchase-receipt-item:r1", "purchase_receipt_items", "2026-10-20T09:00:00.000Z", null),
    evidence("purchase-order-commitments:p1", "purchase_orders.remaining_quantity", asOf, null),
  ];
  const available = metric("available:p1", "inventory.available_to_promise", 5, "QUANTITY", ["inventory-balance:p1"], null, "EA");
  const reorder = metric("reorder:p1", "inventory.reorder_point", 20, "QUANTITY", ["inventory-balance:p1"], null, "EA");
  const sold = metric("sold:p1", "inventory.sold_quantity_window", 30, "QUANTITY", ["sales-window:p1"], period, "EA");
  const lead = metric("lead:p1", "inventory.observed_supplier_lead_time_days", 10, "DAYS", ["purchase-receipt-item:r1"], null);
  const incoming = metric("incoming:p1", "inventory.incoming_purchase_order_quantity", 8, "QUANTITY", ["purchase-order-commitments:p1"], null, "EA");
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
      incomingPurchaseQuantity: incoming,
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
    mocks.fetchExecutiveLiquidity.mockReset().mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "executive liquidity fixture deliberately unavailable",
    });
    mocks.fetchOutcomes.mockReset().mockResolvedValue({ ok: true, items: [], total: 0 });
    mocks.fetchMemoryCollection.mockReset().mockResolvedValue({ ok: true, collection: { items: [], total: 0, loaded: 0, pageCount: 1, complete: true, reason: "COMPLETE" } });
    mocks.createProposal.mockReset().mockResolvedValue({ ok: true, duplicate: false });
    mocks.fetchInventory.mockReset().mockResolvedValue({ ok: true, data: inventoryFixture() });
    mocks.fetchShiftWorkspace.mockReset().mockResolvedValue({
      ok: false, status: "NOT_FOUND", message: "no shift for this date",
    });
    mocks.fetchProcessBottlenecks.mockReset().mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "process fixture unavailable",
    });
    mocks.startShift.mockReset().mockResolvedValue({ ok: true, data: { shiftId: "shift-1" } });
    mocks.recordShiftCash.mockReset().mockResolvedValue({ ok: true, data: {} });
    mocks.recordShiftHandover.mockReset().mockResolvedValue({ ok: true, data: {} });
    mocks.captureShiftSnapshot.mockReset().mockResolvedValue({ ok: true, data: {} });
    mocks.acceptShiftHandover.mockReset().mockResolvedValue({ ok: true, data: {} });
    mocks.fetchPolicyCatalog.mockReset().mockResolvedValue({ ok: true, data: {
      asOf: mocks.asOf, totalCount: 0, returnedCount: 0, completePopulation: true, items: [],
    } });
    mocks.fetchPolicyOwners.mockReset().mockResolvedValue({ ok: true, data: {
      items: [], totalCount: 0, returnedCount: 0, completePopulation: true,
    } });
    mocks.fetchPolicySources.mockReset().mockResolvedValue({ ok: true, data: {
      sourceTable: "pricing_rules", items: [], totalCount: 0, returnedCount: 0,
      completePopulation: true, asOf: mocks.asOf,
    } });
    mocks.fetchPolicyHistory.mockReset().mockResolvedValue({ ok: true, data: [] });
    mocks.registerPolicyMetadata.mockReset().mockResolvedValue({ ok: true, data: {} });
    mocks.simulatePolicy.mockReset().mockResolvedValue({ ok: true, data: {} });
    mocks.previewPolicyRollback.mockReset().mockResolvedValue({ ok: true, data: {} });
  });
  afterEach(() => cleanup());

  it("loads the complete stabilized decision-memory collection independently from the 50-row register page", async () => {
    const pageRecords = Array.from({ length: 50 }, (_, index) =>
      decisionOutcomeFixture("00000000-0000-4000-8000-" + (index + 1).toString(16).padStart(12, "0"), "قرار الصفحة التشغيلية " + (index + 1)));
    const older = decisionOutcomeFixture("00000000-0000-4000-8000-000000000051", "قرار أقدم خارج الصفحة التشغيلية");
    mocks.fetchOutcomes.mockReset()
      .mockResolvedValueOnce({ ok: true, items: pageRecords, total: 51 })
      .mockResolvedValueOnce({ ok: true, items: [older], total: 51 });
    mocks.fetchMemoryCollection.mockReset().mockResolvedValue({
      ok: true,
      collection: { items: [...pageRecords, older], total: 51, loaded: 51, pageCount: 1, complete: true, reason: "COMPLETE" },
    });
    render(<IntelligenceWorkspace />);
    const memoryBook = await screen.findByRole("region", { name: "دفتر ذاكرة القرارات والتعلم" });
    expect(memoryBook).toHaveTextContent("الصفحة 51 من 51");
    fireEvent.click(within(memoryBook).getByRole("button", { name: "الأقدم" }));
    fireEvent.click(within(memoryBook).getByRole("button", { name: "الأقدم" }));
    expect(await within(memoryBook).findByText("قرار أقدم خارج الصفحة التشغيلية")).toBeInTheDocument();
    expect(mocks.fetchMemoryCollection).toHaveBeenCalledTimes(1);
    const register = screen.getByRole("region", { name: "دورة القرارات المحفوظة" });
    fireEvent.click(within(register).getByRole("button", { name: "التالي" }));
    expect(await within(register).findByText("عرض 51–51 من 51")).toBeInTheDocument();
    expect(mocks.fetchOutcomes).toHaveBeenLastCalledWith(50, 50);
    expect(mocks.fetchMemoryCollection).toHaveBeenCalledTimes(1);
  });

  it("paginates the saved decision register with the server-provided total", async () => {
    const first = decisionOutcomeFixture("00000000-0000-4000-8000-000000000001", "قرار الصفحة الأولى");
    const second = decisionOutcomeFixture("00000000-0000-4000-8000-000000000002", "قرار الصفحة الثانية");
    mocks.fetchOutcomes.mockReset()
      .mockResolvedValueOnce({ ok: true, items: [first], total: 51 })
      .mockResolvedValueOnce({ ok: true, items: [second], total: 51 })
      .mockResolvedValueOnce({ ok: true, items: [first], total: 51 });
    render(<IntelligenceWorkspace />);
    const register = screen.getByRole("region", { name: "دورة القرارات المحفوظة" });
    expect(await within(register).findByText("قرار الصفحة الأولى")).toBeInTheDocument();
    expect(within(register).getByText("عرض 1–1 من 51")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "السابق" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "التالي" }));
    expect(await within(register).findByText("قرار الصفحة الثانية")).toBeInTheDocument();
    expect(within(register).queryByText("قرار الصفحة الأولى")).not.toBeInTheDocument();
    expect(mocks.fetchOutcomes).toHaveBeenNthCalledWith(2, 50, 50);
    expect(within(register).getByText("عرض 51–51 من 51")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "التالي" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "السابق" }));
    expect(await within(register).findByText("قرار الصفحة الأولى")).toBeInTheDocument();
    expect(mocks.fetchOutcomes).toHaveBeenNthCalledWith(3, 50, 0);
    expect(within(register).queryByText("قرار الصفحة الثانية")).not.toBeInTheDocument();
  });

  it("offers a retry action when loading the decision register fails", async () => {
    const recovered = decisionOutcomeFixture("00000000-0000-4000-8000-000000000003", "قرار مستعاد");
    mocks.fetchOutcomes.mockReset()
      .mockResolvedValueOnce({ ok: false, status: "UNAVAILABLE", message: "تعذر تحميل سجل القرارات." })
      .mockResolvedValueOnce({ ok: true, items: [recovered], total: 1 });
    render(<IntelligenceWorkspace />);
    const register = screen.getByRole("region", { name: "دورة القرارات المحفوظة" });
    expect(await within(register).findByText("تعذر تحميل سجل القرارات.")).toBeInTheDocument();
    fireEvent.click(within(register).getByRole("button", { name: "إعادة تحميل القرارات" }));
    expect(await within(register).findByText("قرار مستعاد")).toBeInTheDocument();
    expect(mocks.fetchOutcomes).toHaveBeenNthCalledWith(2, 50, 0);
  });

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
    expect(replenishment.textContent).toMatch(/7\s*EA/);
    expect(replenishment).toHaveTextContent("طلب مهلة التوريد");
    expect(replenishment).toHaveTextContent("الشراء التلقائي: ممنوع");

    expect(mocks.fetchInventory).toHaveBeenCalledTimes(1);
    expect(mocks.fetchInventory.mock.calls[0][0]).toEqual(period);
    expect(mocks.fetchInventory.mock.calls[0][1]).toBe(asOf);
    expect(mocks.fetchCashflow).toHaveBeenCalledTimes(1);
    expect(mocks.fetchOutcomes).toHaveBeenCalledTimes(1);
  });


  it("renders the server evidence passport, scheduled cashflows and an actionable verified collection decision without inventing liquidity", async () => {
    mocks.fetchCashflow.mockResolvedValue(cashflowFixture());
    render(<IntelligenceWorkspace />);

    const liquidity = await screen.findByRole("region", { name: "ملخص السيولة حسب العملة" });
    expect(liquidity).toHaveTextContent("الرصيد المتاح");
    expect(liquidity).toHaveTextContent("التحصيلات المتوقعة");
    expect(liquidity.textContent).toMatch(/(?:٣٧٥|375)\s*YER/);
    expect(liquidity).toHaveTextContent("صافي السيولة المتاحة");
    expect(liquidity).toHaveTextContent("غير متاح");

    expect(await screen.findByRole("heading", { name: "جواز الأدلة" })).toBeInTheDocument();
    const forecast = screen.getByRole("region", { name: "توقع التدفق النقدي" });
    expect(forecast.textContent).toMatch(/(?:٣٧٥|375)/);
    expect(forecast).toHaveTextContent("الرصيد المتوقع");
    expect(forecast).toHaveTextContent("غير متاح");
    expect(forecast).toHaveTextContent("غير متاح"); // No verified opening balance: projection remains withheld.

    const scheduledHeading = await screen.findByRole("heading", { name: "متابعة التحصيلات المجدولة" });
    const scheduledCard = scheduledHeading.closest("article");
    expect(scheduledCard).not.toBeNull();
    const persist = within(scheduledCard as HTMLElement).getByRole("button", { name: "حفظ الإجراء في دورة القرارات" });
    fireEvent.click(persist);
    await waitFor(() => expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: "cashflow.expected_collections:YER:2026-10-31:2026-11-30",
      ruleId: "cashflow.collection.followup",
      ruleVersion: "1.0.0",
      ownerProfileId: "admin-profile",
      expectedOutcome: "تسجيل المتابعة ونتيجة التحصيل من مستندات المؤسسة.",
    })));
  });

  it("mounts policy governance with real-client adapters but never runs a simulation automatically", async () => {
    render(<IntelligenceWorkspace />);
    expect(await screen.findByRole("region", { name: "حوكمة السياسات التجارية" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "سجل القواعد المسؤولة" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "مختبر «ماذا لو؟»" })).toBeInTheDocument();
    expect(mocks.fetchPolicyCatalog).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPolicyOwners).toHaveBeenCalledTimes(1);
    expect(mocks.fetchPolicySources).toHaveBeenCalledTimes(1);
    expect(mocks.simulatePolicy).not.toHaveBeenCalled();
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
    expect(screen.getAllByText(/المصدر غير متاح/).length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("0 EA")).not.toBeInTheDocument();
  });
  it("mounts the executive liquidity command center in the intelligence workspace", async () => {
    render(<IntelligenceWorkspace />);
    const commandCenter = await screen.findByRole("region", { name: "مركز القيادة المالية والسيولة" });
    expect(commandCenter).toHaveTextContent("executive liquidity fixture deliberately unavailable");
    expect(mocks.fetchExecutiveLiquidity).toHaveBeenCalledTimes(1);
  });

  it("mounts gateway operations, protected AI audit and prompt governance in the existing intelligence workspace", async () => {
    render(<IntelligenceWorkspace />);
    expect(await screen.findByRole("region", { name: "مركز تشغيل بوابة الذكاء" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "تدقيق محاولات الذكاء" })).toBeInTheDocument();
    expect(await screen.findByRole("region", { name: "حوكمة مكتبة أوامر الذكاء" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "حوكمة الذكاء ومراجعة التشغيل" })).toBeInTheDocument();
  });

});