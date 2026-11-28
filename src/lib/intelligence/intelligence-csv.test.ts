import { describe, expect, it } from "vitest";
import type { DemandForecastResult } from "./demand-forecast";
import type { DeadStockReport } from "./dead-stock";
import type { ReplenishmentRecommendation } from "./replenishment";
import {
  buildDeadStockCsv,
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
    expect(csv).toContain(",40,VERIFIED,VERIFIED,dead-stock.exposure,1.1.0,");
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
