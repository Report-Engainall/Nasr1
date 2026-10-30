import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CashflowForecastCard } from "./CashflowForecastCard";
import type { CashflowForecast } from "@/lib/intelligence/cashflow-forecast";

const forecast: CashflowForecast = {
  id: "forecast-test", generatedAt: "2026-10-30T07:00:00Z", asOf: "2026-10-30T07:00:00Z", warnings: [],
  points: (["YER", "USD"] as const).flatMap((currency, index) => ([7, 30, 90] as const).map((horizonDays) => ({
    currency, horizonDays, period: { from: "2026-10-30", to: "2027-01-28" }, asOf: "2026-10-30T07:00:00Z",
    openingBalance: index === 0 ? 100 : null, knownInflows: index === 0 ? 20 : null, knownOutflows: 10,
    projectedBalance: index === 0 ? 110 : null, status: index === 0 ? "VERIFIED" as const : "UNAVAILABLE" as const,
    scheduleComplete: index === 0, formulaId: "cashflow.scheduled-net", formulaVersion: "1.0.0", evidenceIds: [], formulaVersions: [],
    warnings: index === 0 ? [] : ["OPENING_BALANCE_NOT_VERIFIED"],
  }))),
};

describe("CashflowForecastCard", () => {
  it("groups horizons by currency and does not aggregate currencies", () => {
    render(<CashflowForecastCard forecast={forecast} />);
    const yer = screen.getByRole("article", { name: "YER" });
    const usd = screen.getByRole("article", { name: "USD" });
    expect(within(yer).getAllByText("7 يومًا")).toHaveLength(1);
    expect(within(yer).getByText(/110/)).toBeInTheDocument();
    expect(within(usd).getAllByText("غير متاح").length).toBeGreaterThan(0);
    expect(screen.queryByText(/210/)).not.toBeInTheDocument();
  });
});
