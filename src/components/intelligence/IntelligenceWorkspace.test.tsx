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
  fetchProductGrossMargin: vi.fn(),
  fetchProductRevenueConcentration: vi.fn(),
  fetchSupplierPostedPayableActivity: vi.fn(),
  fetchCustomerRetention: vi.fn(),
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
  deferDecision: vi.fn(),
  resumeDecision: vi.fn(),
  fetchDecisionAssignees: vi.fn(),
  commandOutcome: vi.fn(),
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
vi.mock("@/lib/intelligence/customer-retention-client", () => ({
  fetchCustomerRetentionWorkspaceAggregate: mocks.fetchCustomerRetention,
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
  deferDecisionOutcome: mocks.deferDecision,
  resumeDeferredDecisionOutcome: mocks.resumeDecision,
  fetchDecisionOutcomeAssignees: mocks.fetchDecisionAssignees,
  commandDecisionOutcome: mocks.commandOutcome,
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
vi.mock("@/lib/intelligence/product-gross-margin-client", () => ({
  fetchProductGrossMargin: mocks.fetchProductGrossMargin,
}));
vi.mock("@/lib/intelligence/product-revenue-concentration-client", () => ({
  fetchProductRevenueConcentration: mocks.fetchProductRevenueConcentration,
}));
vi.mock("@/lib/intelligence/supplier-posted-payable-activity-client", () => ({
  fetchSupplierPostedPayableActivity: mocks.fetchSupplierPostedPayableActivity,
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

function productRevenueConcentrationFixture() {
  return {
    ok: true as const,
    snapshot: {
      status: "VERIFIED" as const,
      asOf,
      period,
      completePopulation: true,
      invoiceCount: 3,
      invoiceWithoutLinesCount: 0,
      currencyCount: 1,
      currencies: [{
        currency: "YER",
        status: "VERIFIED" as const,
        invoiceCount: 3,
        invoiceLineCount: 10,
        productCount: 5,
        mappedLineCount: 10,
        unmappedLineCount: 0,
        invalidCreditLineCount: 0,
        invoicesWithoutLines: 0,
        grossInvoiceLineAmount: 1200,
        netInvoiceLineAmount: 1000,
        top5NetInvoiceLineAmount: 800,
        top5ConcentrationPercent: 80,
      }],
      formulaId: "nasr1.invoice-line-product-concentration-net-posted-credit-memos" as const,
      formulaVersion: "1" as const,
      formulaDescription: "Product revenue concentration fixture from invoice lines.",
    },
  };
}

function supplierPayableActivityFixture(
  sourcePeriod: EvidencePeriod,
  top5Percent: number,
) {
  return {
    ok: true as const,
    snapshot: {
      status: "VERIFIED" as const,
      asOf,
      period: sourcePeriod,
      completeSourceAggregation: true,
      sourceEntryCount: 8,
      currencyCount: 1,
      currencies: [{
        currency: "YER",
        status: "VERIFIED" as const,
        supplierCount: 6,
        sourceEntryCount: 8,
        grossPayableCreditAmount: 1000,
        postedSupplierCreditNoteDebitAmount: 125,
        netPayableMovementAmount: 875,
        top5GrossPayableCreditAmount: top5Percent === 85 ? 850 : 800,
        top5GrossPayableCreditPercent: top5Percent,
      }],
      activityScope: "POSTED_SOURCE_LINKED_RECEIPT_AND_SUPPLIER_CREDIT_NOTE_JOURNALS" as const,
      formulaId: "nasr1.posted-supplier-payable-credit-concentration" as const,
      formulaVersion: "1" as const,
      formulaDescription: "Posted supplier payable activity fixture.",
    },
  };
}

describe("production intelligence workspace inventory screens", () => {
  beforeEach(() => {
    mocks.user = { profileId: "admin-profile", name: "مدير المالية", roles: ["admin"] };
    mocks.fetchCustomerRetention.mockReset().mockResolvedValue({ ok: false, status: "UNAVAILABLE", message: "customer retention fixture unavailable" });
    mocks.fetchCashflow.mockReset().mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "cashflow fixture deliberately unavailable",
    });
    mocks.fetchExecutiveLiquidity.mockReset().mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "executive liquidity fixture deliberately unavailable",
    });
    mocks.fetchOutcomes.mockReset().mockResolvedValue({ ok: true, items: [], total: 0 });
    mocks.fetchMemoryCollection.mockReset().mockResolvedValue({ ok: true, collection: { items: [], total: 0, loaded: 0, pageCount: 1, complete: true, reason: "COMPLETE" } });
    mocks.createProposal.mockReset().mockResolvedValue({ ok: true, duplicate: false });
    mocks.deferDecision.mockReset();
    mocks.resumeDecision.mockReset();
    mocks.fetchDecisionAssignees.mockReset().mockResolvedValue({ ok: true, items: [] });
    mocks.commandOutcome.mockReset();
    mocks.fetchInventory.mockReset().mockResolvedValue({ ok: true, data: inventoryFixture() });
    mocks.fetchShiftWorkspace.mockReset().mockResolvedValue({
      ok: false, status: "NOT_FOUND", message: "no shift for this date",
    });
    mocks.fetchProcessBottlenecks.mockReset().mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "process fixture unavailable",
    });
    mocks.fetchProductGrossMargin.mockReset().mockResolvedValue({
      ok: false, status: "DENIED", message: "gross margin finance source denied in workspace fixture",
    });
    mocks.fetchProductRevenueConcentration.mockReset().mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "product concentration source unavailable in fixture",
    });
    mocks.fetchSupplierPostedPayableActivity.mockReset().mockResolvedValue({
      ok: false, status: "UNAVAILABLE", message: "supplier payable source unavailable in fixture",
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

  it("defers an in-review decision with a required reason and exposes the immutable event", async () => {
    const review = {
      ...decisionOutcomeFixture("00000000-0000-4000-8000-000000000071", "قرار يحتاج مستنداً"),
      state: "IN_REVIEW" as const,
      version: 2,
      eventCount: 2,
      history: [
        decisionOutcomeFixture("00000000-0000-4000-8000-000000000071", "قرار يحتاج مستنداً").history[0],
        { id: "submit-71", type: "SUBMIT_FOR_REVIEW", version: 2, at: asOf, actorRole: "manager", reason: null },
      ],
    };
    const reason = "المستند الداعم لم يصل بعد";
    const deferred = {
      ...review,
      state: "DEFERRED" as const,
      version: 3,
      reason,
      updatedAt: asOf,
      eventCount: 3,
      history: [...review.history, {
        id: "defer-71", type: "DEFER", version: 3, at: asOf, actorRole: "admin", reason,
      }],
    };
    mocks.fetchOutcomes.mockReset()
      .mockResolvedValueOnce({ ok: true, items: [review], total: 1 })
      .mockResolvedValue({ ok: true, items: [deferred], total: 1 });
    mocks.deferDecision.mockResolvedValue({ ok: true, duplicate: false, outcome: deferred });
    render(<IntelligenceWorkspace />);

    const register = screen.getByRole("region", { name: "دورة القرارات المحفوظة" });
    const card = (await within(register).findByRole("heading", { name: "قرار يحتاج مستنداً" })).closest("article");
    expect(card).not.toBeNull();
    const reasonInput = within(card as HTMLElement).getByRole("textbox", { name: "سبب الاعتماد أو الرفض أو التأجيل" });
    const deferButton = within(card as HTMLElement).getByRole("button", { name: "تأجيل مع السبب" });
    expect(deferButton).toBeDisabled();
    fireEvent.change(reasonInput, { target: { value: "لا" } });
    expect(deferButton).toBeDisabled();
    fireEvent.change(reasonInput, { target: { value: reason } });
    expect(deferButton).toBeEnabled();
    fireEvent.click(deferButton);

    await waitFor(() => expect(mocks.deferDecision).toHaveBeenCalledWith({
      outcomeId: review.id,
      expectedVersion: 2,
      reason,
    }));
    await waitFor(() => {
      const deferredCard = within(register).getByRole("heading", { name: "قرار يحتاج مستنداً" }).closest("article");
      expect(deferredCard).toHaveTextContent("مؤجل");
      expect(deferredCard).toHaveTextContent("تأجيل القرار");
      expect(deferredCard).toHaveTextContent("السبب المحفوظ: " + reason);
    });
  });

  it("returns a deferred decision to review only after a reasoned resume command", async () => {
    const deferred = {
      ...decisionOutcomeFixture("00000000-0000-4000-8000-000000000072", "قرار مؤجل للمراجعة"),
      state: "DEFERRED" as const,
      version: 4,
      reason: "انتظار رد المورد",
      eventCount: 3,
      history: [
        decisionOutcomeFixture("00000000-0000-4000-8000-000000000072", "قرار مؤجل للمراجعة").history[0],
        { id: "submit-72", type: "SUBMIT_FOR_REVIEW", version: 2, at: asOf, actorRole: "manager", reason: null },
        { id: "defer-72", type: "DEFER", version: 3, at: asOf, actorRole: "admin", reason: "انتظار رد المورد" },
      ],
    };
    const reason = "وصل رد المورد وأصبح الملف جاهزاً";
    const resumed = {
      ...deferred,
      state: "IN_REVIEW" as const,
      version: 5,
      reason,
      updatedAt: asOf,
      eventCount: 4,
      history: [...deferred.history, {
        id: "resume-72", type: "RESUBMIT_FOR_REVIEW", version: 5, at: asOf, actorRole: "admin", reason,
      }],
    };
    mocks.fetchOutcomes.mockReset()
      .mockResolvedValueOnce({ ok: true, items: [deferred], total: 1 })
      .mockResolvedValue({ ok: true, items: [resumed], total: 1 });
    mocks.resumeDecision.mockResolvedValue({ ok: true, duplicate: false, outcome: resumed });
    render(<IntelligenceWorkspace />);

    const register = screen.getByRole("region", { name: "دورة القرارات المحفوظة" });
    const card = (await within(register).findByRole("heading", { name: "قرار مؤجل للمراجعة" })).closest("article");
    expect(card).not.toBeNull();
    const reasonInput = within(card as HTMLElement).getByRole("textbox", { name: "سبب إعادة القرار للمراجعة" });
    expect(within(card as HTMLElement).getByRole("button", { name: "إعادة للمراجعة" })).toBeDisabled();
    fireEvent.change(reasonInput, { target: { value: reason } });
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "إعادة للمراجعة" }));

    await waitFor(() => expect(mocks.resumeDecision).toHaveBeenCalledWith({
      outcomeId: deferred.id,
      expectedVersion: 4,
      reason,
    }));
    await waitFor(() => {
      const resumedCard = within(register).getByRole("heading", { name: "قرار مؤجل للمراجعة" }).closest("article");
      expect(resumedCard).toHaveTextContent("قيد المراجعة");
      expect(resumedCard).toHaveTextContent("إعادة للمراجعة");
      expect(resumedCard).toHaveTextContent("السبب المحفوظ: " + reason);
    });
  });

  it("shows an existing server-saved daily action instead of offering a duplicate proposal", async () => {
    const saved = {
      ...decisionOutcomeFixture("00000000-0000-4000-8000-000000000077", "مراجعة إعادة توريد الصنف SKU-1"),
      candidateId: "inventory.replenishment:SKU-1:" + asOf.slice(0, 10),
      ruleId: "inventory.replenishment.review",
      ruleVersion: "1.0.0",
      state: "IN_REVIEW" as const,
      version: 2,
      ownerProfileId: "admin-profile",
      ownerLabel: "مسؤول المشتريات",
      reason: "تم إرسال التوصية للمراجعة",
      candidateSnapshot: null,
    };
    mocks.fetchOutcomes.mockReset().mockResolvedValue({ ok: true, items: [saved], total: 1 });
    mocks.fetchMemoryCollection.mockReset().mockResolvedValue({
      ok: true,
      collection: { items: [saved], total: 1, loaded: 1, pageCount: 1, complete: true, reason: "COMPLETE" },
    });
    render(<IntelligenceWorkspace />);

    const status = await screen.findByTestId("daily-saved-decision");
    expect(status).toHaveTextContent("الإجراء محفوظ بالفعل في دورة القرارات");
    expect(status).toHaveTextContent("قيد المراجعة");
    expect(status).toHaveTextContent("الإصدار 2");
    expect(status).toHaveTextContent("مسؤول المشتريات");
    expect(status).toHaveTextContent("تم إرسال التوصية للمراجعة");
    expect(screen.queryByRole("button", { name: "حفظ الإجراء في دورة القرارات" })).not.toBeInTheDocument();
    expect(mocks.createProposal).not.toHaveBeenCalled();
  });

  it("assigns an approved decision to an active same-organization team member selected from the server directory", async () => {
    const approved = {
      ...decisionOutcomeFixture("00000000-0000-4000-8000-000000000099", "تسوية التزام مورد"),
      state: "APPROVED" as const,
      version: 3,
      approvedAt: asOf,
      ownerProfileId: null,
      ownerLabel: "غير معيّن",
      eventCount: 3,
      history: [
        decisionOutcomeFixture("00000000-0000-4000-8000-000000000099", "تسوية التزام مورد").history[0],
        { id: "submit-99", type: "SUBMIT_FOR_REVIEW", version: 2, at: asOf, actorRole: "manager", reason: null },
        { id: "approve-99", type: "APPROVE", version: 3, at: asOf, actorRole: "admin", reason: "تمت مراجعة مستندات المورد" },
      ],
    };
    const staffId = "33333333-3333-4333-8333-333333333333";
    const assigned = {
      ...approved,
      state: "ASSIGNED" as const,
      version: 4,
      ownerProfileId: staffId,
      ownerLabel: "مسؤول المخزون",
      assignedAt: asOf,
      eventCount: 4,
      history: [...approved.history, {
        id: "assign-99", type: "ASSIGN", version: 4, at: asOf, actorRole: "admin", reason: null,
      }],
    };
    mocks.fetchOutcomes.mockReset()
      .mockResolvedValueOnce({ ok: true, items: [approved], total: 1 })
      .mockResolvedValue({ ok: true, items: [assigned], total: 1 });
    mocks.fetchMemoryCollection.mockReset().mockResolvedValue({
      ok: true,
      collection: { items: [approved], total: 1, loaded: 1, pageCount: 1, complete: true, reason: "COMPLETE" },
    });
    mocks.fetchDecisionAssignees.mockResolvedValue({
      ok: true,
      items: [
        { profileId: "22222222-2222-4222-8222-222222222222", fullName: "مدير المالية", email: "finance@example.test", roles: ["admin"] },
        { profileId: staffId, fullName: "مسؤول المخزون", email: "stock@example.test", roles: ["staff", "warehouse"] },
      ],
    });
    mocks.commandOutcome.mockResolvedValue({ ok: true, duplicate: false, outcome: assigned });
    render(<IntelligenceWorkspace />);

    const register = screen.getByRole("region", { name: "دورة القرارات المحفوظة" });
    const card = (await within(register).findByRole("heading", { name: "تسوية التزام مورد" })).closest("article");
    expect(card).not.toBeNull();
    const select = await within(card as HTMLElement).findByRole("combobox", { name: "تعيين القرار إلى عضو من المؤسسة" });
    fireEvent.change(select, { target: { value: staffId } });
    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "تثبيت المسؤول" }));

    await waitFor(() => expect(mocks.commandOutcome).toHaveBeenCalledWith(expect.objectContaining({
      outcomeId: approved.id,
      expectedVersion: 3,
      eventType: "ASSIGN",
      ownerProfileId: staffId,
    })));
    await waitFor(() => expect(within(register).getByText("مسؤول المخزون")).toBeInTheDocument());
  });

  it("keeps saved concentration decisions scoped as ratios and never offers cash measurement", async () => {
    const currentPeriod = { from: "2026-08-01", to: "2026-10-31" };
    const baselinePeriod = { from: "2026-05-01", to: "2026-07-31" };
    const candidateId = "finance.product-concentration.review-increase.YER:metric:product.revenue.top5_concentration_change:YER:" + asOf;
    const ruleId = "finance.product-concentration.review-increase.YER";
    const outcome = {
      ...decisionOutcomeFixture("00000000-0000-4000-8000-000000000088", "متابعة تقييم تركّز المنتجات"),
      candidateId,
      ruleId,
      state: "EXECUTED" as const,
      version: 6,
      ownerProfileId: "admin-profile",
      executedAt: asOf,
      candidateSnapshot: {
        schemaVersion: "1.0.0" as const,
        candidateId,
        ruleId,
        ruleVersion: "1.0.0",
        priority: "P3" as const,
        priorityScore: 100,
        what: "مراجعة ارتفاع تركّز مبيعات المنتجات",
        why: "ارتفعت حصة أعلى خمسة منتجات",
        risk: "زيادة الاعتماد على مجموعة أصغر",
        soWhat: "مراجعة مخاطر التوريد",
        whatNext: "راجع توافر الأصناف والبدائل",
        owner: "مدير المبيعات والمخزون",
        expectedOutcome: "متابعة تقييم تركّز المنتجات",
        impact: null,
        impactStatus: "NOT_CONFIGURED" as const,
        impactReason: "NO_APPROVED_IMPACT_FORMULA",
        proof: {
          evidenceIds: [
            "rpc:product-revenue-concentration:YER:" + currentPeriod.from + ":" + currentPeriod.to + ":" + asOf,
            "rpc:product-revenue-concentration:YER:" + baselinePeriod.from + ":" + baselinePeriod.to + ":" + asOf,
          ],
          metricKeys: ["product.revenue.top5_concentration_change:YER"],
          asOf,
          formulaVersions: ["nasr1.top5-product-revenue-concentration-period-delta@1.0.0"],
        },
        createdAt: asOf,
        expiresAt: null,
      },
    };
    mocks.fetchOutcomes.mockReset().mockResolvedValue({ ok: true, items: [outcome], total: 1 });
    render(<IntelligenceWorkspace />);

    const register = screen.getByRole("region", { name: "دورة القرارات المحفوظة" });
    const heading = await within(register).findByRole("heading", { name: "متابعة تقييم تركّز المنتجات" });
    const card = heading.closest("article");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("تركيز مبيعات المنتجات");
    expect(card).toHaveTextContent("YER");
    expect(card).toHaveTextContent("الفترة: 2026-08-01 — 2026-10-31");
    expect(card).toHaveTextContent("الفترة المقارنة: 2026-05-01 — 2026-07-31");
    expect(card).toHaveTextContent("لقطة المصدر: " + asOf);
    expect(card).toHaveTextContent("لقطتا RPC تجميعيّتان");
    expect(card).toHaveTextContent("هذا المؤشر نسبة تركّز وليس مبلغاً نقدياً");
    expect(within(card as HTMLElement).queryByRole("button", { name: /قياس|اعتماد قياس/ })).not.toBeInTheDocument();
  });

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

  it("turns a verified replenishment recommendation into a saveable daily decision with withheld financial impact", async () => {
    render(<IntelligenceWorkspace />);

    const heading = await screen.findByRole("heading", { name: /مراجعة إعادة توريد الصنف SKU-1/ });
    const actionCard = heading.closest("article");
    expect(actionCard).not.toBeNull();
    expect(actionCard).toHaveTextContent("الأثر غير متاح");
    expect(actionCard).toHaveTextContent("طلب مهلة التوريد");

    fireEvent.click(within(actionCard as HTMLElement).getByRole("button", { name: "حفظ الإجراء في دورة القرارات" }));
    await waitFor(() => expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: expect.stringMatching(/^inventory\.replenishment:SKU-1:/),
      ruleId: "inventory.replenishment.review",
      ruleVersion: "1.0.0",
      ownerProfileId: "admin-profile",
      candidateSnapshot: expect.objectContaining({
        priority: "P2",
        impact: null,
        impactStatus: "WITHHELD",
        impactReason: "UNIT_COST_OR_CURRENCY_NOT_VERIFIED",
      }),
    })));
  });

  it("promotes verified customer retention follow-ups into the daily decision lifecycle", async () => {
    mocks.fetchCustomerRetention.mockReset().mockResolvedValue({
      retentionResult: {
        ok: true,
        data: {
          id: "retention-board-fixture", asOf,
          period: { from: "2026-10-01", to: "2026-10-29" },
          previousPeriod: { from: "2026-09-01", to: "2026-09-30" },
          status: "VERIFIED",
          population: { total: 1, activeCurrentPeriod: 0, priorPeriodCohort: 1, retainedCustomers: 0, repeatPurchaseCustomers: 0 },
          retentionRate: 0, repeatPurchaseRate: null, averageOrdersPerActiveCustomer: null,
          activity: { active30Days: 0, cooling31To60Days: 0, atRisk61To90Days: 0, inactiveOver90Days: 1, noOrderDate: 0 },
          focusByCurrency: [], customers: [], warnings: [],
        },
        actionQueue: {
          status: "VERIFIED",
          actions: [{
            customerRef: "customer-retention-1", priority: "HIGH", action: "REACTIVATE", activity: "INACTIVE",
            daysSinceLastOrder: 100, lastOrderAt: "2026-07-23T09:00:00.000Z",
            orderCountCurrent: 0, orderCountPrevious: 1,
            reason: "لم يظهر طلب منذ أكثر من 90 يوماً؛ راجع سبب الانقطاع قبل تقديم عرض استعادة.",
            evidenceIds: ["evidence:retention:current", "evidence:retention:previous"],
            metricIds: ["metric:retention:current", "metric:retention:previous"],
            metricKeys: ["customer.orders.current", "customer.orders.previous"],
            formulaVersions: ["customer-order-count@1.0.0", "customer-order-count@1.0.0"],
          }],
          totalActionable: 3, omittedCount: 2, withheldCustomerCount: 0, warnings: [],
        },
        growthInputs: {
          evidenceRecords: [
            evidence("evidence:retention:current", "retention.source", asOf, period),
            evidence("evidence:retention:previous", "retention.source", asOf, { from: "2026-09-01", to: "2026-09-30" }),
          ],
          metrics: [
            metric("metric:retention:current", "customer.orders.current", 0, "COUNT", ["evidence:retention:current"], period),
            metric("metric:retention:previous", "customer.orders.previous", 1, "COUNT", ["evidence:retention:previous"], { from: "2026-09-01", to: "2026-09-30" }),
          ],
          signals: [], sourceSnapshotVerified: true,
        },
      },
      growthRadar: null, demandForecast: null, productCoverage: null, unavailableDemandCoverage: null,
    });
    mocks.fetchCashflow.mockResolvedValue(cashflowFixture());
    render(<IntelligenceWorkspace />);

    const actionHeading = await screen.findByRole("heading", { name: /إعادة تنشيط العميل · custome…on-1/ });
    const card = actionHeading.closest("article");
    expect(card).not.toBeNull();
    expect(card).toHaveTextContent("الأثر غير متاح؛ لم تثبت معادلته أو مدخلاته");
    expect(card).toHaveTextContent("evidence:retention:current");
    expect(card).toHaveTextContent("customer.orders.current");
    const actionSummary = await screen.findByText((_, element) =>
      element?.tagName === "P" && element.getAttribute("role") === "status" &&
      Boolean(element.textContent?.includes("يعرض المركز ")),
    );
    expect(actionSummary.textContent).toContain("يعرض المركز ");
    expect(actionSummary.textContent).toContain("إجراءً مرتباً حسب الأولوية");
    expect(actionSummary).toHaveTextContent("تم إرجاء 2 إجراءً خارج القائمة المختصرة");
    const claims = screen.getByRole("region", { name: "جوازات أدلة الادعاءات" });
    expect(await within(claims).findByText(/إعادة تنشيط العميل/)).toBeInTheDocument();

    fireEvent.click(within(card as HTMLElement).getByRole("button", { name: "حفظ الإجراء في دورة القرارات" }));
    await waitFor(() => expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({
      candidateId: "customer.retention:customer-retention-1:2026-10-31",
      ruleId: "customers.retention.follow-up", ruleVersion: "1.0.0",
      expectedOutcome: expect.stringContaining("دون احتساب إيراد مسترد"),
      candidateSnapshot: expect.objectContaining({
        priority: "P1", priorityScore: 300, impact: null,
        impactStatus: "WITHHELD", impactReason: "CUSTOMER_FINANCIAL_VALUE_NOT_AVAILABLE",
        proof: expect.objectContaining({
          evidenceIds: ["evidence:retention:current", "evidence:retention:previous"],
          metricKeys: ["customer.orders.current", "customer.orders.previous"],
          formulaVersions: ["customer-order-count@1.0.0", "customer-order-count@1.0.0"],
        }),
      }),
    })));
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


  it("passes exact current and adjacent prior-period sources into the existing business health map", async () => {
    mocks.fetchProductRevenueConcentration
      .mockResolvedValueOnce(productRevenueConcentrationFixture())
      .mockResolvedValueOnce({
        ...productRevenueConcentrationFixture(),
        snapshot: {
          ...productRevenueConcentrationFixture().snapshot,
          period: { from: "2026-05-01", to: "2026-07-31" },
          currencies: productRevenueConcentrationFixture().snapshot.currencies.map(row => ({
            ...row, top5ConcentrationPercent: 75, top5NetInvoiceLineAmount: 750,
          })),
        },
      });
    mocks.fetchSupplierPostedPayableActivity
      .mockResolvedValueOnce(supplierPayableActivityFixture(period, 85))
      .mockResolvedValueOnce(supplierPayableActivityFixture({ from: "2026-05-01", to: "2026-07-31" }, 80));

    render(<IntelligenceWorkspace />);

    const map = await screen.findByRole("region", { name: "خريطة صحة العمل ورأس المال المحجوز" });
    expect(map).toHaveTextContent("تركيز قيمة سطور الفواتير حسب المنتج والعملة");
    expect(map).toHaveTextContent("Product revenue concentration fixture from invoice lines.");
    expect(map).toHaveTextContent("حركة الالتزامات المنشورة للموردين");
    expect(map).toHaveTextContent("صافي حركة الالتزام ضمن النطاق");
    expect(map).toHaveTextContent("ارتفع التركّز");

    expect(mocks.fetchProductRevenueConcentration).toHaveBeenNthCalledWith(1, {
      from: period.from, to: period.to, asOf,
    });
    expect(mocks.fetchProductRevenueConcentration).toHaveBeenNthCalledWith(2, {
      from: "2026-05-01", to: "2026-07-31", asOf,
    });
    expect(mocks.fetchSupplierPostedPayableActivity).toHaveBeenNthCalledWith(1, {
      from: period.from, to: period.to, asOf,
    });
    expect(mocks.fetchSupplierPostedPayableActivity).toHaveBeenNthCalledWith(2, {
      from: "2026-05-01", to: "2026-07-31", asOf,
    });

    const productDecision = await screen.findByRole("heading", { name: /مراجعة ارتفاع تركّز مبيعات المنتجات · YER/ });
    const productCard = productDecision.closest("article");
    expect(productCard).not.toBeNull();
    expect(productCard).toHaveTextContent("75%");
    expect(productCard).toHaveTextContent("80%");
    expect(productCard).toHaveTextContent("لم تُهيأ معادلة أثر معتمدة");
    const dailyConcentrationScope = screen.getAllByRole("note").find(note =>
      note.textContent?.includes("تركيز مبيعات المنتجات"),
    );
    expect(dailyConcentrationScope).toBeDefined();
    expect(dailyConcentrationScope).toHaveTextContent("الفترة الحالية: 2026-08-01 — 2026-10-31");
    expect(dailyConcentrationScope).toHaveTextContent("المقارنة: 2026-05-01 — 2026-07-31");
    expect(dailyConcentrationScope).toHaveTextContent("وقت اللقطة: " + asOf);
    expect(dailyConcentrationScope).toHaveTextContent("لقطتا RPC تجميعيّتان");
    fireEvent.click(within(productCard as HTMLElement).getByRole("button", { name: "حفظ الإجراء في دورة القرارات" }));
    await waitFor(() => expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({
      ruleId: "finance.product-concentration.review-increase.YER",
      candidateSnapshot: expect.objectContaining({
        impact: null,
        impactStatus: "NOT_CONFIGURED",
        proof: expect.objectContaining({
          evidenceIds: expect.arrayContaining([
            expect.stringContaining("rpc:product-revenue-concentration:YER:"),
          ]),
          metricKeys: expect.arrayContaining(["product.revenue.top5_concentration_change:YER"]),
          formulaVersions: expect.arrayContaining(["nasr1.top5-product-revenue-concentration-period-delta@1.0.0"]),
        }),
      }),
    })));

    const supplierDecision = await screen.findByRole("heading", { name: /مراجعة ارتفاع تركّز التزامات الموردين · YER/ });
    const supplierCard = supplierDecision.closest("article");
    expect(supplierCard).not.toBeNull();
    expect(supplierCard).toHaveTextContent("80%");
    expect(supplierCard).toHaveTextContent("85%");
    fireEvent.click(within(supplierCard as HTMLElement).getByRole("button", { name: "حفظ الإجراء في دورة القرارات" }));
    await waitFor(() => expect(mocks.createProposal).toHaveBeenCalledWith(expect.objectContaining({
      ruleId: "finance.supplier-concentration.review-increase.YER",
      candidateSnapshot: expect.objectContaining({
        impact: null,
        impactStatus: "NOT_CONFIGURED",
        proof: expect.objectContaining({
          evidenceIds: expect.arrayContaining([
            expect.stringContaining("rpc:supplier-posted-payable-activity:YER:"),
          ]),
          metricKeys: expect.arrayContaining(["supplier.posted_payable.top5_concentration_change:YER"]),
        }),
      }),
    })));
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
    const claims = screen.getByRole("region", { name: "جوازات أدلة الادعاءات" });
    expect(within(claims).getAllByTestId("claim-evidence-card").length).toBeGreaterThan(0);
    expect(claims).toHaveTextContent("مشاهدة / ادعاء وصفي");
    expect(claims).toHaveTextContent("محرك أو عامل مرتبط");
    expect(claims).toHaveTextContent("لا توجد حالياً دراسة سببية مستقلة مقبولة");
    expect(await within(claims).findByText(/قراءة مشتركة لمؤشر التحصيلات المجدولة/)).toBeInTheDocument();
    expect(claims).toHaveTextContent("CROSS-DOMAIN REVIEW REQUIRED");
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
      candidateSnapshot: expect.objectContaining({
        schemaVersion: "1.0.0",
        candidateId: "cashflow.expected_collections:YER:2026-10-31:2026-11-30",
        priority: "P2",
        priorityScore: 200,
        impact: expect.objectContaining({
          value: 375,
          unit: "CURRENCY",
          currency: "YER",
          formulaId: "cashflow.expected-collection-impact",
          formulaVersion: "1.0.0",
          sourceMetricIds: ["metric:cashflow.expected-collections:YER:2026-10-31:2026-11-30"],
        }),
        impactStatus: "CALCULATED",
        proof: expect.objectContaining({
          evidenceIds: ["invoice:invoice-1", "payment:payment-1"],
          metricKeys: ["cashflow.expected_collections"],
          formulaVersions: expect.arrayContaining([
            "nasr1.receivables-outstanding@1",
            "cashflow.expected-collection-impact@1.0.0",
          ]),
        }),
      }),
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
  it("loads the finance-authorized product gross margin card independently in the intelligence workspace", async () => {
    render(<IntelligenceWorkspace />);
    const margin = await screen.findByRole("region", { name: "الربحية الإجمالية حسب المنتج" });
    expect(margin).toHaveTextContent("gross margin finance source denied in workspace fixture");
    expect(mocks.fetchProductGrossMargin).toHaveBeenCalledTimes(1);
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


  it("mounts the daily decision board before the full decision memory book", async () => {
    mocks.fetchMemoryCollection.mockReset().mockResolvedValue({
      ok: true,
      collection: {
        items: [decisionOutcomeFixture("00000000-0000-4000-8000-000000000991", "قرار اختبار لوحة القرارات اليومية")],
        total: 1,
        loaded: 1,
        pageCount: 1,
        complete: true,
        reason: "COMPLETE",
      },
    });
    render(<IntelligenceWorkspace />);

    const board = await screen.findByRole("region", { name: "لوحة متابعة القرارات اليومية" });
    expect(board).toHaveTextContent("قرار اختبار لوحة القرارات اليومية");

    const memoryBook = await screen.findByRole("region", { name: "دفتر ذاكرة القرارات والتعلم" });
    expect(memoryBook).toHaveTextContent("قرار اختبار لوحة القرارات اليومية");
    expect(
      board.compareDocumentPosition(memoryBook) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(mocks.fetchMemoryCollection).toHaveBeenCalledTimes(1);
  });

});