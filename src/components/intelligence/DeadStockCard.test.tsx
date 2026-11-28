// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DeadStockReport } from "@/lib/intelligence/dead-stock";

vi.mock("@/lib/intelligence/intelligence-csv", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/intelligence/intelligence-csv")>();
  return { ...original, downloadIntelligenceCsv: vi.fn() };
});

import { buildDeadStockCsv, downloadIntelligenceCsv } from "@/lib/intelligence/intelligence-csv";
import { DeadStockCard } from "./DeadStockCard";

const report: DeadStockReport = {
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

describe("DeadStockCard export", () => {
  afterEach(() => cleanup());

  it("exports the complete loaded report including unknown rows and separate currency totals", () => {
    render(<DeadStockCard report={report} />);
    fireEvent.click(screen.getByRole("button", { name: "تصدير تحليل المخزون CSV" }));
    expect(downloadIntelligenceCsv).toHaveBeenCalledWith(
      buildDeadStockCsv(report),
      "aghbari-dead-stock.csv",
    );
  });

  it("does not offer an export for an unavailable source", () => {
    render(<DeadStockCard report={null} state="unavailable" />);
    expect(screen.queryByRole("button", { name: "تصدير تحليل المخزون CSV" })).not.toBeInTheDocument();
  });
});
