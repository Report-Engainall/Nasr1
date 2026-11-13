import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));

import { listAiUsageAudit } from "./ai-usage-audit-client";

const row = {
  id: "00000000-0000-4000-8000-000000000001",
  request_id: "request-audit-001",
  actor_profile_id: "00000000-0000-4000-8000-000000000010",
  model_name: "openai_compatible/example-model",
  estimated_cost: "0.004200",
  execution_time_ms: 840,
  fallback_used: false,
  result_status: "completed",
  usage_measurement_status: "measured",
  observed_input_tokens: 120,
  observed_output_tokens: 48,
  provider_attempt_count: 1,
  provider_attempts: [{
    provider: "openai_compatible",
    model: "example-model",
    fallback: false,
    status: "succeeded",
    elapsed_ms: 840,
    observed_input_tokens: 120,
    observed_output_tokens: 48,
    estimated_cost: "0.004200",
    error_code: null,
    // The parser ignores any unexpected data defensively; the SQL RPC is still
    // required to return only its whitelist.
    raw_prompt: "must never be rendered",
  }],
  outcome_reason: null,
  created_at: "2026-11-14T01:00:00.000Z",
  raw_response: "must never be rendered",
};

afterEach(() => vi.clearAllMocks());
beforeEach(() => mocks.rpc.mockResolvedValue({
  data: { items: [row], total: 1, limit: 25, offset: 0 },
  error: null,
}));

describe("listAiUsageAudit", () => {
  it("maps only the typed telemetry DTO and does not keep unexpected prompt or response fields", async () => {
    const page = await listAiUsageAudit({ status: "completed", limit: 25, offset: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("list_ai_gateway_audit", {
      p_result_status: "completed",
      p_limit: 25,
      p_offset: 0,
    });
    expect(page.items[0]).toMatchObject({
      requestId: "request-audit-001",
      measurementStatus: "measured",
      observedInputTokens: 120,
      observedOutputTokens: 48,
      providerAttemptCount: 1,
    });
    expect(page.items[0]).not.toHaveProperty("rawResponse");
    expect(page.items[0].providerAttempts[0]).not.toHaveProperty("rawPrompt");
    expect(Object.keys(page.items[0].providerAttempts[0]).sort()).toEqual([
      "elapsedMs","errorCode","estimatedCost","fallback","model","observedInputTokens",
      "observedOutputTokens","provider","status",
    ]);
  });

  it("refuses unsupported query bounds before making an RPC call", async () => {
    mocks.rpc.mockClear();
    await expect(listAiUsageAudit({ limit: 101 })).rejects.toThrow("ai_audit_query_invalid");
    expect(mocks.rpc).toHaveBeenCalledTimes(0);
  });

  it("fails closed for a malformed provider attempt", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        items: [{ ...row, provider_attempts: [{ ...row.provider_attempts[0], error_code: "raw error with secret" }] }],
        total: 1,
        limit: 25,
        offset: 0,
      },
      error: null,
    });
    await expect(listAiUsageAudit()).rejects.toThrow("ai_audit_response_invalid");
  });

  it("keeps unmeasured tokens unknown instead of deriving zero", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        items: [{
          ...row,
          usage_measurement_status: "unknown",
          observed_input_tokens: null,
          observed_output_tokens: null,
          provider_attempt_count: 1,
          provider_attempts: [{
            provider: "openai_compatible",
            model: "example-model",
            fallback: false,
            status: "failed",
            elapsed_ms: 500,
            observed_input_tokens: null,
            observed_output_tokens: null,
            estimated_cost: null,
            error_code: "provider_timeout",
          }],
        }],
        total: 1,
        limit: 50,
        offset: 0,
      },
      error: null,
    });
    const page = await listAiUsageAudit();
    expect(page.items[0].observedInputTokens).toBeNull();
    expect(page.items[0].observedOutputTokens).toBeNull();
    expect(page.items[0].providerAttempts[0].estimatedCost).toBeNull();
  });

  it("maps backend authorization denial without leaking database details", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: "42501", message: "tenant scope" } });
    await expect(listAiUsageAudit()).rejects.toThrow("لا تملك صلاحية عرض تدقيق محاولات الذكاء");
  });
});
