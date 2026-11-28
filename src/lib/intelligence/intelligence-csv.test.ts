import { describe, expect, it } from "vitest";
import type { DemandForecastResult } from "./demand-forecast";
import type { DeadStockReport } from "./dead-stock";
import type { SupplierPerformanceResult } from "./supplier-performance";
import type { ProcessBottleneckResult } from "./process-bottlenecks";
import type { TaskPerformanceScorecard } from "./task-performance-scorecard";
import type { CustomerQuotePipelineResult } from "./customer-quote-pipeline";
import type { ReplenishmentRecommendation } from "./replenishment";
import {
  buildDeadStockCsv,
  buildSupplierPerformanceCsv,
  buildProcessBottlenecksCsv,
  buildTaskPerformanceScorecardCsv,
  buildCustomerQuotePipelineCsv,
  buildDemandForecastCsv,
  buildReplenishmentCsv,
  serializeIntelligenceCsv,
} from "./intelligence-csv";

const forecast: DemandForecastResult = {
  id: "demand-export",
  asOf: "2026-11-28T02:00:00.000Z",
  status: "VERIFIED",
  completePopulation: true,
  period: { from: "2026-10-28", to: "2026-11-26" },
  baselinePeriod: { from: "2026-09-28", to: "2026-10-27" },
  forecasts: [{
    productRef: "product-a",
    productLabel: "أرز بسمتي",
    unitOfMeasure: "EA",
    trend: "INCREASING",
    currentDailyDemand: 4,
    baselineDailyDemand: 3,
    changePercentHundredths: 3333,
    currentOrders: 10,
    baselineOrders: 10,
    horizons: [
      { days: 7, lowQuantity: 21, expectedQuantity: 28, highQuantity: 35 },
      { days: 30, lowQuantity: 90, expectedQuantity: 120, highQuantity: 150 },
      { days: 90, lowQuantity: 270, expectedQuantity: 360, highQuantity: 450 },
    ],
    period: { from: "2026-10-28", to: "2026-11-26" },
    baselinePeriod: { from: "2026-09-28", to: "2026-10-27" },
    asOf: "2026-11-28T02:00:00.000Z",
    evidenceIds: ["evidence-current", "evidence-baseline"],
    metricKeys: ["product.order_items.quantity"],
    formulaVersions: ["product.quantity@1.0.0"],
    warnings: [],
  }],
  withheld: [{
    signalId: "withheld-1",
    productRef: "product-b",
    reason: "SAMPLE_INSUFFICIENT",
  }],
  warnings: [],
};

const replenishment: ReplenishmentRecommendation = {
  productRef: "product-a",
  status: "VERIFIED",
  action: "RECOMMEND",
  quantityUnit: "EA",
  availableToPromise: 10,
  incomingPurchaseQuantity: 5,
  coveredAfterIncoming: 15,
  reorderPoint: 25,
  dailyDemand: 10,
  leadTimeDemand: 30,
  targetStock: 30,
  recommendedQuantity: 15,
  formulaId: "inventory.replenishment-target",
  formulaVersion: "1.2.0",
  evidenceIds: ["inventory-evidence"],
  warnings: [],
  automaticPurchase: false,
  demandSource: "HISTORICAL",
  demandTrend: null,
  forecastLeadTimeDemand: null,
  forecastEvidenceIds: [],
  forecastMetricKeys: [],
  forecastFormulaVersions: [],
};

