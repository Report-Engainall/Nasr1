import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, invoke } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc,
    functions: { invoke },
  },
}));

import { runNaturalLanguageAssistantQuery } from "./natural-language-assistant-client";
import { planNaturalLanguageQuery } from "./natural-language-assistant";

describe("natural-language assistant local execution when model providers are unavailable", () => {
  beforeEach(() => {
    rpc.mockReset();
    invoke.mockReset();
    // The gateway represents all configured model providers as unavailable.
    // A supported local business query must not depend on this external path.
    invoke.mockRejectedValue(new Error("all configured AI model providers are unavailable"));
  });

  it("answers a supported purchase-order query through the tenant-scoped local RPC only", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const response = await runNaturalLanguageAssistantQuery("أوامر الشراء المفتوحة");

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("fetch_purchase_orders");
    expect(invoke).not.toHaveBeenCalled();
    expect(response).toMatchObject({
      status: "RESULT",
      plan: {
        status: "READY",
        intent: "PURCHASE_ORDERS_OPEN",
        sourceRpc: "fetch_purchase_orders",
      },
      result: {
        kind: "PURCHASE_ORDER",
        state: "EMPTY",
        sourceRpc: "fetch_purchase_orders",
        completePopulation: true,
        matchedQueryCount: 0,
      },
    });
  });

  it("fails closed on a local authorization denial instead of bypassing it through the AI gateway", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "42501", message: "permission denied" },
    });

    const response = await runNaturalLanguageAssistantQuery("أوامر الشراء المفتوحة");

    expect(response).toMatchObject({ status: "DENIED" });
    expect(rpc).toHaveBeenCalledWith("fetch_purchase_orders");
    expect(invoke).not.toHaveBeenCalled();
  });
});


describe("Arabic assistant query-window guardrails", () => {
  beforeEach(() => {
    // This describe is independent from the execution tests above; isolate shared hoisted RPC mocks.
    rpc.mockReset();
    invoke.mockReset();
    invoke.mockRejectedValue(new Error("all configured AI model providers are unavailable"));
  });

  it.each([
    ["رادار النمو آخر 30 يوماً", 30],
    ["رادار النمو آخر ٣٠ يوماً", 30],
    ["رادار النمو آخر ۶۰ يوماً", 60],
    ["رادار النمو آخر 60 يوماً", 60],
    ["رادار النمو آخر 90 يوماً", 90],
    ["رادار النمو آخر 180 يوماً", 180],
    ["رادار النمو آخر 365 يوماً", 365],
    ["رادار النمو آخر 3 أشهر", 90],
    ["رادار النمو آخر 6 أشهر", 180],
    ["رادار النمو آخر سنة", 365],
  ])("preserves the requested growth-radar window for %s", (question, periodDays) => {
    const plan = planNaturalLanguageQuery(question);
    expect(plan.status).toBe("READY");
    if (plan.status !== "READY") throw new Error("Expected an allow-listed growth-radar plan.");
    expect(plan.sourceRpc).toBe("get_customer_retention_aggregate");
    expect(plan.periodDays).toBe(periodDays);
  });

  it("keeps the documented 90-day default only when no period was requested", () => {
    const plan = planNaturalLanguageQuery("رادار النمو");
    expect(plan.status).toBe("READY");
    if (plan.status !== "READY") throw new Error("Expected a growth-radar plan.");
    expect(plan.periodDays).toBe(90);
  });

  it.each([
    "رادار النمو آخر 10 أيام",
    "رادار النمو هذا الربع",
  ])("does not silently coerce an unsupported growth window: %s", (question) => {
    expect(planNaturalLanguageQuery(question).status).toBe("UNSUPPORTED");
  });

  it.each([
    "جودة المهام آخر 30 يوماً",
    "جودة المهام آخر ٣٠ يوماً",
    "جودة المهام آخر أسبوع",
  ])("refuses a historical task-quality question instead of returning the latest snapshot: %s", (question) => {
    expect(planNaturalLanguageQuery(question).status).toBe("UNSUPPORTED");
  });

  it("does not call a data RPC or an AI provider for a historical task-quality request", async () => {
    const response = await runNaturalLanguageAssistantQuery("جودة المهام آخر 30 يوماً");
    expect(response.status).toBe("UNSUPPORTED");
    expect(rpc).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("keeps the current task-quality snapshot query supported", () => {
    const plan = planNaturalLanguageQuery("جودة المهام");
    expect(plan.status).toBe("READY");
    if (plan.status !== "READY") throw new Error("Expected a current task-quality plan.");
    expect(plan.sourceRpc).toBe("fetch_operational_task_quality_metrics");
  });
});
