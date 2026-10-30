import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DeadStockCard } from "./DeadStockCard";
import type { DeadStockReport } from "@/lib/intelligence/dead-stock";

const report: DeadStockReport = {
  id: "dead-stock-test", asOf: "2026-10-30T07:00:00Z", period: { from: "2026-09-30", to: "2026-10-30" },
  ruleId: "dead-stock.v1", ruleVersion: "1.0.0", status: "NEEDS_REVIEW", warnings: [],
  items: [
    { productRef: "SKU-1", classification: "STAGNANT", daysSinceMovement: 60, lowTurnover: true, turnoverRatio: 0.1,
      availableQuantity: 10, unitCost: 5, currency: "YER", financialExposure: 50, exposureStatus: "VERIFIED", movementStatus: "VERIFIED",
      formulaId: "dead-stock.exposure", formulaVersion: "1.0.0", evidenceIds: ["e1"], warnings: [] },
    { productRef: "SKU-2", classification: "UNKNOWN", daysSinceMovement: null, lowTurnover: null, turnoverRatio: null,
      availableQuantity: 4, unitCost: null, currency: null, financialExposure: null, exposureStatus: "UNAVAILABLE", movementStatus: "NEEDS_REVIEW",
      formulaId: "dead-stock.exposure", formulaVersion: "1.0.0", evidenceIds: [], warnings: ["UNIT_COST_NOT_AVAILABLE"] },
  ],
  totalsByCurrency: [{ currency: "YER", exposure: null, verifiedItems: 1, withheldItems: 0 }],
};

describe("DeadStockCard", () => {
  it("shows verified cost exposure and withholds unknown exposure", () => {
    render(<DeadStockCard report={report} />);
    const known = screen.getByRole("article", { name: "SKU-1" });
    const unknown = screen.getByRole("article", { name: "SKU-2" });
    expect(within(known).getByText(/50 YER/)).toBeInTheDocument();
    expect(within(unknown).getByText("غير متاح")).toBeInTheDocument();
    expect(within(unknown).getByText("غير معروف")).toBeInTheDocument();
    expect(screen.getByText(/غير متاح/, { selector: "span" })).toBeInTheDocument();
  });
});