const deadStockReport: DeadStockReport = {
  "id": "dead-stock-export",
  "asOf": "2026-11-28T02:00:00.000Z",
  "period": {
    "from": "2026-08-29",
    "to": "2026-11-28"
  },
  "ruleId": "inventory.dead-stock",
  "ruleVersion": "1.1.0",
  "status": "NEEDS_REVIEW",
  "items": [
    {
      "productRef": "stagnant-product",
      "classification": "STAGNANT",
      "daysSinceMovement": 95,
      "lowTurnover": true,
      "turnoverRatio": 0.2,
      "availableQuantity": 10,
      "unitCost": 4,
      "currency": "YER",
      "financialExposure": 40,
      "exposureStatus": "VERIFIED",
      "movementStatus": "VERIFIED",
      "formulaId": "dead-stock.exposure",
      "formulaVersion": "1.1.0",
      "evidenceIds": [
        "stock-evidence"
      ],
      "warnings": []
    },
    {
      "productRef": "unknown-product",
      "classification": "UNKNOWN",
      "daysSinceMovement": null,
      "lowTurnover": null,
      "turnoverRatio": null,
      "availableQuantity": 5,
      "unitCost": null,
      "currency": null,
      "financialExposure": null,
      "exposureStatus": "NEEDS_REVIEW",
      "movementStatus": "NEEDS_REVIEW",
      "formulaId": "dead-stock.exposure",
      "formulaVersion": "1.1.0",
      "evidenceIds": [],
      "warnings": [
        "MOVEMENT_HISTORY_NOT_COMPLETE_OR_VERIFIED"
      ]
    }
  ],
  "totalsByCurrency": [
    {
      "currency": "YER",
      "exposure": 40,
      "verifiedItems": 1,
      "withheldItems": 0
    },
    {
      "currency": "USD",
      "exposure": null,
      "verifiedItems": 0,
      "withheldItems": 1
    }
  ],
  "warnings": [
    "PARTIAL_SOURCE_COVERAGE"
  ]
};

const supplierExportFixture: SupplierPerformanceResult = {
  "state": "PARTIAL",
  "asOf": "2026-11-28T02:00:00.000Z",
  "period": {
    "from": "2026-10-01",
    "to": "2026-11-28",
    "timeZone": "UTC"
  },
  "totalSupplierCount": 5,
  "returnedSupplierCount": 1,
  "completePopulation": false,
  "suppliers": [
    {
      "supplierId": "11111111-1111-4111-8111-111111111111",
      "supplierName": "مورد =مراجعة",
      "supplierCode": "SUP-A",
      "purchaseOrderCount": 4,
      "completedOrderCount": 2,
      "openOrderCount": 1,
      "inconsistentReceivedCount": 1,
      "backlogLineCount": 2,
      "leadTimeSampleCount": 2,
      "averageLeadDays": null,
      "medianLeadDays": null,
      "p90LeadDays": null,
      "promisedDeliverySampleCount": 1,
      "onTimeCount": 0,
      "onTimePercent": 0,
      "completedWithoutPromiseCount": 1,
      "latestSubmittedAt": "2026-11-27T09:00:00.000Z",
      "recentOrders": [
        {
          "purchaseOrderId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          "purchaseOrderNumber": "PO-A",
          "status": "partially_received",
          "submittedAt": "2026-11-26T09:00:00.000Z",
          "lastReceivedAt": null,
          "lineCount": 3,
          "pendingLineCount": 2,
          "receiptCount": 0,
          "actualLeadDays": null,
          "promisedDeliveryDays": 5,
          "onTime": null
        }
      ]
    }
  ],
  "withheldReasons": [
    "SOME_SUPPLIERS_NOT_LOADED"
  ]
};
const processExportFixture: ProcessBottleneckResult = {
  "state": "PARTIAL",
  "asOf": "2026-11-28T02:00:00.000Z",
  "period": {
    "from": "2026-10-29",
    "to": "2026-11-28",
    "timeZone": "UTC"
  },
  "baselinePeriod": null,
  "findings": [
    {
      "processKey": "PURCHASE",
      "stageKey": "receiving",
      "waitClass": "MIXED_SUPPLIER_RECEIVING",
      "sampleCount": 5,
      "averageMinutes": 240,
      "medianMinutes": 180,
      "p90Minutes": 420,
      "recommendation": "=راجع الاستلام"
    }
  ],
  "comparisons": [],
  "queues": [
    {
      "processKey": "PURCHASE",
      "openCount": 3,
      "oldestOpenedAt": "2026-11-20T02:00:00.000Z",
      "oldestAgeMinutes": 1920,
      "asOf": "2026-11-28T02:00:00.000Z"
    }
  ],
  "sourceCoverage": [
    {
      "key": "PURCHASE",
      "status": "VERIFIED",
      "source": "purchase_orders",
      "asOf": "2026-11-28T02:00:00.000Z",
      "period": {
        "from": "2026-10-29",
        "to": "2026-11-28",
        "timeZone": "UTC"
      },
      "sampleCount": 5,
      "completePopulation": true,
      "message": "المصدر متاح"
    }
  ],
  "reopenedTasks": null,
  "withheldReasons": [
    "TASKS_SOURCE_UNAVAILABLE"
  ]
};

