import { describe, expect, it } from "vitest";
import { buildCustomerRetentionReport, type CustomerRetentionRecord, type CustomerRetentionSaleRecord } from "./customer-retention";
import type { EvidencePeriod, EvidenceRecord, MetricSnapshot } from "./types";

const asOf = "2026-11-26T00:00:00.000Z";
const currentPeriod: EvidencePeriod = { from: "2026-11-01", to: "2026-11-25" };
const previousPeriod: EvidencePeriod = { from: "2026-10-07", to: "2026-10-31" };

function sourceMetric(
  id: string,
  value: number | string,
  unit: MetricSnapshot["unit"],
  period: EvidencePeriod,
  currency?: string,
): MetricSnapshot {
  return {
    id,
    key: "customer.retention." + id,
    value,
    unit,
    ...(currency ? { currency } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    period,
    asOf,
    lineage: {
      evidenceIds: ["evidence:" + id],
      calculatedAt: "2026-11-25T23:55:00.000Z",
      formulaId: "fixture.customer-retention",
      formulaVersion: "1.0.0",
      transformations: [],
    },
    warnings: [],
  };
}

function customer(ref: string, current: number, previous: number, lastOrderAt: string | null): CustomerRetentionRecord {
  return {
    customerRef: ref,
    ordersCurrentPeriod: sourceMetric(ref + ":current", current, "COUNT", currentPeriod),
    ordersPreviousPeriod: sourceMetric(ref + ":previous", previous, "COUNT", previousPeriod),
    lastOrderAt,
  };
}

function sale(ref: string, currency: string, value: string): CustomerRetentionSaleRecord {
  return {
    customerRef: ref,
    currency,
    sales: sourceMetric(ref + ":sales:" + currency, value, "CURRENCY", currentPeriod, currency),
  };
}

function evidence(metric: MetricSnapshot): EvidenceRecord {
  return {
    id: metric.lineage.evidenceIds[0],
    source: { kind: "RPC", name: "test.customer_retention", version: "1.0.0" },
    sourceTimestamp: "2026-11-25T23:50:00.000Z",
    asOf,
    period: metric.period,
    ...(metric.currency ? { currency: metric.currency } : {}),
    status: "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
}

function build(
  customers: CustomerRetentionRecord[],
  salesByCurrency: CustomerRetentionSaleRecord[],
  options: {
    truncated?: boolean;
    coverageStatus?: EvidenceRecord["status"];
    evidenceRecords?: EvidenceRecord[];
  } = {},
) {
  const metrics = [
    ...customers.flatMap((item) => [item.ordersCurrentPeriod, item.ordersPreviousPeriod]),
    ...salesByCurrency.map((item) => item.sales),
  ];
  const coverageEvidence: EvidenceRecord = {
    id: "coverage:customers",
    source: { kind: "RPC", name: "test.customer_retention.coverage", version: "1.0.0" },
    sourceTimestamp: "2026-11-25T23:50:00.000Z",
    asOf,
    period: currentPeriod,
    status: options.coverageStatus ?? "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
  return buildCustomerRetentionReport({
    id: "retention-fixture",
    asOf,
    period: currentPeriod,
    previousPeriod,
    evidenceRecords: options.evidenceRecords ?? [coverageEvidence, ...metrics.map(evidence)],
    coverage: {
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      expectedCustomerCount: customers.length,
      returnedCustomerCount: customers.length,
      expectedSalesRecordCount: salesByCurrency.length,
      returnedSalesRecordCount: salesByCurrency.length,
      truncated: options.truncated ?? false,
      evidenceIds: ["coverage:customers"],
    },
    customers,
    salesByCurrency,
  });
}

function baseline() {
  const customers = [
    customer("c-1", 2, 2, "2026-11-24T12:00:00.000Z"),
    customer("c-2", 0, 3, "2026-09-20T12:00:00.000Z"),
    customer("c-3", 1, 0, "2026-07-01T12:00:00.000Z"),
  ];
  const sales = [
    sale("c-1", "YER", "10.10"),
    sale("c-2", "YER", "5.20"),
    sale("c-3", "USD", "2.30"),
  ];
  return { customers, sales };
}

describe("customer retention intelligence", () => {
  it("calculates unique cohorts, repeat purchase and activity bands from verified records", () => {
    const { customers, sales } = baseline();
    const result = build(customers, sales);

    expect(result.status).toBe("VERIFIED");
    expect(result.population).toEqual({
      total: 3,
      activeCurrentPeriod: 2,
      priorPeriodCohort: 2,
      retainedCustomers: 1,
      repeatPurchaseCustomers: 1,
    });
    expect(result.retentionRate).toBe(50);
    expect(result.repeatPurchaseRate).toBe(50);
    expect(result.averageOrdersPerActiveCustomer).toBe(1.5);
    expect(result.activity).toEqual({
      active30Days: 1,
      cooling31To60Days: 0,
      atRisk61To90Days: 1,
      inactiveOver90Days: 1,
      noOrderDate: 0,
    });
  });

  it("keeps sales totals and concentration isolated by currency", () => {
    const { customers, sales } = baseline();
    const result = build(customers, sales);

    expect(result.focusByCurrency).toEqual([
      { currency: "YER", totalSales: 15.3, top5SalesConcentration: 100, customerCount: 2, status: "VERIFIED" },
      { currency: "USD", totalSales: 2.3, top5SalesConcentration: 100, customerCount: 1, status: "VERIFIED" },
    ]);
  });

  it("rounds top-five sales concentration to exact percentage hundredths", () => {
    const customers = Array.from({ length: 6 }, (_, index) =>
      customer("top-" + index, 1, 0, "2026-11-20T12:00:00.000Z")
    );
    const sales = [10, 20, 30, 40, 50, 70].map((amount, index) =>
      sale("top-" + index, "YER", amount.toFixed(2))
    );
    const result = build(customers, sales);

    expect(result.status).toBe("VERIFIED");
    expect(result.focusByCurrency[0]).toMatchObject({
      currency: "YER",
      totalSales: 220,
      top5SalesConcentration: 95.45,
      customerCount: 6,
      status: "VERIFIED",
    });
  });

  it("withholds population-level conclusions when the aggregate is truncated", () => {
    const { customers, sales } = baseline();
    const result = build(customers, sales, { truncated: true });

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.population.total).toBeNull();
    expect(result.retentionRate).toBeNull();
    expect(result.focusByCurrency.every((item) => item.status === "NEEDS_REVIEW")).toBe(true);
    expect(result.warnings).toContain("FULL_CUSTOMER_AGGREGATE_NOT_VERIFIED");
  });

  it("withholds population metrics when duplicate customer identities are returned", () => {
    const first = customer("duplicate", 2, 1, "2026-11-20T12:00:00.000Z");
    const second = customer("duplicate", 1, 0, "2026-11-18T12:00:00.000Z");
    const result = build([first, second], [
      sale("duplicate", "YER", "1.00"),
    ]);

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.population.total).toBeNull();
    expect(result.retentionRate).toBeNull();
    expect(result.warnings).toContain("FULL_CUSTOMER_AGGREGATE_NOT_VERIFIED");
  });

  it("withholds an impossible calendar date instead of normalizing it into a valid activity band", () => {
    const result = build(
      [customer("bad-date", 1, 1, "2026-02-31T12:00:00.000Z")],
      [sale("bad-date", "YER", "10.00")],
    );

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.customers[0].activity).toBe("UNKNOWN");
    expect(result.customers[0].status).toBe("NEEDS_REVIEW");
    expect(result.population.total).toBeNull();
  });

  it("does not emit an imprecise average when safe source counts overflow when aggregated", () => {
    const customers = [
      customer("large-1", Number.MAX_SAFE_INTEGER, 0, "2026-11-20T12:00:00.000Z"),
      customer("large-2", Number.MAX_SAFE_INTEGER, 0, "2026-11-20T12:00:00.000Z"),
    ];
    const result = build(customers, []);

    expect(result.status).toBe("VERIFIED");
    expect(result.population.activeCurrentPeriod).toBe(2);
    expect(result.averageOrdersPerActiveCustomer).toBeNull();
    expect(result.warnings).toContain("CUSTOMER_ORDER_COUNT_AGGREGATE_OVERFLOW");
  });

  it("withholds currency analytics when source precision exceeds cents", () => {
    const result = build(
      [customer("precision", 1, 0, "2026-11-20T12:00:00.000Z")],
      [sale("precision", "YER", "1.001")],
    );

    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.focusByCurrency[0]).toMatchObject({
      currency: "YER",
      totalSales: null,
      top5SalesConcentration: null,
      status: "NEEDS_REVIEW",
    });
    expect(result.warnings).toContain("CUSTOMER_CURRENCY_PRECISION_INVALID");
  });
});
