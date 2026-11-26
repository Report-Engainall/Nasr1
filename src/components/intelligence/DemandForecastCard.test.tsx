// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DemandForecastResult } from "@/lib/intelligence/demand-forecast";
import { DemandForecastCard } from "./DemandForecastCard";

const forecast: DemandForecastResult = {
  id: "demand-forecast:test",
  asOf: "2026-11-26T02:45:47.000Z",
  status: "VERIFIED",
  completePopulation: true,
  period: { from: "2026-10-28", to: "2026-11-26" },
  baselinePeriod: { from: "2026-09-28", to: "2026-10-27" },
  forecasts: [{
    productRef: "7f8d9c11-1234-4abc-8abc-1234567890ab",
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
    formulaVersions: ["quantity@1", "sample@1"],
    warnings: [
      "ORDER_LINE_QUANTITY_IS_NOT_VERIFIED_SHIPPED_OR_RECOGNIZED_SALES",
      "SCENARIO_ENVELOPE_IS_OBSERVED_RATE_RANGE_NOT_A_CONFIDENCE_INTERVAL",
      "NO_SEASONALITY_PROMOTION_OR_STOCKOUT_ADJUSTMENT",
    ],
  }],
  withheld: [],
  warnings: [],
};

describe("DemandForecastCard", () => {
  afterEach(() => cleanup());

  it("renders source-backed forecasts for 7, 30 and 90 days with a clear scenario boundary", () => {
    render(<DemandForecastCard result={forecast} state="ready" />);
    const region = screen.getByRole("region", { name: "توقع الطلب" });
    expect(within(region).getByText("أرز بسمتي")).toBeInTheDocument();
    expect(within(region).getByText("7 يوم")).toBeInTheDocument();
    expect(within(region).getByText("30 يوم")).toBeInTheDocument();
    expect(within(region).getByText("90 يوم")).toBeInTheDocument();
    expect(within(region).getByText(/ليس فاصل ثقة إحصائياً/)).toBeInTheDocument();
    expect(within(region).getByText(/مصدر مكتمل/)).toBeInTheDocument();
  });

  it("does not render a forecast when the source is unavailable", () => {
    render(<DemandForecastCard result={null} state="unavailable" />);
    expect(screen.getByText("مصدر توقع الطلب غير متاح؛ لم تُنشأ توقعات بديلة.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("exposes a retry action when the request is unavailable", () => {
    const onRetry = vi.fn();
    render(<DemandForecastCard result={null} state="unavailable" onRetry={onRetry} />);
    screen.getByRole("button", { name: "إعادة المحاولة" }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
