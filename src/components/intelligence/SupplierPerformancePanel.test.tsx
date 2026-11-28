// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SupplierPerformanceResult, SupplierPerformanceSupplier } from "@/lib/intelligence/supplier-performance";
import { buildSupplierPerformanceCsv, downloadIntelligenceCsv } from "@/lib/intelligence/intelligence-csv";
vi.mock("@/lib/intelligence/intelligence-csv", async (importOriginal) => {
 const original = await importOriginal<typeof import("@/lib/intelligence/intelligence-csv")>();
 return { ...original, downloadIntelligenceCsv: vi.fn() };
});
import { filterSupplierPerformanceSuppliers, SupplierPerformancePanel } from "./SupplierPerformancePanel";

const lateSupplier: SupplierPerformanceSupplier = {
  supplierId: "11111111-1111-4111-8111-111111111111",
  supplierName: "مورد متأخر",
  supplierCode: "SUP-LATE",
  purchaseOrderCount: 5, completedOrderCount: 3, openOrderCount: 1,
  inconsistentReceivedCount: 1, backlogLineCount: 2, leadTimeSampleCount: 3,
  averageLeadDays: 9, medianLeadDays: 8, p90LeadDays: 12,
  promisedDeliverySampleCount: 3, onTimeCount: 1, onTimePercent: 33.3,
  completedWithoutPromiseCount: 0,
  latestSubmittedAt: "2026-11-20T09:00:00.000Z",
  recentOrders: [{
    purchaseOrderId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    purchaseOrderNumber: "PO-LATE-01", status: "received",
    submittedAt: "2026-11-20T09:00:00.000Z",
    lastReceivedAt: "2026-11-27T09:00:00.000Z",
    lineCount: 3, pendingLineCount: 0, receiptCount: 1,
    actualLeadDays: 7, promisedDeliveryDays: 5, onTime: false,
  }],
};

const reliableSupplier: SupplierPerformanceSupplier = {
  supplierId: "22222222-2222-4222-8222-222222222222",
  supplierName: "مورد منتظم",
  supplierCode: "SUP-OK",
  purchaseOrderCount: 4, completedOrderCount: 4, openOrderCount: 0,
  inconsistentReceivedCount: 0, backlogLineCount: 0, leadTimeSampleCount: 4,
  averageLeadDays: 4, medianLeadDays: 4, p90LeadDays: 5,
  promisedDeliverySampleCount: 4, onTimeCount: 4, onTimePercent: 100,
  completedWithoutPromiseCount: 0,
  latestSubmittedAt: "2026-11-24T09:00:00.000Z",
  recentOrders: [{
    purchaseOrderId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    purchaseOrderNumber: "PO-OK-01", status: "received",
    submittedAt: "2026-11-22T09:00:00.000Z",
    lastReceivedAt: "2026-11-26T09:00:00.000Z",
    lineCount: 2, pendingLineCount: 0, receiptCount: 1,
    actualLeadDays: 4, promisedDeliveryDays: 5, onTime: true,
  }],
};

const result: SupplierPerformanceResult = {
  state: "READY", asOf: "2026-11-28T02:00:00.000Z",
  period: { from: "2026-10-01", to: "2026-11-28", timeZone: "UTC" },
  totalSupplierCount: 2, returnedSupplierCount: 2, completePopulation: true,
  suppliers: [lateSupplier, reliableSupplier], withheldReasons: [],
};

describe("SupplierPerformancePanel triage", () => {
  it("filters suppliers by actual late delivery, open receipt backlog, and inconsistent receipt counts", () => {
    expect(filterSupplierPerformanceSuppliers(result.suppliers, "LATE").map(item => item.supplierCode))
      .toEqual(["SUP-LATE"]);
    expect(filterSupplierPerformanceSuppliers(result.suppliers, "BACKLOG").map(item => item.supplierCode))
      .toEqual(["SUP-LATE"]);
    expect(filterSupplierPerformanceSuppliers(result.suppliers, "INCONSISTENT").map(item => item.supplierCode))
      .toEqual(["SUP-LATE"]);
    expect(filterSupplierPerformanceSuppliers(result.suppliers, "ALL")).toHaveLength(2);
  });

  it("orders supplier follow-ups by inconsistent receipts, verified lateness, then receipt backlog", () => {
    expect(filterSupplierPerformanceSuppliers([reliableSupplier, lateSupplier], "ALL").map(item=>item.supplierCode))
      .toEqual(["SUP-LATE","SUP-OK"]);
  });

  it("searches by supplier code and Arabic name", () => {
    expect(filterSupplierPerformanceSuppliers(result.suppliers, "ALL", "sup-ok"))
      .toEqual([reliableSupplier]);
    expect(filterSupplierPerformanceSuppliers(result.suppliers, "ALL", "مورد متأخر"))
      .toEqual([lateSupplier]);
  });

  it("exports only the suppliers selected by the current triage filter", () => {
    render(<SupplierPerformancePanel result={result} />);
    const region = screen.getByRole("region", { name: "ذكاء أداء الموردين" });
    fireEvent.click(within(region).getByRole("button", { name: /تأخر مسجل/ }));
    fireEvent.click(within(region).getByRole("button", { name: /تصدير الموردين المطابقين CSV/ }));
    expect(downloadIntelligenceCsv).toHaveBeenCalledWith(
      buildSupplierPerformanceCsv(result, [lateSupplier]),
      "aghbari-supplier-performance.csv",
    );
    const csv = buildSupplierPerformanceCsv(result, [lateSupplier]);
    expect(csv).toContain("PO-LATE-01");
    expect(csv).toContain("SUP-LATE");
    expect(csv).toContain("لا يتضمن الملف أسعار الشراء");
    expect(csv).not.toContain("unit_cost");
  });

  it("opens the exact late purchase order from its follow-up note", () => {
    const onOpenPurchaseOrder = vi.fn();
    render(<SupplierPerformancePanel result={result} onOpenPurchaseOrder={onOpenPurchaseOrder} />);
    const region = screen.getByRole("region", { name: "ذكاء أداء الموردين" });
    fireEvent.click(within(region).getByRole("button", { name: /تأخر مسجل/ }));
    fireEvent.click(within(region).getByRole("button", { name: "فتح أمر PO-LATE-01" }));
    expect(onOpenPurchaseOrder).toHaveBeenCalledWith("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
  });

  it("lets the manager open the late-delivery queue in the existing panel", () => {
    render(<SupplierPerformancePanel result={result} />);
    const region = screen.getByRole("region", { name: "ذكاء أداء الموردين" });
    expect(within(region).getByText("2 من 2 مورداً معروضاً")).toBeInTheDocument();
    fireEvent.click(within(region).getByRole("button", { name: /تأخر مسجل/ }));
    expect(within(region).getAllByText("مورد متأخر").length).toBeGreaterThan(0);
    expect(within(region).queryByText("مورد منتظم")).not.toBeInTheDocument();
    expect(within(region).getByText("1 من 2 مورداً معروضاً")).toBeInTheDocument();
  });
});
