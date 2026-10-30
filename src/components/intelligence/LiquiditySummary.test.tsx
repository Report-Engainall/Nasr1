import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LiquiditySummary } from "./LiquiditySummary";
import { formatEvidenceNumber } from "./shared";
import type { LiquiditySnapshot } from "@/lib/intelligence/liquidity";

const snapshot: LiquiditySnapshot = {
  id: "liquidity-test", generatedAt: "2026-10-30T07:00:00Z", asOf: "2026-10-30T07:00:00Z",
  period: { from: "2026-10-01", to: "2026-10-30" }, warnings: [],
  positions: [
    { currency: "YER", asOf: "2026-10-30T07:00:00Z", period: { from: "2026-10-01", to: "2026-10-30" }, status: "VERIFIED", completeness: "COMPLETE",
      availableBalance: 100, availableBalanceStatus: "VERIFIED", expectedCollections: 20, expectedCollectionsStatus: "VERIFIED",
      overdueReceivables: null, overdueReceivablesStatus: "UNAVAILABLE", dueObligations: 30, dueObligationsStatus: "VERIFIED",
      netAvailableLiquidity: 90, stagnantStockExposure: null, stagnantStockExposureStatus: "UNAVAILABLE",
      receivableAging: [], formulaId: "liquidity.net-available", formulaVersion: "1.0.0", lineage: { metricIds: ["m1"], evidenceIds: ["e1"], formulaVersions: ["cash@1"] }, warnings: [] },
    { currency: "USD", asOf: "2026-10-30T07:00:00Z", period: { from: "2026-10-01", to: "2026-10-30" }, status: "NEEDS_REVIEW", completeness: "PARTIAL",
      availableBalance: null, availableBalanceStatus: "UNAVAILABLE", expectedCollections: 5, expectedCollectionsStatus: "VERIFIED",
      overdueReceivables: null, overdueReceivablesStatus: "UNAVAILABLE", dueObligations: null, dueObligationsStatus: "UNAVAILABLE",
      netAvailableLiquidity: null, stagnantStockExposure: null, stagnantStockExposureStatus: "UNAVAILABLE",
      receivableAging: [], formulaId: "liquidity.net-available", formulaVersion: "1.0.0", lineage: { metricIds: ["m2"], evidenceIds: [], formulaVersions: [] }, warnings: ["DUE_OBLIGATION_UNAVAILABLE"] },
  ],
};

describe("LiquiditySummary", () => {
  it("renders currencies separately and preserves unknown values as unavailable", () => {
    render(<LiquiditySummary snapshot={snapshot} />);
    const yer = screen.getByRole("article", { name: "YER" });
    const usd = screen.getByRole("article", { name: "USD" });
    expect(within(yer).getByText(/90 YER/)).toBeInTheDocument();
    expect(within(yer).getByText(/تكلفة المخزون الراكد/)).toBeInTheDocument();
    expect(within(usd).getAllByText("غير متاح").length).toBeGreaterThan(0);
    expect(screen.queryByText(formatEvidenceNumber(190) + " YER")).not.toBeInTheDocument();
  });

  it("shows each supplemental metric's evidence state independently of net liquidity", () => {
    const fieldStatusSnapshot: LiquiditySnapshot = {
      ...snapshot,
      positions: [{
        ...snapshot.positions[0],
        status: "VERIFIED",
        completeness: "COMPLETE",
        overdueReceivables: null,
        overdueReceivablesStatus: "UNVERIFIED",
        stagnantStockExposure: null,
        stagnantStockExposureStatus: "NEEDS_REVIEW",
      }],
    };
    render(<LiquiditySummary snapshot={fieldStatusSnapshot} />);
    const yer = screen.getByRole("article", { name: "YER" });
    expect(within(yer).getByText(/حالة صافي السيولة:/)).toBeInTheDocument();
    expect(within(yer).getAllByText("مثبت").length).toBeGreaterThan(0);
    expect(within(yer).getByText(/الذمم المتأخرة/)).toBeInTheDocument();
    expect(within(yer).getByText(/تكلفة المخزون الراكد المثبتة/)).toBeInTheDocument();
    expect(within(yer).getByText("غير مثبت")).toBeInTheDocument();
    expect(within(yer).getByText("يحتاج مراجعة")).toBeInTheDocument();
  });

  it("does not turn a missing snapshot into an empty numeric report", () => {
    render(<LiquiditySummary state="unavailable" />);
    expect(screen.getByRole("note")).toHaveTextContent("المصدر غير متاح");
  });
});
