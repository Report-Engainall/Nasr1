import { describe, expect, it } from "vitest";
import { buildTaskQualityInsights } from "./task-quality-insights";
import type { TaskQualityMetrics } from "./task-quality-reviews";

type ReadyMetrics = Extract<TaskQualityMetrics, { status: "READY" }>;

function makeReady(overrides: Partial<ReadyMetrics> = {}): ReadyMetrics {
  return {
    status: "READY",
    scope: { visibleTaskCount: 20, reviewedTaskCount: 12 },
    actionability: {
      reviewedCount: 10,
      actionableCount: 6,
      notActionableCount: 2,
      deferredCount: 2,
      rateDenominator: 8,
      actionableRatePercent: 75,
      notActionableReasons: [
        { reasonCode: "SOURCE_MISSING", reviewCount: 2, affectedTaskCount: 2 },
      ],
    },
    disposition: {
      reviewedCount: 6,
      approvedCount: 3,
      rejectedCount: 2,
      deferredCount: 1,
      rejectionReasons: [
        { reasonCode: "POLICY_CONFLICT", reviewCount: 2, affectedTaskCount: 1 },
      ],
      // The source groups deferrals from both actionability and disposition reviews.
      deferralReasons: [
        { reasonCode: "RESOURCE_UNAVAILABLE", reviewCount: 3, affectedTaskCount: 2 },
      ],
    },
    alerts: {
      reviewedCount: 8,
      truePositiveCount: 6,
      falsePositiveCount: 1,
      needsReviewCount: 1,
      falseAlarmDenominator: 7,
      falseAlarmRatePercent: 14.29,
    },
    causeReviewCount: 8,
    repeatedCauses: [
      { reasonCode: "SOURCE_MISSING", affectedTaskCount: 2, reviewCount: 2 },
      { reasonCode: "POLICY_CONFLICT", affectedTaskCount: 3, reviewCount: 4 },
    ],
    ...overrides,
  };
}

function makeEmpty(): Extract<TaskQualityMetrics, { status: "EMPTY" }> {
  return {
    status: "EMPTY",
    scope: { visibleTaskCount: 3, reviewedTaskCount: 0 },
    actionability: {
      reviewedCount: 0, actionableCount: 0, notActionableCount: 0, deferredCount: 0,
      rateDenominator: 0, actionableRatePercent: null, notActionableReasons: [],
    },
    disposition: {
      reviewedCount: 0, approvedCount: 0, rejectedCount: 0, deferredCount: 0,
      rejectionReasons: [], deferralReasons: [],
    },
    alerts: {
      reviewedCount: 0, truePositiveCount: 0, falsePositiveCount: 0, needsReviewCount: 0,
      falseAlarmDenominator: 0, falseAlarmRatePercent: null,
    },
    causeReviewCount: 0,
    repeatedCauses: [],
  };
}

function insight(metrics: TaskQualityMetrics, key: string) {
  const found = buildTaskQualityInsights(metrics).find(item => item.key === key);
  if (!found) throw new Error("missing insight " + key);
  return found;
}