const taskExportFixture: TaskPerformanceScorecard = {
  "status": "READY",
  "asOf": "2026-11-28T02:00:00.000Z",
  "scope": {
    "visibleRoles": [
      "accountant"
    ],
    "completePopulation": true,
    "visibleTaskCount": 4
  },
  "coverage": {
    "sourceLinkedTaskCount": 3,
    "idempotencyKeyCount": 2,
    "traceableTaskCount": 2,
    "idempotencyKeyCoveragePercent": 66.67,
    "traceabilityCoveragePercent": 66.67
  },
  "resolution": {
    "completedTaskCount": 2,
    "sampleCount": 2,
    "excludedCount": 1,
    "status": "PARTIAL"
  },
  "audit": {
    "reopenEventCount": 1,
    "reopenedTaskCount": 1,
    "firstCompletedTaskCount": null,
    "windowStartedAt": null,
    "completeness": "PARTIAL",
    "reasonCode": "AUTOMATIC_SOURCE_TRANSITIONS_ARE_NOT_ALL_AUDITED",
    "reopenRatePercent": null
  },
  "groups": [
    {
      "taskType": "invoice_collection",
      "taskRole": "accountant",
      "taskCount": 4,
      "completedCount": 2,
      "resolutionSampleCount": 2,
      "resolutionExcludedCount": 1,
      "medianResolutionMinutes": 30,
      "p90ResolutionMinutes": 60,
      "sourceLinkedTaskCount": 3,
      "idempotencyKeyCount": 2,
      "traceableTaskCount": 2,
      "idempotencyKeyCoveragePercent": 66.67,
      "traceabilityCoveragePercent": 66.67,
      "resolutionStatus": "PARTIAL"
    }
  ],
  "unavailableMetrics": [
    "REOPEN_RATE",
    "EMPLOYEE_COMPARISON"
  ],
  "quality": {
    "status": "UNAVAILABLE",
    "reasonCode": "QUALITY_REVIEW_MIGRATION_PENDING"
  }
};
const quoteExportFixture: CustomerQuotePipelineResult = {
  "kind": "CUSTOMER_QUOTE_PIPELINE",
  "state": "READY",
  "sourceRpc": "fetch_customer_quote_pipeline",
  "asOf": "2026-11-28T02:00:00.000Z",
  "period": {
    "from": "2026-11-01",
    "to": "2026-11-28",
    "timeZone": "UTC"
  },
  "cohortBasis": "SALES_QUOTES.CREATED_AT",
  "statusAsOf": "2026-11-28T02:00:00.000Z",
  "completePopulation": true,
  "totalQuotes": 10,
  "requestedForPricing": 2,
  "awaitingCustomerResponse": 3,
  "accepted": 3,
  "rejected": 1,
  "expired": 1,
  "decidedCount": 4,
  "acceptanceRatePercent": 75,
  "answer": "هناك عشرة عروض.",
  "warnings": [
    "ACCEPTANCE_IS_NOT_ORDER_CONVERSION"
  ]
};

