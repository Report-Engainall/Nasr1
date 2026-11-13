import type { AiGatewayBudgetResult } from "@/lib/intelligence/ai-gateway-operations-client";

export type AiGatewayBudgetProbeStatus = "READABLE" | "DENIED" | "UNAVAILABLE" | "INVALID";

export interface AiGatewayBudgetProbe {
  component: "AI_GATEWAY_BUDGET_READ";
  source: "public.get_ai_gateway_budget";
  status: AiGatewayBudgetProbeStatus;
  attemptedAt: string;
  detail: string;
  providerConnectivity: "UNKNOWN";
  systemHealth: "UNKNOWN";
}

function validTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

/**
 * Maps the existing admin-only budget RPC into a narrow probe result.
 * A successful aggregate read does not prove that an external AI provider is connected.
 */
export function projectAiGatewayBudgetProbe(
  result: AiGatewayBudgetResult,
  attemptedAt: string,
): AiGatewayBudgetProbe {
  const safeAttemptedAt = validTimestamp(attemptedAt) ? attemptedAt : new Date(0).toISOString();

  if (result.ok) {
    if (result.status !== "READY" || !validTimestamp(result.readAt)) {
      return {
        component: "AI_GATEWAY_BUDGET_READ",
        source: "public.get_ai_gateway_budget",
        status: "INVALID",
        attemptedAt: safeAttemptedAt,
        detail: "استجابة ملخص الميزانية لا تحتوي وقت قراءة صالحاً؛ لم تُقبل كدليل.",
        providerConnectivity: "UNKNOWN",
        systemHealth: "UNKNOWN",
      };
    }
    return {
      component: "AI_GATEWAY_BUDGET_READ",
      source: "public.get_ai_gateway_budget",
      status: "READABLE",
      attemptedAt: safeAttemptedAt,
      detail: "استجاب عقد ملخص الميزانية الإداري. هذا يثبت قابلية قراءة الملخص فقط، ولا يثبت اتصال المزود أو نجاح طلب نموذج.",
      providerConnectivity: "UNKNOWN",
      systemHealth: "UNKNOWN",
    };
  }

  const status: AiGatewayBudgetProbeStatus =
    result.status === "DENIED" ? "DENIED" :
    result.status === "ERROR" ? "INVALID" :
    "UNAVAILABLE";
  const detail = status === "DENIED"
    ? "المصدر محجوب وفق صلاحية الجلسة الحالية؛ لا يُفسر الرفض على أنه تعطل للخدمة."
    : status === "INVALID"
      ? "استجابة مصدر الميزانية لم تطابق عقد القراءة؛ لم تُقبل كدليل صحة."
      : "تعذر تأكيد قراءة مصدر ملخص الميزانية.";

  return {
    component: "AI_GATEWAY_BUDGET_READ",
    source: "public.get_ai_gateway_budget",
    status,
    attemptedAt: safeAttemptedAt,
    detail,
    providerConnectivity: "UNKNOWN",
    systemHealth: "UNKNOWN",
  };
}
