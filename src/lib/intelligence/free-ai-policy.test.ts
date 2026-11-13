import { describe, expect, it } from "vitest";
import {
  chooseFreeAiRoute,
  summarizeAiOperations,
  type AiOpsEvent,
  type FreeProviderQuota,
  type FreeQuotaEvidence,
} from "./free-ai-policy";

const AS_OF = "2026-11-09T12:30:00.000Z";
const VERIFIED_AT = "2026-11-09T12:00:00.000Z";
const MODEL = "gemini-2.5-flash";

function sanitize(question: unknown) {
  return typeof question === "string" && question.trim()
    ? { ok: true as const, question: question.trim() }
    : { ok: false as const };
}
function provider(overrides: Partial<FreeProviderQuota> = {}): FreeProviderQuota {
  return {
    provider: "gemini", model: MODEL, quotaStatus: "AVAILABLE", quotaRemaining: 100,
    freeTierConfirmed: true, zeroCostConfirmed: true, billingSafety: "NO_PAYMENT_METHOD", privacyReviewed: true,
    privacyAllowsQuestionOnly: true, inputRate: 0, outputRate: 0,
    verifiedAt: VERIFIED_AT, sourceEvidenceId: "quota-proof-1", cooldownUntil: null,
    ...overrides,
  };
}
function evidence(overrides: Partial<FreeQuotaEvidence> = {}): FreeQuotaEvidence {
  return {
    id: "quota-proof-1", status: "VERIFIED", asOf: VERIFIED_AT,
    completeness: "COMPLETE", quality: "ACCEPTABLE", billingSafety: "NO_PAYMENT_METHOD", ...overrides,
  };
}
function route(
  providers: FreeProviderQuota[],
  quotaEvidence: FreeQuotaEvidence[],
  overrides: Partial<Parameters<typeof chooseFreeAiRoute>[0]> = {},
) {
  return chooseFreeAiRoute({
    question: "كيف أرتب المخزون دون إرسال بيانات العملاء؟",
    sanitize, asOf: AS_OF, providers, quotaEvidence, ruleEngineAvailable: true, ...overrides,
  });
}

