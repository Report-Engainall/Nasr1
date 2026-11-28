// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProductDemandForecast } from "@/lib/intelligence/demand-forecast";
import type { ReplenishmentRecommendation } from "@/lib/intelligence/replenishment";

vi.mock("@/lib/api", () => ({
  fetchProducts: vi.fn().mockResolvedValue([{ id: "product-a", name: "أرز بسمتي", item_code: "RICE-A" }]),
}));
vi.mock("./ReplenishmentPurchaseDraft", () => ({
  ReplenishmentPurchaseDraft: () => <div>مسودة شراء اختبارية</div>,
}));

import { ReplenishmentCard } from "./ReplenishmentCard";

const recommendation: ReplenishmentRecommendation = {
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

const demandForecast: ProductDemandForecast = {
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
    { days: 7, lowQuantity: 21, expectedQuantity: 28, highQuantity: 28 },
    { days: 30, lowQuantity: 90, expectedQuantity: 120, highQuantity: 120 },
    { days: 90, lowQuantity: 270, expectedQuantity: 360, highQuantity: 360 },
  ],
  period: { from: "2026-10-28", to: "2026-11-26" },
  baselinePeriod: { from: "2026-09-28", to: "2026-10-27" },
  asOf: "2026-11-26T02:45:47.000Z",
  evidenceIds: ["current-evidence", "baseline-evidence"],
  metricKeys: ["product.order_items.quantity", "product.orders.sample_count"],
  formulaVersions: ["quantity@1", "sample@1"],
  warnings: [],
};

describe("ReplenishmentCard demand forecast context", () => {
  afterEach(() => cleanup());

  it("shows the separate evidence-backed 30/90-day demand context for the same product", () => {
    render(
      <ReplenishmentCard
        recommendations={[recommendation]}
        demandForecasts={[demandForecast]}
        canManagePurchases
      />,
    );
    const context = screen.getByRole("complementary", { name: "سياق توقع الطلب" });
    expect(within(context).getByText(/30 يوماً:/)).toBeInTheDocument();
    expect(within(context).getByText(/90 يوماً:/)).toBeInTheDocument();
    expect(within(context).getByText(/توقع مستقل غير داخل في كمية التوريد/)).toBeInTheDocument();
  });

  it("shows the precise forecast projection used to calculate replenishment", () => {
    render(
      <ReplenishmentCard
        recommendations={[{
          ...recommendation,
          demandSource: "FORECAST",
          demandTrend: "INCREASING",
          dailyDemand: 20,
          leadTimeDemand: 240,
          targetStock: 240,
          recommendedQuantity: 225,
          forecastLeadTimeDemand: { horizonDays: 30, lowQuantity: 120, expectedQuantity: 240, highQuantity: 240 },
          forecastEvidenceIds: ["forecast-current-evidence", "forecast-baseline-evidence"],
          forecastMetricKeys: ["product.order_items.quantity", "product.orders.sample_count"],
          forecastFormulaVersions: ["product.quantity@1.0.0", "product.sample@1.0.0"],
          evidenceIds: ["inventory-evidence", "forecast-current-evidence", "forecast-baseline-evidence"],
        }]}
        demandForecasts={[demandForecast]}
      />,
    );
    const context = screen.getByRole("complementary", { name: "أساس توقع الطلب المستخدم في إعادة التوريد" });
    expect(within(context).getByText(/المتوقع خلال مهلة المورد: 240/)).toBeInTheDocument();
    expect(within(context).getByText(/120–240/)).toBeInTheDocument();
    expect(within(context).getByText(/الكمية المقترحة حُسبت من الطلب المتوقع/)).toBeInTheDocument();
  });

  it("does not attach another product's demand forecast to this recommendation", () => {
    render(
      <ReplenishmentCard
        recommendations={[recommendation]}
        demandForecasts={[{ ...demandForecast, productRef: "another-product" }]}
      />,
    );
    expect(screen.queryByRole("complementary", { name: "سياق توقع الطلب" })).not.toBeInTheDocument();
  });
});
