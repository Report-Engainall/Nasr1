import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ReplenishmentCard } from "./ReplenishmentCard";
import { formatEvidenceNumber } from "./shared";
import type { ReplenishmentRecommendation } from "@/lib/intelligence/replenishment";

const recommendations: ReplenishmentRecommendation[] = [
  { productRef: "SKU-LOW", status: "VERIFIED", action: "RECOMMEND", availableToPromise: 2, reorderPoint: 8, dailyDemand: 2, leadTimeDemand: 6,
    targetStock: 8, recommendedQuantity: 6, quantityUnit: "EA", formulaId: "inventory.replenishment-target", formulaVersion: "1.0.0", evidenceIds: ["e1"], warnings: [], automaticPurchase: false },
  { productRef: "SKU-UNKNOWN", status: "NEEDS_REVIEW", action: "WITHHELD", availableToPromise: null, reorderPoint: 8, dailyDemand: null, leadTimeDemand: null,
    targetStock: null, recommendedQuantity: null, quantityUnit: null, formulaId: "inventory.replenishment-target", formulaVersion: "1.0.0", evidenceIds: [], warnings: ["UNKNOWN_INPUT"], automaticPurchase: false },
];

describe("ReplenishmentCard", () => {
  it("shows recommendations without creating a purchase and withholds unknown quantity", () => {
    render(<ReplenishmentCard recommendations={recommendations} />);
    const known = screen.getByRole("article", { name: "SKU-LOW" });
    const unknown = screen.getByRole("article", { name: "SKU-UNKNOWN" });
    const recommendedLabel = within(known).getByText(/الكمية الموصى بها/);
    expect(recommendedLabel.parentElement).toHaveTextContent(formatEvidenceNumber(6) + " EA");
    expect(within(unknown).getAllByText("غير متاح").length).toBeGreaterThan(0);
    expect(screen.getByText(/لا ينشئ هذا العرض أمر شراء/)).toBeInTheDocument();
  });
});