describe("chooseFreeAiRoute", () => {
  it("selects only a fresh, verified, zero-cost and privacy-approved free model", () => {
    expect(route([provider()], [evidence()])).toMatchObject({
      mode: "MODEL", provider: "gemini", model: MODEL,
      reason: "FREE_PROVIDER_AVAILABLE", paidSpendLimit: 0,
    });
  });
  it("fails closed when the evidence registry is empty", () => {
    expect(route([], [])).toMatchObject({
      mode: "RULE_BASED", provider: null, model: null,
      reason: "ALL_FREE_QUOTAS_UNAVAILABLE", attemptedProviders: [], eligibleProviders: [], paidSpendLimit: 0,
    });
  });
  it("reports unavailable when no deterministic engine is available", () => {
    expect(route([], [], { ruleEngineAvailable: false })).toMatchObject({
      mode: "MODEL_UNAVAILABLE", reason: "NO_RULE_ENGINE", paidSpendLimit: 0,
    });
  });
  it("rejects any positive input or output price", () => {
    for (const changes of [{ inputRate: 0.001 }, { outputRate: 0.001 }, { zeroCostConfirmed: false }]) {
      const decision = route([provider(changes)], [evidence()]);
      expect(decision.mode).toBe("RULE_BASED");
      expect(decision.attemptedProviders[0]?.reason).toBe("COST_NOT_ZERO");
    }
  });
  it("rejects providers requiring payment details or permitting automatic billing",()=>{
    for(const billingSafety of ["PAYMENT_METHOD_REQUIRED","AUTO_BILLING_POSSIBLE","UNKNOWN"] as const){
      const decision=route([provider({billingSafety})],[evidence({billingSafety})]);
      expect(decision.mode).toBe("RULE_BASED");expect(decision.eligibleProviders).toEqual([]);
      expect(decision.attemptedProviders[0]?.reason).toBe("PAYMENT_METHOD_REQUIRED_OR_BILLING_UNSAFE");
    }
    const mismatch=route([provider()],[evidence({billingSafety:"AUTO_BILLING_POSSIBLE"})]);
    expect(mismatch.eligibleProviders).toEqual([]);
    expect(mismatch.attemptedProviders[0]?.reason).toBe("FREE_QUOTA_EVIDENCE_NOT_VERIFIED");
  });
  it("returns every eligible model in configured primary-to-fallback order",()=>{
    const fallback=provider({provider:"openai_compatible",model:"free-compatible-model",sourceEvidenceId:"quota-proof-2"});
    const decision=route([provider(),fallback],[evidence(),evidence({id:"quota-proof-2"})]);
    expect(decision).toMatchObject({mode:"MODEL",provider:"gemini",model:MODEL,eligibleProviders:[
      {provider:"gemini",model:MODEL},{provider:"openai_compatible",model:"free-compatible-model"}]});
    expect(decision.attemptedProviders).toHaveLength(2);
  });
  it("skips an exhausted primary and selects the next eligible free model",()=>{
    const fallback=provider({provider:"openai_compatible",model:"free-compatible-model",sourceEvidenceId:"quota-proof-2"});
    const decision=route([provider({quotaStatus:"EXHAUSTED"}),fallback],[evidence(),evidence({id:"quota-proof-2"})]);
    expect(decision).toMatchObject({mode:"MODEL",provider:"openai_compatible",model:"free-compatible-model",eligibleProviders:[{provider:"openai_compatible",model:"free-compatible-model"}]});
    expect(decision.attemptedProviders.map(item=>item.reason)).toEqual(["QUOTA_EXHAUSTED","ELIGIBLE"]);
  });
  it("requires explicit free-tier and question-only privacy approval", () => {
    const noFree = route([provider({ freeTierConfirmed: false })], [evidence()]);
    expect(noFree.attemptedProviders[0]?.reason).toBe("FREE_TIER_NOT_CONFIRMED");
    const noPrivacy = route([provider({ privacyReviewed: false })], [evidence()]);
    expect(noPrivacy.attemptedProviders[0]?.reason).toBe("PRIVACY_NOT_APPROVED");
    const broaderPrivacy = route([provider({ privacyAllowsQuestionOnly: false })], [evidence()]);
    expect(broaderPrivacy.attemptedProviders[0]?.reason).toBe("PRIVACY_NOT_APPROVED");
  });
  it("rejects unknown, disabled, unconfigured and exhausted quota states", () => {
    for (const quotaStatus of ["UNKNOWN", "DISABLED", "NOT_CONFIGURED", "EXHAUSTED"] as const) {
      const decision = route([provider({ quotaStatus })], [evidence()]);
      expect(decision.mode).toBe("RULE_BASED");
      expect(decision.attemptedProviders[0]?.reason).toBe("QUOTA_" + quotaStatus);
    }
  });
  it("requires a positive, known integer quota remainder", () => {
    for (const quotaRemaining of [null, 0, -1, 1.5, Number.NaN]) {
      const decision = route([provider({ quotaRemaining })], [evidence()]);
      expect(decision.attemptedProviders[0]?.reason).toBe("QUOTA_REMAINING_UNKNOWN_OR_EMPTY");
    }
  });
  it("rejects stale and future verification timestamps", () => {
    const staleAt = "2026-11-08T12:29:59.999Z";
    const stale = route([provider({ verifiedAt: staleAt })], [evidence({ asOf: staleAt })]);
    expect(stale.attemptedProviders[0]?.reason).toBe("PROVIDER_VERIFICATION_STALE");
    const futureAt = "2026-11-09T12:30:00.001Z";
    const future = route([provider({ verifiedAt: futureAt })], [evidence({ asOf: futureAt })]);
    expect(future.attemptedProviders[0]?.reason).toBe("PROVIDER_VERIFICATION_STALE");
  });
  it("requires unique, complete, acceptable and matching quota evidence", () => {
    const invalidEvidence = [
      evidence({ status: "NEEDS_REVIEW" }),
      evidence({ status: "UNVERIFIED" }),
      evidence({ completeness: "PARTIAL" }),
      evidence({ quality: "WARNINGS" }),
      evidence({ asOf: "2026-11-09T11:59:00.000Z" }),
    ];
    for (const proof of invalidEvidence) {
      const decision = route([provider()], [proof]);
      expect(decision.attemptedProviders[0]?.reason).toBe("FREE_QUOTA_EVIDENCE_NOT_VERIFIED");
    }
    const duplicateProvider = route([provider(), provider()], [evidence()]);
    expect(duplicateProvider.attemptedProviders[0]?.reason).toBe("DUPLICATE_PROVIDER_QUOTA_RECORD");
    const duplicateProof = route([provider()], [evidence(), evidence()]);
    expect(duplicateProof.attemptedProviders[0]?.reason).toBe("QUOTA_EVIDENCE_AMBIGUOUS");
  });
  it("rejects active and malformed cooldown windows", () => {
    const active = route([provider({ cooldownUntil: "2026-11-09T12:31:00.000Z" })], [evidence()]);
    expect(active.attemptedProviders[0]?.reason).toBe("PROVIDER_COOLDOWN");
    const malformed = route([provider({ cooldownUntil: "not-a-date" })], [evidence()]);
    expect(malformed.attemptedProviders[0]?.reason).toBe("PROVIDER_COOLDOWN_INVALID");
  });
  it("fails closed on sanitizer throws, rejection and malformed results", () => {
    const thrown = route([provider()], [evidence()], { sanitize: () => { throw new Error("sanitize"); } });
    expect(thrown).toMatchObject({ mode: "RULE_BASED", reason: "UNSAFE_QUESTION", question: null });
    const rejected = route([provider()], [evidence()], { sanitize: () => ({ ok: false }) });
    expect(rejected.reason).toBe("UNSAFE_QUESTION");
    const malformed = route([provider()], [evidence()], { sanitize: () => ({ ok: true, question: 42 } as never) });
    expect(malformed.reason).toBe("UNSAFE_QUESTION");
    const blank = route([provider()], [evidence()], { sanitize: () => ({ ok: true, question: "  " }) });
    expect(blank.reason).toBe("UNSAFE_QUESTION");
  });
  it("rejects overlong sanitized questions and invalid decision timestamps", () => {
    const overlong = route([provider()], [evidence()], {
      sanitize: () => ({ ok: true, question: "x".repeat(1201) }),
    });
    expect(overlong).toMatchObject({ mode: "RULE_BASED", reason: "UNSAFE_QUESTION", question: null });
    expect(() => route([], [], { asOf: "invalid" })).toThrow("asOf must be valid");
  });
});

