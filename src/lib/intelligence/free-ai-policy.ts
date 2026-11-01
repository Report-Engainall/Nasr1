import type {AiProvider} from "../../../supabase/functions/ai-gateway/logic";
export type FreeQuotaStatus="AVAILABLE"|"EXHAUSTED"|"NOT_CONFIGURED"|"DISABLED"|"UNKNOWN";
export type AiExecutionMode="MODEL"|"RULE_BASED"|"MODEL_UNAVAILABLE";
export interface FreeProviderQuota {
 provider:AiProvider;model:string;quotaStatus:FreeQuotaStatus;quotaRemaining:number|null;freeTierConfirmed:boolean;
 zeroCostConfirmed:boolean;privacyReviewed:boolean;privacyAllowsQuestionOnly:boolean;inputRate:number|null;outputRate:number|null;
 verifiedAt:string;sourceEvidenceId:string;cooldownUntil:string|null;
}
export interface SanitizedQuestion {ok:boolean;question?:string}
export interface FreeQuotaEvidence {id:string;status:"VERIFIED"|"NEEDS_REVIEW"|"UNVERIFIED"|"UNAVAILABLE";asOf:string;completeness:"COMPLETE"|"PARTIAL"|"UNKNOWN";quality:"ACCEPTABLE"|"WARNINGS"|"INVALID"|"UNKNOWN"}
export interface AiRouteDecision {
 mode:AiExecutionMode;provider:AiProvider|null;model:string|null;reason:"FREE_PROVIDER_AVAILABLE"|"ALL_FREE_QUOTAS_UNAVAILABLE"|"NO_RULE_ENGINE"|"UNSAFE_QUESTION";
 attemptedProviders:Array<{provider:AiProvider;model:string;reason:string}>;paidSpendLimit:0;question:string|null;
}
function freeProviderEligibilityReason(
 provider:FreeProviderQuota,
 now:number,
 providerCounts:Map<string,number>,
 evidenceById:Map<string,FreeQuotaEvidence[]>,
):string {
 const key=JSON.stringify([provider.provider,provider.model]);
 if((providerCounts.get(key)??0)!==1)return "DUPLICATE_PROVIDER_QUOTA_RECORD";
 if(provider.quotaStatus!=="AVAILABLE")return "QUOTA_"+provider.quotaStatus;
 if(!provider.freeTierConfirmed)return "FREE_TIER_NOT_CONFIRMED";
 if(!provider.zeroCostConfirmed||provider.inputRate!==0||provider.outputRate!==0)return "COST_NOT_ZERO";
 if(!provider.privacyReviewed||!provider.privacyAllowsQuestionOnly)return "PRIVACY_NOT_APPROVED";
 if(provider.quotaRemaining===null||!Number.isSafeInteger(provider.quotaRemaining)||provider.quotaRemaining<=0)
  return "QUOTA_REMAINING_UNKNOWN_OR_EMPTY";
 if(typeof provider.model!=="string"||!provider.model.trim()||typeof provider.sourceEvidenceId!=="string"||!provider.sourceEvidenceId.trim())
  return "MODEL_OR_EVIDENCE_MISSING";
 const evidenceRows=evidenceById.get(provider.sourceEvidenceId)??[];
 if(evidenceRows.length>1)return "QUOTA_EVIDENCE_AMBIGUOUS";
 const evidence=evidenceRows[0];
 if(!evidence||evidence.status!=="VERIFIED"||evidence.completeness!=="COMPLETE"||evidence.quality!=="ACCEPTABLE"||evidence.asOf!==provider.verifiedAt)
  return "FREE_QUOTA_EVIDENCE_NOT_VERIFIED";
 const verifiedAt=Date.parse(provider.verifiedAt);
 if(!Number.isFinite(verifiedAt)||now-verifiedAt>86400000||verifiedAt>now)return "PROVIDER_VERIFICATION_STALE";
 if(provider.cooldownUntil!==null&&!Number.isFinite(Date.parse(provider.cooldownUntil)))return "PROVIDER_COOLDOWN_INVALID";
 if(provider.cooldownUntil&&Date.parse(provider.cooldownUntil)>now)return "PROVIDER_COOLDOWN";
 return "ELIGIBLE";
}

/** The only provider payload is the sanitized question; no customer, ledger, stock, margin or tenant DTO is accepted here. */
export function chooseFreeAiRoute(input:{
 question:unknown;sanitize:(question:unknown)=>SanitizedQuestion;asOf:string;providers:FreeProviderQuota[];
 quotaEvidence:FreeQuotaEvidence[];ruleEngineAvailable:boolean;
}):AiRouteDecision {
 const sanitized=input.sanitize(input.question),fallback=input.ruleEngineAvailable?"RULE_BASED":"MODEL_UNAVAILABLE";
 if(!sanitized.ok||!sanitized.question?.trim())return {mode:fallback,provider:null,model:null,
  reason:"UNSAFE_QUESTION",attemptedProviders:[],paidSpendLimit:0,question:null};
 const now=Date.parse(input.asOf);if(!Number.isFinite(now))throw new Error("asOf must be valid");
 const attemptedProviders:Array<{provider:AiProvider;model:string;reason:string}>=[];
 const providerKey=(provider:FreeProviderQuota)=>JSON.stringify([provider.provider,provider.model]);
 const providerCounts=new Map<string,number>();
 for(const provider of input.providers)providerCounts.set(providerKey(provider),(providerCounts.get(providerKey(provider))??0)+1);
 const evidenceById=new Map<string,FreeQuotaEvidence[]>();
 for(const record of input.quotaEvidence){const rows=evidenceById.get(record.id)??[];rows.push(record);evidenceById.set(record.id,rows);}
 const selected=[...input.providers].sort((a,b)=>a.provider.localeCompare(b.provider)||a.model.localeCompare(b.model)).find(provider=>{
  const reason=freeProviderEligibilityReason(provider,now,providerCounts,evidenceById);
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