describe("intelligence spreadsheet exports", () => {
  it("uses a UTF-8 BOM, CRLF rows, spreadsheet-safe text and numeric cells", () => {
    const csv = serializeIntelligenceCsv([
      ["value", "untrusted text"],
      [-12.5, "=HYPERLINK(\"https://example.invalid\")"],
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("\r\n");
    expect(csv).toContain('-12.5,"\'=HYPERLINK(');
  });

  it("exports every forecast horizon and retains evidence plus withheld products", () => {
    const csv = buildDemandForecastCsv(forecast);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("360");
    expect(csv).toContain("450");
    expect(csv).toContain("evidence-current");
    expect(csv).toContain("product.quantity@1.0.0");
    expect(csv).toContain("withheld-1");
    expect(csv).toContain("SAMPLE_INSUFFICIENT");
    expect(csv).toContain("اكتمال مجتمع المنتجات");
  });

  it("exports filtered replenishment rows with quantities, incoming coverage and source lineage", () => {
    const withheld = {
      ...replenishment,
      productRef: "product-b",
      status: "NEEDS_REVIEW" as const,
      action: "WITHHELD" as const,
      recommendedQuantity: null,
    };
    const csv = buildReplenishmentCsv([replenishment, withheld], { "product-a": "أرز بسمتي" }, 8);
    expect(csv).toContain("عدد التوصيات المحملة");
    expect(csv).toContain("8");
    expect(csv).toContain("product-a");
    expect(csv).toContain("أرز بسمتي");
    expect(csv).toContain("inventory-evidence");
    expect(csv).toContain("WITHHELD");
    expect(csv).toContain("يضم الملف كل النتائج المحملة");
    expect(csv).toContain("15");
  });

  it("exports dead-stock states and independent currency totals without inventing exposure", () => {
    const csv = buildDeadStockCsv(deadStockReport);
    expect(csv).toContain("stagnant-product");
    expect(csv).toContain("stock-evidence");
    expect(csv).toContain("unknown-product");
    expect(csv).toContain("MOVEMENT_HISTORY_NOT_COMPLETE_OR_VERIFIED");
    expect(csv).toContain("CURRENCY_TOTAL");
    expect(csv).toContain("YER");
    expect(csv).toContain("USD");
    expect(csv).toContain("لا يتم تحويل أو جمع عملات مختلفة");
    expect(csv).toContain("PARTIAL_SOURCE_COVERAGE");
    expect(csv).toContain(',40,"VERIFIED","VERIFIED","dead-stock.exposure","1.1.0","stock-evidence",');
  });

  it("exports supplier samples, recent purchase-order references and partial coverage without price data", () => {
    const csv = buildSupplierPerformanceCsv(supplierExportFixture);
    expect(csv).toContain("SOME_SUPPLIERS_NOT_LOADED");
    expect(csv).toContain("PO-A");
    expect(csv).toContain("مورد =مراجعة");
    expect(csv).toContain("لا يتضمن الملف أسعار الشراء");
    expect(csv).toContain("PARTIAL");
  });

  it("exports process queues, findings and source coverage with formula-safe recommendations", () => {
    const csv = buildProcessBottlenecksCsv(processExportFixture);
    expect(csv).toContain("OPEN_QUEUE");
    expect(csv).toContain("BOTTLENECK");
    expect(csv).toContain("receiving");
    expect(csv).toContain("TASKS_SOURCE_UNAVAILABLE");
    expect(csv).toContain("'=راجع الاستلام");
    expect(csv).toContain("MIXED_SUPPLIER_RECEIVING");
  });

  it("exports role-scoped task aggregates and unavailable metrics without turning them into zeros", () => {
    const csv = buildTaskPerformanceScorecardCsv(taskExportFixture);
    expect(csv).toContain("invoice_collection");
    expect(csv).toContain("accountant");
    expect(csv).toContain("EMPLOYEE_COMPARISON");
    expect(csv).toContain("QUALITY_WITHHELD");
    expect(csv).toContain("المهام تخص الأدوار المرئية المسموح بها فقط");
    expect(csv).toContain("66.67");
  });

  it("exports the quote funnel while disclosing that acceptance is not order conversion", () => {
    const csv = buildCustomerQuotePipelineCsv(quoteExportFixture);
    expect(csv).toContain("TOTAL_QUOTES");
    expect(csv).toContain("AWAITING_CUSTOMER_RESPONSE");
    expect(csv).toContain("ACCEPTED");
    expect(csv).toContain("ACCEPTANCE_IS_NOT_ORDER_CONVERSION");
    expect(csv).toContain("قبول العرض لا يثبت إنشاء طلب بيع");
    expect(csv).toContain("75");
  });

  it("escapes formula-like product labels and never changes numeric quantities into text", () => {
    const unsafe = {
      ...forecast,
      forecasts: [{ ...forecast.forecasts[0], productLabel: "=HYPERLINK(\"https://example.invalid\")" }],
    };
    const csv = buildDemandForecastCsv(unsafe);
    expect(csv).toContain("'=HYPERLINK(");
    expect(csv).toContain(",4,3,33.33,10,10,");
  });
});