describe("summarizeAiOperations", () => {
  const timestamp = "2026-11-09T12:00:00.000Z";
  function event(overrides: Partial<AiOpsEvent> = {}): AiOpsEvent {
    return {
      id: "event-1", provider: "gemini", mode: "MODEL", status: "SUCCEEDED",
      reasonCode: "completed", occurredAt: timestamp, elapsedMs: 250, ...overrides,
    };
  }
  it("returns bounded aggregate telemetry and never copies prompts, payloads or secrets", () => {
    const sensitive = {
      ...event(), prompt: "private customer prompt", secret: "do-not-return",
      providerPayload: { customer: "private" },
    };
    const summary = summarizeAiOperations("2026-11-09T12:30:00.000Z", [
      sensitive,
      event({ id: "event-2", provider: "openai_compatible", status: "FAILED", reasonCode: "provider_timeout" }),
      event({ id: "event-3", provider: null, mode: "RULE_BASED", status: "FALLBACK", reasonCode: "all_free_quotas_unavailable" }),
    ]);
    expect(summary).toMatchObject({
      total: 3, successful: 1, failed: 1, fallbacks: 1,
      containsPrompts: false, containsSecrets: false, errorCodes: ["provider_timeout"],
    });
    expect(JSON.stringify(summary)).not.toContain("private customer prompt");
    expect(JSON.stringify(summary)).not.toContain("do-not-return");
  });
  it("rejects duplicate IDs, future events, unsafe reason codes and invalid elapsed time", () => {
    expect(() => summarizeAiOperations("2026-11-09T12:30:00.000Z", [event(), event()])).toThrow("ai_ops_event_invalid");
    expect(() => summarizeAiOperations("2026-11-09T12:30:00.000Z", [
      event({ occurredAt: "2026-11-09T12:30:00.001Z" }),
    ])).toThrow("ai_ops_event_invalid");
    expect(() => summarizeAiOperations("2026-11-09T12:30:00.000Z", [
      event({ reasonCode: "Provider Timeout" }),
    ])).toThrow("ai_ops_event_invalid");
    expect(() => summarizeAiOperations("2026-11-09T12:30:00.000Z", [
      event({ elapsedMs: 600001 }),
    ])).toThrow("ai_ops_event_invalid");
  });
  it("rejects oversized event populations and invalid summary timestamps", () => {
    expect(() => summarizeAiOperations("2026-11-09T12:30:00.000Z", new Array(5001).fill(event())))
      .toThrow("ai_ops_event_population_invalid");
    expect(() => summarizeAiOperations("invalid", [])).toThrow("asOf must be valid");
  });
});
