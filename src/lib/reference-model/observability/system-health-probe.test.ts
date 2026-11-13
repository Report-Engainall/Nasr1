import { describe, expect, it } from "vitest";
import { projectAiGatewayBudgetProbe } from "./system-health-probe";
import type { AiGatewayBudgetResult } from "@/lib/intelligence/ai-gateway-operations-client";

const attemptedAt = "2026-11-13T04:00:00.000Z";

describe("AI gateway budget read probe", () => {
  it("reports only a readable budget RPC and does not infer provider or system health", () => {
    const result = {
      ok: true,
      status: "READY",
      readAt: attemptedAt,
      data: {},
    } as unknown as AiGatewayBudgetResult;
    expect(projectAiGatewayBudgetProbe(result, attemptedAt)).toMatchObject({
      component: "AI_GATEWAY_BUDGET_READ",
      source: "public.get_ai_gateway_budget",
      status: "READABLE",
      providerConnectivity: "UNKNOWN",
      systemHealth: "UNKNOWN",
    });
  });

  it("keeps authorization denial distinct from service availability", () => {
    const result: AiGatewayBudgetResult = {
      ok: false,
      status: "DENIED",
      message: "not authorized",
    };
    expect(projectAiGatewayBudgetProbe(result, attemptedAt)).toMatchObject({
      status: "DENIED",
      providerConnectivity: "UNKNOWN",
      systemHealth: "UNKNOWN",
    });
  });

  it("does not accept malformed success timestamps as evidence", () => {
    const result = {
      ok: true,
      status: "READY",
      readAt: "not-a-date",
      data: {},
    } as unknown as AiGatewayBudgetResult;
    expect(projectAiGatewayBudgetProbe(result, attemptedAt)).toMatchObject({
      status: "INVALID",
      providerConnectivity: "UNKNOWN",
      systemHealth: "UNKNOWN",
    });
  });

  it("maps an unavailable source to unavailable without inventing a healthy state", () => {
    const result: AiGatewayBudgetResult = {
      ok: false,
      status: "UNAVAILABLE",
      message: "unavailable",
    };
    expect(projectAiGatewayBudgetProbe(result, attemptedAt)).toMatchObject({
      status: "UNAVAILABLE",
      providerConnectivity: "UNKNOWN",
      systemHealth: "UNKNOWN",
    });
  });
});
