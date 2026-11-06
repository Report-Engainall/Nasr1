import { describe, expect, it } from "vitest";
import {
  buildProcessBottlenecks,
  parseProcessBottleneckSnapshot,
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

function metric(
  window: "CURRENT" | "BASELINE",
  medianMinutes: number,
  overrides: Partial<ProcessBottleneckMetric> = {},
): ProcessBottleneckMetric {
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
    ...overrides,
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


  it("discloses baseline stages with insufficient samples without hiding other valid comparisons", () => {
    const s = snapshot(equalBaselinePeriod);
    s.metrics = [
      metric("CURRENT", 30, { stageKey: "A", sampleCount: 5 }),
      metric("BASELINE", 45, { stageKey: "A", sampleCount: 5 }),
      metric("CURRENT", 12, { stageKey: "B", sampleCount: 5 }),
      metric("BASELINE", 9, { stageKey: "B", sampleCount: 2 }),
    ];
    const result = buildProcessBottlenecks(s);
    expect(result.comparisons).toHaveLength(1);
    expect(result.comparisons[0].stageKey).toBe("A");
    expect(result.withheldReasons).toContain(
      "مقارنة المرحلة ORDERS/B محجوبة: عينة فترة الأساس أقل من 3 (n=2).",
    );
  });

  it("does not treat a stage missing from either window as a zero-duration stage", () => {
    const s = snapshot(equalBaselinePeriod);
    s.metrics = [
      metric("CURRENT", 30, { stageKey: "NEW_STAGE" }),
      metric("BASELINE", 45, { stageKey: "OLD_STAGE" }),
    ];
    const result = buildProcessBottlenecks(s);
    expect(result.comparisons).toEqual([]);
    expect(result.withheldReasons).toContain(
      "لم تُرصد المرحلة ORDERS/NEW_STAGE في فترة الأساس؛ لم تُعامل كقيمة صفرية.",
    );
    expect(result.withheldReasons).toContain(
      "لم تُرصد المرحلة ORDERS/OLD_STAGE في الفترة الحالية؛ لم تُعامل كقيمة صفرية.",
    );
  });

  it("rejects duplicate aggregate identities and metrics outside their source window", () => {
    const valid = snapshot(equalBaselinePeriod);
    expect(parseProcessBottleneckSnapshot(valid)).not.toBeNull();
    expect(parseProcessBottleneckSnapshot({
      ...valid,
      metrics: [...valid.metrics, valid.metrics[0]],
    })).toBeNull();
    expect(parseProcessBottleneckSnapshot({
      ...valid,
      metrics: [metric("CURRENT", 30, { lastCompletedAt: "2026-12-01T00:00:00.000Z" }), valid.metrics[1]],
    })).toBeNull();
  });

  it("rejects quantile order violations and inconsistent or future queue ages", () => {
    const valid = snapshot(equalBaselinePeriod);
    expect(parseProcessBottleneckSnapshot({
      ...valid,
      metrics: [metric("CURRENT", 30, { p90Minutes: 20 }), valid.metrics[1]],
    })).toBeNull();
    const queue = {
      processKey: "ORDERS",
      openCount: 1,
      oldestOpenedAt: "2026-11-30T23:50:00.000Z",
      oldestAgeMinutes: 5,
      asOf: valid.asOf,
    };
    expect(parseProcessBottleneckSnapshot({ ...valid, queues: [queue] })).toBeNull();
    expect(parseProcessBottleneckSnapshot({
      ...valid,
      queues: [{ ...queue, oldestOpenedAt: "2026-12-01T00:01:00.000Z", oldestAgeMinutes: 0 }],
    })).toBeNull();
  });

  it("does not claim a before/after comparison when no baseline was supplied", () => {
    const result = buildProcessBottlenecks(snapshot(null));
    expect(result.comparisons).toEqual([]);
    expect(result.withheldReasons).not.toContain(
      "فترة الأساس يجب أن تسبق الفترة الحالية وأن تطابقها في عدد الأيام؛ حُجبت المقارنة.",
    );
  });
});
