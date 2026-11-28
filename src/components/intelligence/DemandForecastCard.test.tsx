// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DemandForecastResult, DemandScenarioResult } from "@/lib/intelligence/demand-forecast";
import { buildDemandForecastCsv, downloadIntelligenceCsv } from "@/lib/intelligence/intelligence-csv";
import { DemandForecastCard } from "./DemandForecastCard";

vi.mock("@/lib/intelligence/intelligence-csv", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/intelligence/intelligence-csv")>();
  return { ...original, downloadIntelligenceCsv: vi.fn() };
});

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
    metricKeys: ["product.order_items.quantity", "product.orders.sample_count"],
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

  it("exports every loaded forecast and withheld row with evidence lineage", () => {
    const exportResult: DemandForecastResult = {
      ...forecast,
      withheld: [{
        signalId: "withheld-signal",
        productRef: "unavailable-product",
        reason: "SAMPLE_INSUFFICIENT",
      }],
    };
    render(<DemandForecastCard result={exportResult} state="ready" />);
    fireEvent.click(screen.getByRole("button", { name: "تصدير توقعات الطلب CSV" }));
    expect(downloadIntelligenceCsv).toHaveBeenCalledWith(
      buildDemandForecastCsv(exportResult),
      "aghbari-demand-forecast.csv",
    );
  });

  it("runs an interactive what-if demand simulation from the verified forecast without mutating the source", () => {
    render(<DemandForecastCard result={forecast} state="ready" />);
    const lab = screen.getByRole("region", { name: "مختبر ماذا لو" });
    const slider = within(lab).getByRole("slider", { name: "نسبة تغير الطلب المفترضة" });
    expect(within(lab).getByRole("status")).toHaveTextContent("0%");
    fireEvent.change(slider, { target: { value: "20" } });
    expect(within(lab).getByText("+20%")).toBeInTheDocument();
    expect(within(lab).getByTestId("demand-scenario-expected-7")).toHaveAttribute("data-value", "33.6");
    expect(within(lab).getByTestId("demand-scenario-expected-30")).toHaveAttribute("data-value", "144");
    expect(within(lab).getByTestId("demand-scenario-expected-90")).toHaveAttribute("data-value", "432");
    expect(forecast.forecasts[0].horizons[0].expectedQuantity).toBe(28);
    expect(within(lab).getByText(/لا يغيّر الطلبات أو المخزون/)).toBeInTheDocument();
  });

  it("withholds what-if results whenever the forecast needs review", () => {
    render(<DemandForecastCard result={{ ...forecast, status: "NEEDS_REVIEW" }} state="ready" />);
    const lab = screen.getByRole("region", { name: "مختبر ماذا لو" });
    fireEvent.change(within(lab).getByRole("slider", { name: "نسبة تغير الطلب المفترضة" }), { target: { value: "20" } });
    expect(within(lab).getByRole("alert")).toHaveTextContent("المصدر أو كامل مجتمع المنتجات يحتاج إلى مراجعة");
    expect(within(lab).queryByTestId("demand-scenario-expected-7")).not.toBeInTheDocument();
  });

  it("saves an evidence-backed simulation only through the supplied decision-cycle action", async () => {
    const onSaveScenario = vi.fn(async (_scenario: DemandScenarioResult) => true);
    render(<DemandForecastCard result={forecast} state="ready" onSaveScenario={onSaveScenario} />);
    const lab = screen.getByRole("region", { name: "مختبر ماذا لو" });
    fireEvent.change(within(lab).getByRole("slider", { name: "نسبة تغير الطلب المفترضة" }), { target: { value: "20" } });
    fireEvent.click(within(lab).getByRole("button", { name: "حفظ السيناريو في دورة القرارات" }));
    await waitFor(() => expect(onSaveScenario).toHaveBeenCalledTimes(1));
    expect(onSaveScenario.mock.calls[0][0]).toMatchObject({
      status: "SIMULATED",
      changePercent: 20,
      evidenceIds: ["current-evidence", "baseline-evidence"],
      accountingFact: false,
    });
    expect(await screen.findByText(/تم تأكيد إرسال السيناريو إلى دورة القرارات/)).toBeInTheDocument();
  });

  it("does not claim a save when the decision-cycle service rejects the scenario", async () => {
    const onSaveScenario = vi.fn(async (_scenario: DemandScenarioResult) => false);
    render(<DemandForecastCard result={forecast} state="ready" onSaveScenario={onSaveScenario} />);
    const lab = screen.getByRole("region", { name: "مختبر ماذا لو" });
    fireEvent.click(within(lab).getByRole("button", { name: "حفظ السيناريو في دورة القرارات" }));
    expect(await screen.findByText(/لم يتأكد حفظ السيناريو/)).toBeInTheDocument();
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
