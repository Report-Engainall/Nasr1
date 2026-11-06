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
});
