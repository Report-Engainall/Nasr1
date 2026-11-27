import { describe, expect, it } from "vitest";
import { buildSupplierPerformance, parseSupplierPerformanceSnapshot } from "./supplier-performance";

const AS_OF = "2026-11-26T12:00:00.000Z";
const SOURCE = "purchase_orders + purchase_order_items + purchase_receipts + awarded supplier quote delivery terms";

function snapshot() {
  return {
    asOf: AS_OF,
    period: { from: "2026-11-01", to: "2026-11-25", timeZone: "UTC" },
    source: SOURCE,
    totalSupplierCount: 1,
    returnedSupplierCount: 1,
    resultLimit: 100,
    completePopulation: true,
    suppliers: [{
      supplierId: "11111111-1111-4111-8111-111111111111",
      supplierName: "مورد تجريبي من سجل المشتريات",
      supplierCode: "SUP-01",
      purchaseOrderCount: 4,
      completedOrderCount: 2,
      openOrderCount: 1,
      inconsistentReceivedCount: 1,
      backlogLineCount: 1,
      leadTimeSampleCount: 2,
      averageLeadDays: 2.5,
      medianLeadDays: 2.5,
      p90LeadDays: 3.7,
      promisedDeliverySampleCount: 1,
      onTimeCount: 1,
      completedWithoutPromiseCount: 1,
      latestSubmittedAt: "2026-11-12T09:00:00.000Z",
      recentOrders: [
        {
          purchaseOrderId: "22222222-2222-4222-8222-222222222222",
          purchaseOrderNumber: "PO-004",
          status: "received",
          submittedAt: "2026-11-12T09:00:00.000Z",
          lastReceivedAt: null,
          lineCount: 1,
          pendingLineCount: 0,
          receiptCount: 0,
          actualLeadDays: null,
          promisedDeliveryDays: null,
          onTime: null
        },
        {
          purchaseOrderId: "33333333-3333-4333-8333-333333333333",
          purchaseOrderNumber: "PO-003",
          status: "partially_received",
          submittedAt: "2026-11-10T09:00:00.000Z",
          lastReceivedAt: "2026-11-11T09:00:00.000Z",
          lineCount: 2,
          pendingLineCount: 1,
          receiptCount: 1,
          actualLeadDays: null,
          promisedDeliveryDays: 5,
          onTime: null
        },
        {
          purchaseOrderId: "44444444-4444-4444-8444-444444444444",
          purchaseOrderNumber: "PO-002",
          status: "received",
          submittedAt: "2026-11-04T09:00:00.000Z",
          lastReceivedAt: "2026-11-08T09:00:00.000Z",
          lineCount: 1,
          pendingLineCount: 0,
          receiptCount: 2,
          actualLeadDays: 4,
          promisedDeliveryDays: null,
          onTime: null
        },
        {
          purchaseOrderId: "55555555-5555-4555-8555-555555555555",
          purchaseOrderNumber: "PO-001",
          status: "received",
          submittedAt: "2026-11-02T09:00:00.000Z",
          lastReceivedAt: "2026-11-03T09:00:00.000Z",
          lineCount: 2,
          pendingLineCount: 0,
          receiptCount: 1,
          actualLeadDays: 1,
          promisedDeliveryDays: 2,
          onTime: true
        }
      ]
    }]
  };
}

