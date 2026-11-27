import { describe, expect, it } from "vitest";
import type { DecisionMemoryRecord } from "@/lib/intelligence/decision-memory";
import {
  buildDailyDecisionCsv,
  filterDailyDecisionRecords,
  isDailyDecisionDueWithin,
  isDailyDecisionOverdue,
  isDailyDecisionUnscheduled,
  normalizeDailyDecisionSearch,
  paginateDailyDecisionRecords,
  summarizeDailyDecisionBoard,
} from "./DailyDecisionBoard";

const NOW = Date.parse("2026-11-28T10:00:00.000Z");

function decision(
  id: string,
  state: DecisionMemoryRecord["state"],
  overrides: Partial<DecisionMemoryRecord> = {},
): DecisionMemoryRecord {
  return {
    decisionId: id,
    candidateRef: "candidate-" + id,
    ruleId: "SUPPLIER_FOLLOW_UP",
    ruleVersion: "1",
    state,
    version: 1,
    createdAt: "2026-11-27T08:00:00.000Z",
    updatedAt: "2026-11-27T08:00:00.000Z",
    owner: "فريق المشتريات",
    ownerProfileId: null,
    proposedResult: "متابعة قرار " + id,
    decisionReason: null,
    approvalAt: null,
    executionAt: null,
    eventCount: 0,
    events: [],
    legacyMeasurement: null,
    candidateSnapshot: null,
    snapshotVersion: null,
    capturedAt: null,
    snapshot: null,
    problem: null,
    factsReviewed: false,
    facts: [],
    opinions: [],
    hypotheses: [],
    assumptionsReviewed: false,
    assumptions: [],
    lessonsReviewed: false,
    withheldFacts: 0,
    alternatives: [],
    chosenAlternative: null,
    actionTaken: null,
    reviewDisposition: "NOT_SCHEDULED",
    reviewAt: null,
    expectedMetric: null,
    metricComparison: {
      status: "WITHHELD",
      expected: null,
      actual: null,
      difference: null,
      differencePercent: null,
      reason: "NO_MEASUREMENT",
    },
    lessons: [],
    corrections: [],
    missingFields: [],
    warnings: [],
    memoryStatus: "PARTIAL",
    precedents: [],
    ...overrides,
  };
}