describe("buildTaskQualityInsights", () => {
  it("fails closed for restricted and unavailable sources without fabricating metrics", () => {
    const restricted = buildTaskQualityInsights({
      status: "RESTRICTED",
      reasonCode: "QUALITY_REVIEW_MANAGER_ONLY",
    });
    const unavailable = buildTaskQualityInsights({
      status: "UNAVAILABLE",
      reasonCode: "QUALITY_REVIEW_MIGRATION_PENDING",
    });

    expect(restricted).toHaveLength(1);
    expect(restricted[0]).toMatchObject({ key: "SOURCE_STATE", state: "RESTRICTED" });
    expect(unavailable).toHaveLength(1);
    expect(unavailable[0]).toMatchObject({ key: "SOURCE_STATE", state: "UNAVAILABLE" });
    expect(unavailable[0].value).toBe("المصدر غير متاح");
    expect(unavailable[0].interpretation).toContain("لا تُعرض أصفار");
  });

  it("keeps an empty source distinct from denied or unavailable and avoids a false zero-quality claim", () => {
    const result = buildTaskQualityInsights(makeEmpty());

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ key: "SOURCE_STATE", state: "EMPTY", value: "لا توجد مراجعات محفوظة" });
    expect(result[0].evidence).toContain("0");
    expect(result[0].interpretation).toContain("لا توجد مراجعات محفوظة");
    expect(result[0].interpretation).not.toContain("مصدر محجوب");
    expect(result[0].interpretation).toContain("لا تُفسّر ذلك كصفر");
  });

  it("emits six stable, distinct insights for a valid ready source without adding a composite score", () => {
    const result = buildTaskQualityInsights(makeReady());

    expect(result).toHaveLength(6);
    expect(result.map(item => item.key)).toEqual([
      "REVIEW_COVERAGE",
      "ACTIONABILITY_RATE",
      "DISPOSITION_APPROVAL_RATE",
      "FALSE_ALARM_RATE",
      "DEFERRED_DISPOSITION_SHARE",
      "REPEATED_CAUSE_LEADER",
    ]);
    expect(new Set(result.map(item => item.key)).size).toBe(6);
    expect(result.every(item => item.value.length > 0 && item.interpretation.length > 0 && item.nextStep.length > 0)).toBe(true);
    expect(result.some(item => /درجة كلية|مؤشر مركب|نقاط جودة/.test(item.title + item.interpretation))).toBe(false);
  });

  it("labels a repeated cause from two to four distinct tasks as LOW_SAMPLE, not READY", () => {
    const result = makeReady({
      repeatedCauses: [
        { reasonCode: "SOURCE_MISSING", affectedTaskCount: 2, reviewCount: 5 },
      ],
    });
    const card = insight(result, "REPEATED_CAUSE_LEADER");

    expect(card.state).toBe("LOW_SAMPLE");
    expect(card.evidence).toContain("2");
    expect(card.interpretation).toContain("العينة أقل من 5");
  });

  it("labels a repeated cause READY only when at least five different tasks support it", () => {
    const result = makeReady({
      repeatedCauses: [
        { reasonCode: "SOURCE_MISSING", affectedTaskCount: 5, reviewCount: 8 },
      ],
    });

    expect(insight(result, "REPEATED_CAUSE_LEADER").state).toBe("READY");
  });

  it("uses deterministic affected-task, review-count and reason-code ordering", () => {
    const result = makeReady({
      repeatedCauses: [
        { reasonCode: "TIMING_NOT_APPROPRIATE", affectedTaskCount: 3, reviewCount: 4 },
        { reasonCode: "SOURCE_STALE", affectedTaskCount: 3, reviewCount: 7 },
        { reasonCode: "BUDGET_CONSTRAINT", affectedTaskCount: 2, reviewCount: 9 },
      ],
    });

    expect(insight(result, "REPEATED_CAUSE_LEADER").value).toBe("بيانات المصدر قديمة");
    expect(insight(result, "REPEATED_CAUSE_LEADER").state).toBe("LOW_SAMPLE");
  });

  it("keeps deferred actionability outside the decisive actionability denominator", () => {
    const result = makeReady();
    const card = insight(result, "ACTIONABILITY_RATE");

    expect(card.evidence).toContain("6");
    expect(card.evidence).toContain("8");
    expect(card.evidence).toContain("المؤجل 2 مستبعد");
    expect(card.state).toBe("READY");
    expect(card.value).not.toBe("غير محسوب");
  });

  it("keeps deferred disposition outside the acceptance rate but inside the deferred share", () => {
    const result = makeReady();
    const approval = insight(result, "DISPOSITION_APPROVAL_RATE");
    const deferred = insight(result, "DEFERRED_DISPOSITION_SHARE");

    expect(approval.evidence).toContain("3 قبول من 5 قرار قبول/رفض");
    expect(approval.evidence).toContain("المؤجل 1 مستبعد");
    expect(deferred.evidence).toContain("1 تأجيل من 6 قرار مراجعة");
    expect(approval.value).not.toBe("غير محسوب");
  });

  it("excludes NEEDS_REVIEW alerts from the false-alarm denominator", () => {
    const card = insight(makeReady(), "FALSE_ALARM_RATE");

    expect(card.evidence).toContain("1 كاذب من 7");
    expect(card.evidence).toContain("1 يحتاج مراجعة ومستبعد");
    expect(card.state).toBe("READY");
  });

  it("withholds every rate whose denominator is zero instead of presenting a zero percent", () => {
    const result = makeReady({
      actionability: {
        reviewedCount: 2,
        actionableCount: 0,
        notActionableCount: 0,
        deferredCount: 2,
        rateDenominator: 0,
        actionableRatePercent: null,
        notActionableReasons: [],
      },
      disposition: {
        reviewedCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        deferredCount: 0,
        rejectionReasons: [],
        deferralReasons: [
          { reasonCode: "RESOURCE_UNAVAILABLE", reviewCount: 2, affectedTaskCount: 2 },
        ],
      },
      alerts: {
        reviewedCount: 1,
        truePositiveCount: 0,
        falsePositiveCount: 0,
        needsReviewCount: 1,
        falseAlarmDenominator: 0,
        falseAlarmRatePercent: null,
      },
      causeReviewCount: 2,
      repeatedCauses: [],
    });

    expect(insight(result, "ACTIONABILITY_RATE")).toMatchObject({ value: "غير محسوب", state: "WITHHELD" });
    expect(insight(result, "DISPOSITION_APPROVAL_RATE")).toMatchObject({ value: "غير محسوب", state: "WITHHELD" });
    expect(insight(result, "FALSE_ALARM_RATE")).toMatchObject({ value: "غير محسوب", state: "WITHHELD" });
    expect(insight(result, "DEFERRED_DISPOSITION_SHARE")).toMatchObject({ value: "غير محسوب", state: "WITHHELD" });
  });

  it("withholds coverage when no visible-task denominator exists", () => {
    const result = makeReady({ scope: { visibleTaskCount: 0, reviewedTaskCount: 0 } });

    expect(insight(result, "REVIEW_COVERAGE")).toMatchObject({ value: "غير محسوب", state: "WITHHELD" });
    expect(insight(result, "REVIEW_COVERAGE").evidence).toContain("يساوي صفراً");
  });

  it("labels the review-coverage sample independently from decisive outcome samples", () => {
    const low = makeReady({ scope: { visibleTaskCount: 20, reviewedTaskCount: 4 } });
    const sufficient = makeReady({ scope: { visibleTaskCount: 20, reviewedTaskCount: 5 } });

    expect(insight(low, "REVIEW_COVERAGE").state).toBe("LOW_SAMPLE");
    expect(insight(sufficient, "REVIEW_COVERAGE").state).toBe("READY");
  });

  it("does not mutate the source metrics while sorting repeated causes", () => {
    const metrics = makeReady();
    const before = JSON.stringify(metrics);
    buildTaskQualityInsights(metrics);
    expect(JSON.stringify(metrics)).toBe(before);
  });
});
