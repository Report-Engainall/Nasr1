import { describe, expect, it } from "vitest";
import { planNaturalLanguageQuery, resolveCustomerServiceIntent } from "./natural-language-assistant";

describe("customer service natural-language intents", () => {
  it("routes open customer service case questions to the aggregate-only source", () => {
    expect(planNaturalLanguageQuery("ما ملخص حالات خدمة العملاء المفتوحة؟")).toMatchObject({
      status: "READY",
      intent: "CUSTOMER_SERVICE_OVERVIEW",
      sourceRpc: "get_customer_service_work_queue_summary",
    });
  });

  it("distinguishes first-response SLA breaches from resolution SLA breaches", () => {
    expect(planNaturalLanguageQuery("كم حالة تأخرت أول استجابة في خدمة العملاء؟")).toMatchObject({
      status: "READY",
      intent: "CUSTOMER_SERVICE_RESPONSE_OVERDUE",
    });
    expect(planNaturalLanguageQuery("كم حالة تجاوزت موعد الحل في خدمة العملاء؟")).toMatchObject({
      status: "READY",
      intent: "CUSTOMER_SERVICE_RESOLUTION_OVERDUE",
    });
  });

  it("recognizes unassigned cases even when the service phrase appears before the status", () => {
    expect(planNaturalLanguageQuery("حالات خدمة العملاء غير المسندة")).toMatchObject({
      status: "READY",
      intent: "CUSTOMER_SERVICE_UNASSIGNED",
    });
  });

  it("does not pretend a current queue snapshot answers historical period questions", () => {
    expect(planNaturalLanguageQuery("حالات خدمة العملاء خلال الأسبوع الماضي")).toMatchObject({
      status: "UNSUPPORTED",
    });
  });

  it("supports common service desk synonyms without generating a write intent", () => {
    expect(planNaturalLanguageQuery("ملخص شكاوى العملاء")).toMatchObject({
      status: "READY",
      intent: "CUSTOMER_SERVICE_OVERVIEW",
      sourceRpc: "get_customer_service_work_queue_summary",
    });
    expect(planNaturalLanguageQuery("حالات العملاء غير المسندة")).toMatchObject({
      status: "READY",
      intent: "CUSTOMER_SERVICE_UNASSIGNED",
    });
  });

  it("keeps overlapping response and resolution breaches as separate counts", () => {
    const snapshot = {
      asOf: "2026-11-06T00:00:00.000Z",
      scope: "ALL_ACTIVE_CASES_IN_CURRENT_ORGANIZATION" as const,
      completePopulation: true as const,
      summary: {
        openCount: 8,
        responseOverdueCount: 3,
        resolutionOverdueCount: 4,
        unassignedCount: 2,
        urgentCount: 1,
        highCount: 3,
      },
    };
    const result = resolveCustomerServiceIntent(
      "CUSTOMER_SERVICE_OVERVIEW",
      snapshot,
      "2026-11-06T00:00:01.000Z",
    );
    expect(result).toMatchObject({
      kind: "CUSTOMER_SERVICE",
      state: "READY",
      primaryCount: 8,
      summary: {
        responseOverdueCount: 3,
        resolutionOverdueCount: 4,
      },
    });
    expect(result.answer).not.toContain("7 حالة متأخرة");
  });

describe("deferred decision assistant intent", () => {
  it("routes deferred-decision questions to the authorized decision read RPC", () => {
    expect(planNaturalLanguageQuery("ما القرارات المؤجلة؟")).toMatchObject({
      status: "READY",
      intent: "DECISIONS_DEFERRED",
      sourceRpc: "fetch_decision_outcomes",
    });
    expect(planNaturalLanguageQuery("اعرض القرارات التي تم تأجيلها")).toMatchObject({
      status: "READY",
      intent: "DECISIONS_DEFERRED",
      sourceRpc: "fetch_decision_outcomes",
    });
  });

  it("does not present a current deferred-decision snapshot as historical data", () => {
    expect(planNaturalLanguageQuery("القرارات المؤجلة خلال الشهر الماضي")).toMatchObject({
      status: "UNSUPPORTED",
    });
  });
});
});

