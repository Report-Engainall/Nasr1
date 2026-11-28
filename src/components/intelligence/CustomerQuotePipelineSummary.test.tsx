// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomerQuotePipelineResult } from "@/lib/intelligence/customer-quote-pipeline";

const result: CustomerQuotePipelineResult = {
  kind: "CUSTOMER_QUOTE_PIPELINE",
  state: "READY",
  sourceRpc: "fetch_customer_quote_pipeline",
  asOf: "2026-11-28T02:00:00.000Z",
  period: { from: "2026-11-01", to: "2026-11-28", timeZone: "UTC" },
  cohortBasis: "SALES_QUOTES.CREATED_AT",
  statusAsOf: "2026-11-28T02:00:00.000Z",
  completePopulation: true,
  totalQuotes: 10,
  requestedForPricing: 2,
  awaitingCustomerResponse: 3,
  accepted: 3,
  rejected: 1,
  expired: 1,
  decidedCount: 4,
  acceptanceRatePercent: 75,
  answer: "هناك عشرة عروض.",
  warnings: ["ACCEPTANCE_IS_NOT_ORDER_CONVERSION"],
};

vi.mock("@/lib/intelligence/intelligence-csv", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/intelligence/intelligence-csv")>();
  return { ...original, downloadIntelligenceCsv: vi.fn() };
});

import { buildCustomerQuotePipelineCsv, downloadIntelligenceCsv } from "@/lib/intelligence/intelligence-csv";
import { CustomerQuotePipelineSummary } from "./CustomerQuotePipelineSummary";

describe("CustomerQuotePipelineSummary export", () => {
  afterEach(() => cleanup());

  it("exports the current quote cohort and its conversion caveat", () => {
    render(<CustomerQuotePipelineSummary result={result} />);
    fireEvent.click(screen.getByRole("button", { name: "تصدير مسار العروض CSV" }));
    expect(downloadIntelligenceCsv).toHaveBeenCalledWith(
      buildCustomerQuotePipelineCsv(result),
      "aghbari-customer-quote-pipeline.csv",
    );
  });
});
