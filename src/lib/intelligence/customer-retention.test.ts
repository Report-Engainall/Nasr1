import { describe, expect, it } from "vitest";
import { buildCustomerRetentionActionQueue, buildCustomerRetentionReport, type CustomerRetentionRecord, type CustomerRetentionSaleRecord } from "./customer-retention";
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
    asOf?: string;
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
    asOf: options.asOf ?? asOf,
    period: currentPeriod,
    status: options.coverageStatus ?? "VERIFIED",
    completeness: "COMPLETE",
    quality: "ACCEPTABLE",
    warnings: [],
  };
  return buildCustomerRetentionReport({
    id: "retention-fixture",
    asOf: options.asOf ?? asOf,
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

describe("customer retention follow-up queue", () => {
  it("prioritizes inactive and at-risk customers before cooling and data-review cases", () => {
    const customers = [
      customer("active", 2, 1, "2026-11-24T12:00:00.000Z"),
      customer("cooling", 0, 2, "2026-10-10T12:00:00.000Z"),
      customer("at-risk", 0, 2, "2026-09-05T12:00:00.000Z"),
      customer("inactive", 0, 1, "2026-07-01T12:00:00.000Z"),
      customer("no-date", 0, 0, null),
    ];
    const report = build(customers, []);
    const queue = buildCustomerRetentionActionQueue(report);

    expect(report.status).toBe("VERIFIED");
    expect(queue.status).toBe("VERIFIED");
    expect(queue.actions.map(item => [item.customerRef, item.action, item.priority])).toEqual([
      ["inactive", "REACTIVATE", "HIGH"],
      ["at-risk", "PREVENT_CHURN", "HIGH"],
      ["cooling", "REENGAGE", "MEDIUM"],
      ["no-date", "VERIFY_ORDER_HISTORY", "REVIEW"],
    ]);
    expect(queue.totalActionable).toBe(4);
    expect(queue.withheldCustomerCount).toBe(0);
  });

  it("carries row-level count evidence into every follow-up action", () => {
    const report = build([
      customer("evidence-customer", 0, 2, "2026-07-01T12:00:00.000Z"),
    ], []);
    const queue = buildCustomerRetentionActionQueue(report);
    expect(report.customers[0].evidenceIds).toEqual([
      "evidence:evidence-customer:current",
      "evidence:evidence-customer:previous",
    ]);
    expect(queue.actions[0].evidenceIds).toEqual(report.customers[0].evidenceIds);
  });

  it("withholds all customer actions when the population coverage is partial", () => {
    const report = build(
      [customer("partial", 0, 2, "2026-07-01T12:00:00.000Z")],
      [],
      { truncated: true },
    );
    const queue = buildCustomerRetentionActionQueue(report);
    expect(queue.status).toBe("NEEDS_REVIEW");
    expect(queue.actions).toEqual([]);
    expect(queue.withheldCustomerCount).toBe(1);
    expect(queue.warnings).toContain("CUSTOMER_RETENTION_POPULATION_NOT_VERIFIED");
  });

  it("reports truncated queue counts and rejects limits outside the supported range", () => {
    const customers = [
      customer("a", 0, 1, "2026-07-01T12:00:00.000Z"),
      customer("b", 0, 2, "2026-08-01T12:00:00.000Z"),
      customer("c", 0, 1, "2026-10-10T12:00:00.000Z"),
    ];
    const queue = buildCustomerRetentionActionQueue(build(customers, []), 1);
    expect(queue.actions).toHaveLength(1);
    expect(queue.totalActionable).toBe(3);
    expect(queue.omittedCount).toBe(2);
    expect(() => buildCustomerRetentionActionQueue(build(customers, []), 0)).toThrow(RangeError);
    expect(() => buildCustomerRetentionActionQueue(build(customers, []), 201)).toThrow(RangeError);
  });
});


describe("customer retention strict evidence clocks", () => {
  it("rejects an impossible as-of timestamp", () => {
    const { customers, sales } = baseline();
    expect(() => build(customers, sales, { asOf: "2026-02-31T00:00:00.000Z" })).toThrow(
      "asOf must be a valid ISO timestamp",
    );
  });

  it("withholds retention conclusions when a metric was calculated after its as-of snapshot", () => {
    const broken = customer("future-metric", 2, 1, "2026-11-20T12:00:00.000Z");
    broken.ordersCurrentPeriod = {
      ...broken.ordersCurrentPeriod,
      lineage: {
        ...broken.ordersCurrentPeriod.lineage,
        calculatedAt: "2026-11-26T00:00:01.000Z",
      },
    };
    const result = build([broken], [sale("future-metric", "YER", "10.00")]);
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.population.total).toBeNull();
    expect(result.customers[0].status).toBe("NEEDS_REVIEW");
    expect(result.warnings).toContain("CUSTOMER_COUNT_METRIC_INVALID_OR_UNVERIFIED");
  });

  it("withholds customer population conclusions when coverage evidence has an impossible source time", () => {
    const { customers, sales } = baseline();
    const metrics = [
      ...customers.flatMap(item => [item.ordersCurrentPeriod, item.ordersPreviousPeriod]),
      ...sales.map(item => item.sales),
    ];
    const invalidCoverage: EvidenceRecord = {
      id: "coverage:customers",
      source: { kind: "RPC", name: "test.customer_retention.coverage", version: "1.0.0" },
      sourceTimestamp: "2026-02-31T00:00:00.000Z",
      asOf,
      period: currentPeriod,
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      warnings: [],
    };
    const result = build(customers, sales, {
      evidenceRecords: [invalidCoverage, ...metrics.map(evidence)],
    });
    expect(result.status).toBe("NEEDS_REVIEW");
    expect(result.population.total).toBeNull();
    expect(result.retentionRate).toBeNull();
    expect(result.warnings).toContain("FULL_CUSTOMER_AGGREGATE_NOT_VERIFIED");
  });

});