describe("task quality assistant scope and Arabic synonyms", () => {
  it("routes repeated causes, recommendation rejection and false-alarm questions to reviewed quality evidence", () => {
    for (const question of [
      "ما أكثر الأسباب المتكررة؟",
      "ما أسباب رفض التوصيات؟",
      "ما أسباب تأجيل التوصيات؟",
      "ما نسبة الإنذارات الكاذبة؟",
      "ما دقة التنبيهات الصحيحة؟",
    ]) {
      expect(planNaturalLanguageQuery(question)).toMatchObject({
        status: "READY",
        intent: "TASK_QUALITY_OVERVIEW",
        sourceRpc: "fetch_operational_task_quality_metrics",
      });
    }
  });

  it("does not misrepresent the latest-review aggregate as a historical period report", () => {
    for (const question of [
      "ما نسبة الإنذارات الكاذبة خلال الأسبوع الماضي؟",
      "ما أسباب رفض التوصيات في آخر 30 يوم؟",
      "كم عدد التنبيهات الخاطئة اليوم؟",
    ]) {
      expect(planNaturalLanguageQuery(question)).toMatchObject({ status: "UNSUPPORTED" });
    }
  });

  it("does not claim role or department quality breakdowns absent from the source DTO", () => {
    for (const question of [
      "ما جودة التوصيات في المخزن؟",
      "ما أسباب رفض التوصيات حسب الدور؟",
      "ما معدل الإنذارات الكاذبة لدى المبيعات؟",
    ]) {
      expect(planNaturalLanguageQuery(question)).toMatchObject({ status: "UNSUPPORTED" });
    }
  });
});

describe("decision memory assistant intent", () => {
  it("routes Arabic decision-memory and learning questions through the authorized decision source", () => {
    for (const question of [
      "اعرض دفتر ذاكرة القرارات",
      "التعلم من نتائج القرارات",
      "ما الدروس المستفادة من القرارات؟",
      "مقترحات مراجعة القواعد من نتائج القرارات",
    ]) {
      expect(planNaturalLanguageQuery(question)).toMatchObject({
        status: "READY",
        intent: "DECISION_MEMORY_OVERVIEW",
        sourceRpc: "fetch_decision_outcomes",
      });
    }
  });

  it("does not present the current first page as a historical decision-memory report", () => {
    for (const question of [
      "ذاكرة القرارات خلال الشهر الماضي",
      "التعلم من نتائج القرارات في آخر 30 يوم",
    ]) {
      expect(planNaturalLanguageQuery(question)).toMatchObject({ status: "UNSUPPORTED" });
    }
  });
});

describe("shift operations assistant intent", () => {
  it("requires an explicit valid organization business date before reading the shift packet", () => {
    expect(planNaturalLanguageQuery("اعرض مركز الوردية")).toMatchObject({
      status: "CLARIFICATION",
    });
    expect(planNaturalLanguageQuery("جاهزية إقفال الوردية اليوم")).toMatchObject({
      status: "CLARIFICATION",
    });
    expect(planNaturalLanguageQuery("مركز الوردية بتاريخ 2026-02-31")).toMatchObject({
      status: "CLARIFICATION",
    });
  });

  it("routes common normalized Arabic shift-close phrases when a business date is explicit", () => {
    expect(planNaturalLanguageQuery("جاهزية إقفال الوردية بتاريخ 2026-11-06")).toMatchObject({
      status: "READY",
      intent: "SHIFT_OPERATIONS_OVERVIEW",
      sourceRpc: "fetch_operational_shift_workspace",
      businessDate: "2026-11-06",
    });
  });

  it("routes explicit business-date shift questions to the existing authorized workspace reader", () => {
    expect(planNaturalLanguageQuery("اعرض مركز الوردية بتاريخ 2026-11-06")).toMatchObject({
      status: "READY",
      intent: "SHIFT_OPERATIONS_OVERVIEW",
      sourceRpc: "fetch_operational_shift_workspace",
      businessDate: "2026-11-06",
    });
  });

  it("does not turn shift-opening, handover or cash-count commands into read-only success", () => {
    for (const command of [
      "ابدأ الوردية بتاريخ 2026-11-06",
      "استلم تسليم الوردية",
      "سجل عد الصندوق",
    ]) {
      expect(planNaturalLanguageQuery(command)).toMatchObject({ status: "UNSUPPORTED" });
    }
  });

  it("does not invent a business date from a relative user-local expression", () => {
    expect(planNaturalLanguageQuery("مركز إقفال اليوم")).toMatchObject({
      status: "CLARIFICATION",
    });
  });
});
