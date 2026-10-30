import type {AiProvider} from "../../../supabase/functions/ai-gateway/logic";
export type FreeQuotaStatus="AVAILABLE"|"EXHAUSTED"|"NOT_CONFIGURED"|"DISABLED"|"UNKNOWN";
export type AiExecutionMode="MODEL"|"RULE_BASED"|"MODEL_UNAVAILABLE";
export interface FreeProviderQuota {
 provider:AiProvider;model:string;quotaStatus:FreeQuotaStatus;quotaRemaining:number|null;freeTierConfirmed:boolean;
 zeroCostConfirmed:boolean;privacyReviewed:boolean;privacyAllowsQuestionOnly:boolean;inputRate:number|null;outputRate:number|null;
 verifiedAt:string;sourceEvidenceId:string;cooldownUntil:string|null;
}
export interface SanitizedQuestion {ok:boolean;question?:string}
export interface AiRouteDecision {
 mode:AiExecutionMode;provider:AiProvider|null;model:string|null;reason:"FREE_PROVIDER_AVAILABLE"|"ALL_FREE_QUOTAS_UNAVAILABLE"|"NO_RULE_ENGINE";
 attemptedProviders:Array<{provider:AiProvider;model:string;reason:string}>;paidSpendLimit:0;question:string|null;
}
/** The only provider payload is the sanitized question; no customer, ledger, stock, margin or tenant DTO is accepted here. */
export function chooseFreeAiRoute(input:{
 question:unknown;sanitize:(question:unknown)=>SanitizedQuestion;asOf:string;providers:FreeProviderQuota[];ruleEngineAvailable:boolean;
}):AiRouteDecision {
 const sanitized=input.sanitize(input.question),fallback=input.ruleEngineAvailable?"RULE_BASED":"MODEL_UNAVAILABLE";
 if(!sanitized.ok||!sanitized.question?.trim())return {mode:fallback,provider:null,model:null,
  reason:input.ruleEngineAvailable?"ALL_FREE_QUOTAS_UNAVAILABLE":"NO_RULE_ENGINE",attemptedProviders:[],paidSpendLimit:0,question:null};
 const now=Date.parse(input.asOf);if(!Number.isFinite(now))throw new Error("asOf must be valid");
 const attemptedProviders:Array<{provider:AiProvider;model:string;reason:string}>=[];
 const selected=input.providers.find(provider=>{
  let reason="ELIGIBLE";
  if(provider.quotaStatus!=="AVAILABLE")reason="QUOTA_"+provider.quotaStatus;
  else if(!provider.freeTierConfirmed)reason="FREE_TIER_NOT_CONFIRMED";
  else if(!provider.zeroCostConfirmed||provider.inputRate!==0||provider.outputRate!==0)reason="COST_NOT_ZERO";
  else if(!provider.privacyReviewed||!provider.privacyAllowsQuestionOnly)reason="PRIVACY_NOT_APPROVED";
  else if(provider.quotaRemaining===null||!Number.isSafeInteger(provider.quotaRemaining)||provider.quotaRemaining<=0)reason="QUOTA_REMAINING_UNKNOWN_OR_EMPTY";
  else if(!provider.model.trim()||!provider.sourceEvidenceId.trim())reason="MODEL_OR_EVIDENCE_MISSING";
  else if(!Number.isFinite(Date.parse(provider.verifiedAt))||now-Date.parse(provider.verifiedAt)>86400000||Date.parse(provider.verifiedAt)>now)reason="PROVIDER_VERIFICATION_STALE";
  else if(provider.cooldownUntil&&Number.isFinite(Date.parse(provider.cooldownUntil))&&Date.parse(provider.cooldownUntil)>now)reason="PROVIDER_COOLDOWN";
  attemptedProviders.push({provider:provider.provider,model:provider.model,reason});
  return reason==="ELIGIBLE";
 });
 if(!selected)return {mode:fallback,provider:null,model:null,reason:input.ruleEngineAvailable?"ALL_FREE_QUOTAS_UNAVAILABLE":"NO_RULE_ENGINE",
  attemptedProviders,paidSpendLimit:0,question:sanitized.question};
 return {mode:"MODEL",provider:selected.provider,model:selected.model,reason:"FREE_PROVIDER_AVAILABLE",
  attemptedProviders,paidSpendLimit:0,question:sanitized.question};
}
export interface AiOpsEvent {id:string;provider:AiProvider|null;mode:AiExecutionMode;status:"SUCCEEDED"|"FAILED"|"FALLBACK";reasonCode:string;occurredAt:string;elapsedMs:number|null}
export interface AiOpsSummary {
 asOf:string;total:number;successful:number;failed:number;fallbacks:number;byProvider:Array<{provider:AiProvider;count:number}>;
 lastEventAt:string|null;errorCodes:string[];containsPrompts:false;containsSecrets:false;
}
export function summarizeAiOperations(asOf:string,events:AiOpsEvent[]):AiOpsSummary {
 if(!Number.isFinite(Date.parse(asOf)))throw new Error("asOf must be valid");
 const counts=new Map<AiProvider,number>();for(const e of events)if(e.provider)counts.set(e.provider,(counts.get(e.provider)??0)+1);
 const stamps=events.map(e=>e.occurredAt).filter(v=>Number.isFinite(Date.parse(v))).sort();
 return {asOf,total:events.length,successful:events.filter(e=>e.status==="SUCCEEDED").length,failed:events.filter(e=>e.status==="FAILED").length,
  fallbacks:events.filter(e=>e.status==="FALLBACK").length,byProvider:[...counts].map(([provider,count])=>({provider,count})).sort((a,b)=>a.provider.localeCompare(b.provider)),
  lastEventAt:stamps.length?stamps[stamps.length-1]:null,errorCodes:[...new Set(events.filter(e=>e.status==="FAILED").map(e=>e.reasonCode).filter(Boolean))],
  containsPrompts:false,containsSecrets:false};
}
