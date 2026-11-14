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
