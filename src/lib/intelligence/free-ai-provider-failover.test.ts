import { describe, expect, it } from "vitest";
import { hasHardZeroCostRates, runProviderCandidates, type AiProviderCandidate } from "../../../supabase/functions/ai-gateway/logic.ts";
const primary:AiProviderCandidate={provider:"gemini",model:"free-model-a",baseUrl:"https://generativelanguage.googleapis.com",key:"test-only-not-a-real-key",rates:{inputPerThousand:0,outputPerThousand:0},fallback:false};
const fallback:AiProviderCandidate={provider:"openai_compatible",model:"free-model-b",baseUrl:"https://openrouter.ai/api/v1",key:"test-only-not-a-real-key",rates:{inputPerThousand:0,outputPerThousand:0},fallback:true};
const question="سؤال عام لا يحتوي على بيانات متجر خاصة";
describe("hard zero-cost provider execution",()=>{
 it("accepts only exactly zero rates",()=>{
  expect(hasHardZeroCostRates({inputPerThousand:0,outputPerThousand:0})).toBe(true);
  expect(hasHardZeroCostRates({inputPerThousand:0.000001,outputPerThousand:0})).toBe(false);
  expect(hasHardZeroCostRates({inputPerThousand:0,outputPerThousand:0.000001})).toBe(false);
  expect(hasHardZeroCostRates({inputPerThousand:-1,outputPerThousand:0})).toBe(false);
  expect(hasHardZeroCostRates({inputPerThousand:Number.NaN,outputPerThousand:0})).toBe(false);
  expect(hasHardZeroCostRates({inputPerThousand:0,outputPerThousand:Number.POSITIVE_INFINITY})).toBe(false);
 });
 it("rejects paid candidates before transport",async()=>{
  let transportCalls=0;
  await expect(runProviderCandidates([{...primary,rates:{inputPerThousand:0.01,outputPerThousand:0}}],question,async()=>{transportCalls++;return {text:"must not egress",usage:{inputTokens:1,outputTokens:1}};},1000)).rejects.toThrow("paid_provider_candidate_rejected");
  expect(transportCalls).toBe(0);
 });
 it("tries the next eligible free provider after the first one fails",async()=>{
  const order:string[]=[];
  const result=await runProviderCandidates([primary,fallback],question,async candidate=>{
   order.push(candidate.model);if(candidate.model===primary.model)throw new Error("provider_http_429");
   return {text:"free fallback response",usage:{inputTokens:11,outputTokens:12}};
  },1000);
  expect(order).toEqual([primary.model,fallback.model]);expect(result.used?.model).toBe(fallback.model);
  expect(result.result?.text).toBe("free fallback response");expect(result.attempts).toHaveLength(2);
  expect(result.attempts[0]).toMatchObject({status:"failed",observedInputTokens:null,observedOutputTokens:null,estimatedCost:null,errorCode:"provider_http_429"});
  expect(result.attempts[1]).toMatchObject({status:"succeeded",observedInputTokens:11,observedOutputTokens:12,estimatedCost:0});
 });
 it("does not fabricate usage or cost when every provider fails",async()=>{
  const result=await runProviderCandidates([primary,fallback],question,async candidate=>{throw new Error(candidate.provider==="gemini"?"provider_http_429":"provider_timeout");},1000);
  expect(result.result).toBeNull();expect(result.used).toBeNull();
  expect(result.attempts.map(a=>a.status)).toEqual(["failed","failed"]);
  expect(result.attempts.every(a=>a.observedInputTokens===null&&a.observedOutputTokens===null&&a.estimatedCost===null)).toBe(true);
 });
});