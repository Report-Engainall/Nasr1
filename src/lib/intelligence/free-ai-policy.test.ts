import {describe,expect,it} from "vitest";
import {chooseFreeAiRoute,summarizeAiOperations} from "./free-ai-policy";
const at="2026-10-30T07:00:00Z";
const provider=(overrides:Record<string,unknown>={})=>({provider:"gemini" as const,model:"free-tier",quotaStatus:"AVAILABLE" as const,quotaRemaining:100,freeTierConfirmed:true,zeroCostConfirmed:true,privacyReviewed:true,
 privacyAllowsQuestionOnly:true,inputRate:0,outputRate:0,verifiedAt:at,sourceEvidenceId:"quota-evidence",cooldownUntil:null,...overrides});
const sanitize=(q:unknown)=>typeof q==="string"&&q.includes("@")?{ok:false}:{ok:true,question:String(q)};
const quotaEvidence=[{id:"quota-evidence",status:"VERIFIED" as const,asOf:at,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const}];
const invalidProviderOverrides = [
 { quotaStatus: "UNKNOWN" },
 { quotaRemaining: null },
 { inputRate: null },
 { privacyAllowsQuestionOnly: false },
 { verifiedAt: "2026-10-28T00:00:00Z" },
];
const route=(providers:ReturnType<typeof provider>[],ruleEngineAvailable=true)=>chooseFreeAiRoute({question:"explain public feature",sanitize,asOf:at,providers,quotaEvidence,ruleEngineAvailable});
describe("free quota AI router",()=>{
 it("selects a provider only with confirmed free quota, zero rate and privacy approval",()=>expect(route([provider()])).toMatchObject({mode:"MODEL",provider:"gemini",paidSpendLimit:0}));
 it.each(invalidProviderOverrides)(
  "falls back to deterministic rules when quota/cost/privacy evidence is invalid",
  (overrides) => expect(route([provider(overrides)]).mode).toBe("RULE_BASED"),
 );
 it("returns MODEL_UNAVAILABLE when no free provider and no rule engine exist",()=>expect(route([],false)).toMatchObject({mode:"MODEL_UNAVAILABLE",paidSpendLimit:0}));
 it("requires source-backed verified quota evidence",()=>expect(chooseFreeAiRoute({question:"public question",sanitize,asOf:at,providers:[provider()],quotaEvidence:[],ruleEngineAvailable:true})).toMatchObject({mode:"RULE_BASED",paidSpendLimit:0}));
 it("blocks unsafe questions before provider selection",()=>expect(chooseFreeAiRoute({question:"user@example.com",sanitize,asOf:at,providers:[provider()],quotaEvidence,ruleEngineAvailable:true})).toMatchObject({mode:"RULE_BASED",reason:"UNSAFE_QUESTION",question:null}));
 it("produces prompt-free and secret-free operations telemetry",()=>expect(summarizeAiOperations(at,[{id:"1",provider:"gemini",mode:"MODEL",status:"FAILED",reasonCode:"provider_timeout",occurredAt:at,elapsedMs:200}])).toMatchObject({failed:1,containsPrompts:false,containsSecrets:false,errorCodes:["provider_timeout"]}));

 it("rejects invalid cooldown timestamps instead of failing open",()=>expect(route([provider({cooldownUntil:"not-a-date"})])).toMatchObject({mode:"RULE_BASED",attemptedProviders:[{reason:"PROVIDER_COOLDOWN_INVALID"}]}));
 it("selects the same model deterministically regardless of provider input order",()=>{
  const first=provider({model:"z-model"}),second=provider({model:"a-model"});
  expect(route([first,second]).model).toBe("a-model");
  expect(route([second,first]).model).toBe("a-model");
 });
 it("fails closed when duplicate records claim the same provider/model quota",()=>{
  const first=provider({model:"same-free-model",quotaRemaining:100});
  const conflicting=provider({model:"same-free-model",quotaRemaining:0,quotaStatus:"EXHAUSTED"});
  expect(route([first,conflicting])).toMatchObject({mode:"RULE_BASED",provider:null,paidSpendLimit:0,
   attemptedProviders:[{reason:"DUPLICATE_PROVIDER_QUOTA_RECORD"},{reason:"DUPLICATE_PROVIDER_QUOTA_RECORD"}]});
  expect(route([conflicting,first])).toMatchObject({mode:"RULE_BASED",provider:null,paidSpendLimit:0});
 });
 it("falls back safely when the sanitizer throws or returns a malformed question",()=>{
  const base={question:"public question",asOf:at,providers:[provider()],quotaEvidence,ruleEngineAvailable:true};
  const throwing=chooseFreeAiRoute({...base,sanitize:()=>{throw new Error("sanitizer failed");}});
  expect(throwing).toMatchObject({mode:"RULE_BASED",reason:"UNSAFE_QUESTION",question:null,provider:null,paidSpendLimit:0});
  const malformed=chooseFreeAiRoute({...base,sanitize:()=>({ok:true,question:123} as unknown as {ok:boolean;question?:string})});
  expect(malformed).toMatchObject({mode:"RULE_BASED",reason:"UNSAFE_QUESTION",question:null,provider:null});
  const tooLong=chooseFreeAiRoute({...base,sanitize:()=>({ok:true,question:"x".repeat(1201)})});
  expect(tooLong).toMatchObject({mode:"RULE_BASED",reason:"UNSAFE_QUESTION",question:null});
 });
 it("withholds telemetry summaries for future, duplicate or malformed operations events",()=>{
  const event={id:"event-1",provider:"gemini" as const,mode:"MODEL" as const,status:"FAILED" as const,
   reasonCode:"provider_timeout",occurredAt:at,elapsedMs:200};
  expect(()=>summarizeAiOperations(at,[event,{...event,id:"event-2",occurredAt:"2026-10-30T07:00:01Z"}])).toThrow("ai_ops_event_invalid");
  expect(()=>summarizeAiOperations(at,[event,{...event}])).toThrow("ai_ops_event_invalid");
  expect(()=>summarizeAiOperations(at,[{...event,elapsedMs:-1}])).toThrow("ai_ops_event_invalid");
  expect(()=>summarizeAiOperations(at,[{...event,reasonCode:"prompt contains private data"}])).toThrow("ai_ops_event_invalid");
 });
 it("uses the latest valid event instant and returns sorted bounded error codes",()=>{
  const summary=summarizeAiOperations("2026-10-30T08:00:00Z",[
   {id:"event-b",provider:"gemini",mode:"MODEL",status:"FAILED",reasonCode:"provider_timeout",occurredAt:"2026-10-30T07:30:00Z",elapsedMs:200},
   {id:"event-a",provider:null,mode:"RULE_BASED",status:"FALLBACK",reasonCode:"quota_exhausted",occurredAt:"2026-10-30T07:45:00Z",elapsedMs:null},
  ]);
  expect(summary).toMatchObject({total:2,failed:1,fallbacks:1,lastEventAt:"2026-10-30T07:45:00Z",
   errorCodes:["provider_timeout"],containsPrompts:false,containsSecrets:false});
 });
 it("rejects ambiguous duplicate quota evidence IDs even when one copy is verified",()=>{
  const conflictingEvidence=[...quotaEvidence,{...quotaEvidence[0],status:"UNVERIFIED" as const}];
  const result=chooseFreeAiRoute({question:"public question",sanitize,asOf:at,providers:[provider()],quotaEvidence:conflictingEvidence,ruleEngineAvailable:true});
  expect(result).toMatchObject({mode:"RULE_BASED",provider:null,paidSpendLimit:0,attemptedProviders:[{reason:"QUOTA_EVIDENCE_AMBIGUOUS"}]});
 });
});
