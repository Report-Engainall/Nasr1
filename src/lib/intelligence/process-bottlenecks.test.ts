import { describe, expect, it } from "vitest";
import {
  buildProcessBottlenecks,
  type ProcessBottleneckMetric,
  type ProcessBottleneckPeriod,
  type ProcessBottleneckSnapshot,
  type ProcessBottleneckKey,
} from "./process-bottlenecks";

const currentPeriod: ProcessBottleneckPeriod = {
  from: "2026-11-01",
  to: "2026-11-30",
  timeZone: "UTC",
};
const equalBaselinePeriod: ProcessBottleneckPeriod = {
  from: "2026-10-02",
  to: "2026-10-31",
  timeZone: "UTC",
};

function metric(window: "CURRENT" | "BASELINE", medianMinutes: number): ProcessBottleneckMetric {
  return {
    window,
    processKey: "ORDERS",
    stageKey: "MANAGER_REVIEW",
    waitClass: "INTERNAL_DRAFT_REVIEW",
    sampleCount: 5,
    averageMinutes: medianMinutes + 2,
    medianMinutes,
    p90Minutes: medianMinutes + 8,
    firstCompletedAt: window === "CURRENT" ? "2026-11-02T08:00:00.000Z" : "2026-10-03T08:00:00.000Z",
    lastCompletedAt: window === "CURRENT" ? "2026-11-29T18:00:00.000Z" : "2026-10-30T18:00:00.000Z",
  };
}

function snapshot(
  baselinePeriod: ProcessBottleneckPeriod | null,
): ProcessBottleneckSnapshot {
  const keys: ProcessBottleneckKey[] = ["ORDERS", "QUOTES", "PURCHASE", "INVOICES", "TASKS"];
  return {
    asOf: "2026-11-30T23:59:59.000Z",
    period: currentPeriod,
    baselinePeriod,
    metrics: [metric("CURRENT", 30), metric("BASELINE", 45)],
    queues: [],
    sourceCoverage: keys.map(key => ({
      key,
      status: "VERIFIED",
      source: "authorized-source",
      asOf: "2026-11-30T23:59:59.000Z",
      period: currentPeriod,
      sampleCount: 5,
      completePopulation: true,
      message: "verified",
    })),
    reopenedTasks: null,
  };
}

describe("process bottleneck before/after comparison windows", () => {
  it("compares only equal-length baseline windows that end before the current window", () => {
    const result = buildProcessBottlenecks(snapshot(equalBaselinePeriod));
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0]).toMatchObject({
      processKey: "ORDERS",
      stageKey: "MANAGER_REVIEW",
      currentMedianMinutes: 30,
      baselineMedianMinutes: 45,
      changeMinutes: -15,
      changePercent: -33.33,
    });
  });

  it("withholds comparison when baseline and current periods have unequal durations", () => {
    const shorterBaseline = { from: "2026-10-17", to: "2026-10-31", timeZone: "UTC" as const };
    const result = buildProcessBottlenecks(snapshot(shorterBaseline));
    expect(result.comparisons).toEqual([]);
    expect(result.withheldReasons).toContain(
      "فترة الأساس يجب أن تسبق الفترة الحالية وأن تطابقها في عدد الأيام؛ حُجبت المقارنة.",
    );
    expect(result.findings).toHaveLength(1);
  });

  it("withholds comparison when baseline overlaps or follows the current period", () => {
    const overlapping = { from: "2026-11-01", to: "2026-11-30", timeZone: "UTC" as const };
    const result = buildProcessBottlenecks(snapshot(overlapping));
    expect(result.comparisons).toEqual([]);
    expect(result.withheldReasons).toContain(
      "فترة الأساس يجب أن تسبق الفترة الحالية وأن تطابقها في عدد الأيام؛ حُجبت المقارنة.",
    );
  });

  it("does not claim a before/after comparison when no baseline was supplied", () => {
    const result = buildProcessBottlenecks(snapshot(null));
    expect(result.comparisons).toEqual([]);
    expect(result.withheldReasons).not.toContain(
      "فترة الأساس يجب أن تسبق الفترة الحالية وأن تطابقها في عدد الأيام؛ حُجبت المقارنة.",
    );
  });
});
