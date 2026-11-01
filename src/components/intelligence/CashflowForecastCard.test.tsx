import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { CashflowForecastCard } from "./CashflowForecastCard";
import { formatEvidenceNumber } from "./shared";
import type { CashflowForecast } from "@/lib/intelligence/cashflow-forecast";

const forecast: CashflowForecast = {
  id: "forecast-test", generatedAt: "2026-10-30T07:00:00Z", asOf: "2026-10-30T07:00:00Z", warnings: [],
  points: (["YER", "USD"] as const).flatMap((currency, index) => ([7, 30, 90] as const).map((horizonDays) => ({
    currency, horizonDays, period: { from: "2026-10-30", to: "2027-01-28" }, asOf: "2026-10-30T07:00:00Z",
    openingBalance: index === 0 ? 100 : null, knownInflows: index === 0 ? 20 : null, knownOutflows: 10,
    projectedBalance: index === 0 ? 110 : null, status: index === 0 ? "VERIFIED" as const : "UNAVAILABLE" as const,
    scheduleComplete: index === 0, formulaId: "cashflow.scheduled-net", formulaVersion: "1.0.0", evidenceIds: ["proof-" + currency + "-" + horizonDays], formulaVersions: ["1.0.0"],
    warnings: index === 0 ? [] : ["OPENING_BALANCE_NOT_VERIFIED"],
  }))),
};

describe("CashflowForecastCard", () => {
  it("groups horizons and proof by currency without aggregating distinct currencies", () => {
    render(<CashflowForecastCard forecast={forecast} />);
    const yer = screen.getByRole("article", { name: "YER" });
    const usd = screen.getByRole("article", { name: "USD" });

    expect(within(yer).getByText("7 يومًا")).toBeInTheDocument();
    expect(within(yer).getByText("30 يومًا")).toBeInTheDocument();
    expect(within(yer).getByText("90 يومًا")).toBeInTheDocument();
    expect(within(yer).getAllByText(formatEvidenceNumber(110) + " YER")).toHaveLength(3);
    expect(within(yer).getByText(/مكتمل · المعادلة: cashflow.scheduled-net@1.0.0/)).toBeInTheDocument();
    expect(within(yer).getByText(/proof-YER-7/)).toBeInTheDocument();

    expect(within(usd).getAllByText("غير متاح").length).toBeGreaterThan(0);
    expect(within(usd).getByText(/غير مكتمل · المعادلة: cashflow.scheduled-net@1.0.0/)).toBeInTheDocument();
    expect(within(usd).getByText(/OPENING_BALANCE_NOT_VERIFIED/)).toBeInTheDocument();
    expect(within(usd).getByText(/proof-USD-7/)).toBeInTheDocument();

    expect(screen.queryByText(formatEvidenceNumber(210) + " YER")).not.toBeInTheDocument();
  });
});