describe("daily decision work queue selectors", () => {
  it("keeps every non-terminal decision in the action queue, including resumable deferrals", () => {
    const records = [
      decision("proposal", "PROPOSED"),
      decision("deferred", "DEFERRED"),
      decision("measured", "MEASURED"),
      decision("rejected", "REJECTED"),
    ];

    expect(filterDailyDecisionRecords(records, "OPEN", "", NOW).map(item => item.decisionId).sort())
      .toEqual(["deferred", "proposal"]);
  });

  it("marks only scheduled, due, non-terminal decisions as overdue", () => {
    const overdue = decision("late", "ASSIGNED", {
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-11-28T09:59:59.999Z",
    });
    const dueNow = decision("due-now", "IN_REVIEW", {
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-11-28T10:00:00.000Z",
    });
    const future = decision("future", "EXECUTING", {
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-11-28T10:00:00.001Z",
    });
    const notScheduled = decision("unscheduled", "PROPOSED", {
      reviewDisposition: "NOT_SCHEDULED",
      reviewAt: "2026-11-28T09:00:00.000Z",
    });
    const closed = decision("closed", "MEASURED", {
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-11-28T09:00:00.000Z",
    });

    expect(isDailyDecisionOverdue(overdue, NOW)).toBe(true);
    expect(isDailyDecisionOverdue(dueNow, NOW)).toBe(true);
    expect(isDailyDecisionOverdue(future, NOW)).toBe(false);
    expect(isDailyDecisionOverdue(notScheduled, NOW)).toBe(false);
    expect(isDailyDecisionOverdue(closed, NOW)).toBe(false);
    expect(filterDailyDecisionRecords(
      [overdue, dueNow, future, notScheduled, closed], "OVERDUE", "", NOW,
    ).map(item => item.decisionId).sort()).toEqual(["due-now", "late"]);
  });

  it("separates overdue, upcoming 24-hour and 7-day review windows from unscheduled items", () => {
    const late = decision("late", "ASSIGNED", {
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-11-28T09:00:00.000Z",
    });
    const dueSoon = decision("soon", "IN_REVIEW", {
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-11-28T22:00:00.000Z",
    });
    const dueThisWeek = decision("week", "APPROVED", {
      reviewDisposition: "SCHEDULED",
      reviewAt: "2026-12-02T10:00:00.000Z",
    });
    const noSchedule = decision("no-date", "PROPOSED", {
      reviewDisposition: "NOT_SCHEDULED",
    });
    const terminal = decision("closed", "MEASURED", {
      reviewDisposition: "NOT_SCHEDULED",
    });

    expect(isDailyDecisionDueWithin(dueSoon, NOW, 24 * 60 * 60 * 1000)).toBe(true);
    expect(isDailyDecisionDueWithin(dueThisWeek, NOW, 24 * 60 * 60 * 1000)).toBe(false);
    expect(isDailyDecisionDueWithin(dueThisWeek, NOW, 7 * 24 * 60 * 60 * 1000)).toBe(true);
    expect(isDailyDecisionUnscheduled(noSchedule)).toBe(true);
    expect(isDailyDecisionUnscheduled(decision("executed", "EXECUTED", {
      reviewDisposition: "NOT_SCHEDULED",
    }))).toBe(false);
    expect(isDailyDecisionUnscheduled(terminal)).toBe(false);
    expect(filterDailyDecisionRecords([late, dueSoon, dueThisWeek, noSchedule, terminal], "DUE_24H", "", NOW)
      .map(item => item.decisionId)).toEqual(["soon"]);
    expect(filterDailyDecisionRecords([late, dueSoon, dueThisWeek, noSchedule, terminal], "DUE_7_DAYS", "", NOW)
      .map(item => item.decisionId).sort()).toEqual(["soon", "week"]);
    expect(filterDailyDecisionRecords([late, dueSoon, dueThisWeek, noSchedule, terminal], "UNSCHEDULED", "", NOW)
      .map(item => item.decisionId)).toEqual(["no-date"]);
  });

  it("exports only supplied rows and protects spreadsheet formula-like fields", () => {
    const unsafe = decision("csv-1", "PROPOSED", {
      proposedResult: '=HYPERLINK("https://example.invalid","open")',
      owner: "\t@SUM(A1:A2)",
      decisionReason: 'contains "quotes", commas, and a newline\nsecond line',
    });
    const csv = buildDailyDecisionCsv([unsafe]);

    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("تنبيه التغطية");
    expect(csv).toContain('"\'=HYPERLINK(""https://example.invalid"",""open"")"');
    expect(csv).toContain('"\'\t@SUM(A1:A2)"');
    expect(csv).toContain('"contains ""quotes"", commas, and a newline');
    expect(buildDailyDecisionCsv([])).toContain("مرجع القرار");
  });

  it("isolates executed decisions waiting for measurement from fully closed outcomes", () => {
    const executed = decision("awaiting-proof", "EXECUTED");
    const measured = decision("measured", "MEASURED");
    const rejected = decision("rejected", "REJECTED");
    const proposed = decision("proposed", "PROPOSED");

    expect(filterDailyDecisionRecords(
      [executed, measured, rejected, proposed], "AWAITING_MEASUREMENT", "", NOW,
    ).map(item => item.decisionId)).toEqual(["awaiting-proof"]);
    expect(filterDailyDecisionRecords(
      [executed, measured, rejected, proposed], "CLOSED", "", NOW,
    ).map(item => item.decisionId).sort()).toEqual(["measured", "rejected"]);
  });

  it("searches decision text and owner while staying within the returned source records", () => {
    const supplier = decision("supplier", "IN_REVIEW", {
      proposedResult: "مراجعة التزام المورد",
      owner: "Rami",
      decisionReason: "Supplier due balance needs follow-up",
    });
    const collections = decision("collections", "APPROVED", {
      proposedResult: "مراجعة تحصيل العميل",
      owner: "فريق التحصيل",
    });

    expect(filterDailyDecisionRecords([supplier, collections], "ALL", "المورد", NOW)
      .map(item => item.decisionId)).toEqual(["supplier"]);
    expect(filterDailyDecisionRecords([supplier, collections], "ALL", "rami", NOW)
      .map(item => item.decisionId)).toEqual(["supplier"]);
  });

  it("normalizes Arabic hamza forms, diacritics and tatweel for search", () => {
    expect(normalizeDailyDecisionSearch("إِجْرَاء مُؤَجَّل"))
      .toBe(normalizeDailyDecisionSearch("اجراء مؤجل"));
    expect(normalizeDailyDecisionSearch("المـُورِّد"))
      .toBe(normalizeDailyDecisionSearch("المورد"));
  });

  it("paginates the full filtered result set without dropping records", () => {
    const records = Array.from({ length: 23 }, (_, index) =>
      decision("page-" + String(index + 1).padStart(2, "0"), "PROPOSED"),
    );

    const first = paginateDailyDecisionRecords(records, 0);
    const second = paginateDailyDecisionRecords(records, 1);
    const third = paginateDailyDecisionRecords(records, 2);
    const beyond = paginateDailyDecisionRecords(records, 99);

    expect(first.items).toHaveLength(10);
    expect(second.items).toHaveLength(10);
    expect(third.items).toHaveLength(3);
    expect(third.firstItem).toBe(21);
    expect(third.lastItem).toBe(23);
    expect(beyond.pageIndex).toBe(2);
    expect([...first.items, ...second.items, ...third.items].map(item => item.decisionId))
      .toEqual(records.map(item => item.decisionId));
  });

  it("filters by assigned owner and saved priority without reclassifying historical records", () => {
    const salesP1 = decision("sales-p1", "IN_REVIEW", {
      owner: "فريق المبيعات",
      candidateSnapshot: { priority: "P1" } as NonNullable<DecisionMemoryRecord["candidateSnapshot"]>,
    });
    const salesP2 = decision("sales-p2", "APPROVED", {
      owner: "فريق المبيعات",
      candidateSnapshot: { priority: "P2" } as NonNullable<DecisionMemoryRecord["candidateSnapshot"]>,
    });
    const legacy = decision("legacy", "PROPOSED", {
      owner: "فريق المبيعات",
      candidateSnapshot: null,
    });
    const procurement = decision("procurement", "PROPOSED", {
      owner: "فريق المشتريات",
      candidateSnapshot: { priority: "P1" } as NonNullable<DecisionMemoryRecord["candidateSnapshot"]>,
    });

    expect(filterDailyDecisionRecords(
      [salesP1, salesP2, legacy, procurement],
      "ALL",
      "",
      NOW,
      { owner: "فريق المبيعات", priority: "P1" },
    ).map(item => item.decisionId)).toEqual(["sales-p1"]);

    expect(filterDailyDecisionRecords(
      [salesP1, salesP2, legacy, procurement],
      "ALL",
      "",
      NOW,
      { owner: "فريق المبيعات", priority: "UNRANKED" },
    ).map(item => item.decisionId)).toEqual(["legacy"]);
  });

  it("reports counts from the loaded records without implying full-history coverage", () => {
    const records = [
      decision("late", "ASSIGNED", {
        reviewDisposition: "SCHEDULED",
        reviewAt: "2026-11-28T09:00:00.000Z",
      }),
      decision("awaiting", "EXECUTED"),
      decision("done", "MEASURED"),
      decision("rejected", "REJECTED"),
    ];

    expect(summarizeDailyDecisionBoard(records, NOW)).toEqual({
      ALL: 4,
      OPEN: 2,
      OVERDUE: 1,
      DUE_24H: 0,
      DUE_7_DAYS: 0,
      UNSCHEDULED: 0,
      AWAITING_MEASUREMENT: 1,
      CLOSED: 2,
    });
  });
});
