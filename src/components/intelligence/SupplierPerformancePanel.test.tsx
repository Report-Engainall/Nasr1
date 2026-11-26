// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { SupplierPerformanceResult } from "@/lib/intelligence/supplier-performance";
import { SupplierPerformancePanel } from "./SupplierPerformancePanel";

function supplierResult(overrides: Partial<SupplierPerformanceResult> = {}): SupplierPerformanceResult {
 const base: SupplierPerformanceResult = {
  state: "READY",
  asOf: "2026-11-27T01:00:00.000Z",
  period: { from: "2026-11-01", to: "2026-11-26", timeZone: "UTC" },
  totalSupplierCount: 1,
  returnedSupplierCount: 1,
  completePopulation: true,
  suppliers: [{
   supplierId: "11111111-1111-4111-8111-111111111111",
   supplierName: "مورد ألف",
   supplierCode: "SUP-01",
   purchaseOrderCount: 6,
   completedOrderCount: 4,
   openOrderCount: 1,
   inconsistentReceivedCount: 1,
   backlogLineCount: 2,
   leadTimeSampleCount: 4,
   averageLeadDays: 3,
   medianLeadDays: 2,
   p90LeadDays: 6,
   promisedDeliverySampleCount: 3,
   onTimeCount: 2,
   onTimePercent: 66.7,
   completedWithoutPromiseCount: 1,
   latestSubmittedAt: "2026-11-25T09:00:00.000Z",
   recentOrders: [{
    purchaseOrderId: "22222222-2222-4222-8222-222222222222",
    purchaseOrderNumber: "PO-006",
    status: "partially_received",
    submittedAt: "2026-11-25T09:00:00.000Z",
    lastReceivedAt: "2026-11-26T09:00:00.000Z",
    lineCount: 2,
    pendingLineCount: 1,
    receiptCount: 1,
    actualLeadDays: null,
    promisedDeliveryDays: 5,
    onTime: null,
   }],
  }],
  withheldReasons: [],
 };
 return { ...base, ...overrides };
}

describe("SupplierPerformancePanel operational follow-up", () => {
 it("surfaces receipt, backlog, missing-promise and late-delivery signals from source counts", () => {
  render(<SupplierPerformancePanel result={supplierResult()} state="ready" />);
  const section = screen.getByRole("region", { name: "ملاحظات متابعة الموردين" });

  expect(within(section).getByText(/استلام غير متسق/)).toBeInTheDocument();
  expect(within(section).getByText(/سطور استلام معلقة/)).toBeInTheDocument();
  expect(within(section).getByText(/مدة توريد غير مسجلة/)).toBeInTheDocument();
  expect(within(section).getByText(/تسليم بعد الموعد الموعود/)).toBeInTheDocument();
  expect(within(section).getByText(/لا يعني العدد وحده أن الموعد متأخر/)).toBeInTheDocument();
 });

 it("does not infer late deliveries from fewer than three promised samples", () => {
  const base = supplierResult();
  const value = supplierResult({
   suppliers: base.suppliers.map(supplier => ({
    ...supplier,
    promisedDeliverySampleCount: 2,
    onTimeCount: 0,
   })),
  });
  render(<SupplierPerformancePanel result={value} state="ready" />);
  const section = screen.getByRole("region", { name: "ملاحظات متابعة الموردين" });

  expect(within(section).queryByText(/تسليم بعد الموعد الموعود/)).not.toBeInTheDocument();
 });

 it("labels follow-up insights as partial when the supplier population is incomplete", () => {
  const value = supplierResult({
   state: "PARTIAL",
   totalSupplierCount: 5,
   returnedSupplierCount: 1,
   completePopulation: false,
  });
  render(<SupplierPerformancePanel result={value} state="ready" />);

  expect(screen.getByText(/هذه الملاحظات تخص الموردين المعروضين فقط/)).toBeInTheDocument();
 });
});
