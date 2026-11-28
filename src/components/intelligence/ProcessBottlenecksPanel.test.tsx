// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProcessBottleneckResult } from "@/lib/intelligence/process-bottlenecks";

const result: ProcessBottleneckResult = {
  state: "PARTIAL",
  asOf: "2026-11-28T02:00:00.000Z",
  period: { from: "2026-10-29", to: "2026-11-28", timeZone: "UTC" },
  baselinePeriod: { from: "2026-09-29", to: "2026-10-28", timeZone: "UTC" },
  findings: [{
    processKey: "PURCHASE",
    stageKey: "receiving",
    waitClass: "MIXED_SUPPLIER_RECEIVING",
    sampleCount: 5,
    averageMinutes: 240,
    medianMinutes: 180,
    p90Minutes: 420,
    recommendation: "راجع أوامر الشراء وسندات الاستلام المرتبطة.",
  }],
  comparisons: [{
    processKey: "PURCHASE",
    stageKey: "receiving",
    currentMedianMinutes: 180,
    baselineMedianMinutes: 120,
    changeMinutes: 60,
    changePercent: 50,
    note: "زمن الوسيط الحالي أعلى من الفترة السابقة.",
  }],
  queues: [{
    processKey: "PURCHASE",
    openCount: 3,
    oldestOpenedAt: "2026-11-20T02:00:00.000Z",
    oldestAgeMinutes: 1920,
    asOf: "2026-11-28T02:00:00.000Z",
  }],
  sourceCoverage: [{
    key: "PURCHASE",
    status: "VERIFIED",
    source: "purchase_orders",
    asOf: "2026-11-28T02:00:00.000Z",
    period: { from: "2026-10-29", to: "2026-11-28", timeZone: "UTC" },
    sampleCount: 5,
    completePopulation: true,
    message: "مصدر المشتريات متاح.",
  }],
  reopenedTasks: 2,
  withheldReasons: ["TASKS_SOURCE_UNAVAILABLE"],
};

vi.mock("@/lib/intelligence/intelligence-csv", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/intelligence/intelligence-csv")>();
  return { ...original, downloadIntelligenceCsv: vi.fn() };
});

import { buildProcessBottlenecksCsv, downloadIntelligenceCsv } from "@/lib/intelligence/intelligence-csv";
import { ProcessBottlenecksPanel } from "./ProcessBottlenecksPanel";

describe("ProcessBottlenecksPanel export", () => {
  afterEach(() => cleanup());

  it("exports queues, findings, period comparisons and source coverage", () => {
    render(<ProcessBottlenecksPanel result={result} />);
    fireEvent.click(screen.getByRole("button", { name: "تصدير تحليل العمليات CSV" }));
    expect(downloadIntelligenceCsv).toHaveBeenCalledWith(
      buildProcessBottlenecksCsv(result),
      "aghbari-process-bottlenecks.csv",
    );
    const csv = buildProcessBottlenecksCsv(result);
    expect(csv).toContain("receiving");
    expect(csv).toContain("180");
    expect(csv).toContain("TASKS_SOURCE_UNAVAILABLE");
    expect(csv).toContain("SOURCE_COVERAGE");
    expect(csv).toContain("PARTIAL");
  });

  it("does not offer an export when process data is unavailable", () => {
    render(<ProcessBottlenecksPanel result={null} state="unavailable" />);
    expect(screen.queryByRole("button", { name: "تصدير تحليل العمليات CSV" })).not.toBeInTheDocument();
  });
});