describe("supplier performance evidence contract", () => {
  it("accepts a reconciled complete snapshot and derives delivery punctuality from counts", () => {
    const parsed = parseSupplierPerformanceSnapshot(snapshot());

    expect(parsed).not.toBeNull();
    const result = buildSupplierPerformance(parsed!);
    expect(result.state).toBe("READY");
    expect(result.suppliers[0].onTimePercent).toBe(100);
    expect(result.suppliers[0].leadTimeSampleCount).toBe(2);
    expect(result.withheldReasons).toContain("حُجب معدل الالتزام بالموعد للموردين ذوي العينات الأقل من 3 أوامر.");
    expect(result.suppliers[0]).not.toHaveProperty("score");
  });

  it("keeps a truncated supplier population PARTIAL instead of implying completeness", () => {
    const input = snapshot();
    input.totalSupplierCount = 4;
    input.resultLimit = 1;
    input.completePopulation = false;

    const parsed = parseSupplierPerformanceSnapshot(input);
    expect(parsed).not.toBeNull();
    expect(buildSupplierPerformance(parsed!).state).toBe("PARTIAL");
    expect(buildSupplierPerformance(parsed!).withheldReasons[0]).toContain("القائمة جزئية");
  });

  it("represents an empty, complete source population without inventing suppliers", () => {
    const input = snapshot();
    input.totalSupplierCount = 0;
    input.returnedSupplierCount = 0;
    input.suppliers = [];

    const parsed = parseSupplierPerformanceSnapshot(input);
    expect(parsed).not.toBeNull();
    expect(buildSupplierPerformance(parsed!).state).toBe("EMPTY");
  });

  it("rejects supplier order buckets that do not reconcile to the source order count", () => {
    const input = snapshot();
    input.suppliers[0].purchaseOrderCount = 5;

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects lead-time sample counts that differ from completed source orders", () => {
    const input = snapshot();
    input.suppliers[0].leadTimeSampleCount = 1;

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects promised and unpromised completed samples that do not reconcile", () => {
    const input = snapshot();
    input.suppliers[0].completedWithoutPromiseCount = 0;

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects a percentile order where P90 is below the median", () => {
    const input = snapshot();
    input.suppliers[0].p90LeadDays = 2;

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects timestamps without an explicit UTC offset", () => {
    const input = snapshot();
    input.asOf = "2026-11-26T12:00:00";

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects a report period wider than the source RPC contract", () => {
    const input = snapshot();
    input.period.from = "2024-01-01";
    input.period.to = "2026-01-01";

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects purchase orders submitted outside the declared reporting period", () => {
    const input = snapshot();
    input.suppliers[0].recentOrders[0].submittedAt = "2026-10-31T23:59:59.000Z";

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects source orders submitted after the snapshot as-of instant", () => {
    const input = snapshot();
    input.period.to = "2026-11-26";
    input.suppliers[0].recentOrders[0].submittedAt = "2026-11-26T13:00:00.000Z";
    input.suppliers[0].latestSubmittedAt = "2026-11-26T13:00:00.000Z";

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects receipt timestamps earlier than their purchase order submission", () => {
    const input = snapshot();
    input.suppliers[0].recentOrders[3].lastReceivedAt = "2026-11-01T09:00:00.000Z";

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects receipt timestamps after the snapshot as-of instant", () => {
    const input = snapshot();
    input.suppliers[0].recentOrders[3].lastReceivedAt = "2026-11-27T09:00:00.000Z";

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects a recent order whose reported lead time does not reconcile to its timestamps", () => {
    const input = snapshot();
    input.suppliers[0].recentOrders[2].actualLeadDays = 3;

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects an on-time flag that contradicts the awarded delivery interval", () => {
    const input = snapshot();
    input.suppliers[0].recentOrders[3].onTime = false;

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects a latest-submission timestamp that contradicts the included recent orders", () => {
    const input = snapshot();
    input.suppliers[0].latestSubmittedAt = "2026-11-11T09:00:00.000Z";

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects a supplier row with no recent-order provenance", () => {
    const input = snapshot();
    input.suppliers[0].recentOrders = [];

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });

  it("rejects recent orders that are not in descending submission order", () => {
    const input = snapshot();
    const [first, second] = input.suppliers[0].recentOrders;
    input.suppliers[0].recentOrders[0] = second;
    input.suppliers[0].recentOrders[1] = first;

    expect(parseSupplierPerformanceSnapshot(input)).toBeNull();
  });
});
