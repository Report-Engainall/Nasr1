import {buildEvidencePassport} from "./evidence-passport";
import {decimalToMinorUnits,minorUnitsToNumber} from "./financial-precision";
import type {DecisionCandidate,DecisionImpact,DecisionImpactStatus,DecisionPriority,EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";
export type DecisionOperator="GTE"|"GT"|"LTE"|"LT"|"EQ";
export type ImpactOperation="IDENTITY"|"SUM"|"PRODUCT";
export interface ImpactFormula {id:string;version:string;operation:ImpactOperation;metricKeys:string[];resultUnit:string}
export interface DecisionRule {
 id:string;version:string;metricKey:string;operator:DecisionOperator;threshold:number;priority:DecisionPriority;
 what:string;why:string;soWhat:string;whatNext:string;owner:string;expectedOutcome:string;expiresInDays?:number;impactFormula?:ImpactFormula;
}
export type WithheldDecisionReason="NO_SOURCE"|"CONFLICTING_SIGNALS"|"DUPLICATE_METRIC"|"UNAVAILABLE"|"UNVERIFIED"|"NEEDS_REVIEW"|"INCOMPLETE_DATA"|"UNKNOWN_VALUE"|"INVALID_THRESHOLD"|"INVALID_RULE"|"IMPACT_SOURCE_MISSING"|"IMPACT_NOT_VERIFIED"|"CURRENCY_MISMATCH"|"UNIT_MISMATCH"|"INVALID_IMPACT_FORMULA";
export interface WithheldDecision {ruleId:string;metricKey:string;reason:WithheldDecisionReason;evidenceStatus:EvidenceStatus|null;explanation:string}
export interface BuildDailyDecisionsInput {generatedAt:string;asOf:string;evidenceRecords:EvidenceRecord[];metrics:MetricSnapshot[];rules:DecisionRule[]}
export interface DailyDecisionResult {generatedAt:string;asOf:string;modelMode:"RULE_BASED";candidates:DecisionCandidate[];withheld:WithheldDecision[]}
const scores:Record<DecisionPriority,number>={P0:400,P1:300,P2:200,P3:100};
function strictIsoDay(value:unknown):value is string {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const time=Date.parse(value+"T00:00:00.000Z");
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value;
}
function strictTimestamp(value:unknown):number|null {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 if(!strictIsoDay(value.slice(0,10)))return null;
 const parsed=Date.parse(value);
 return Number.isFinite(parsed)?parsed:null;
}
function validEvidencePeriod(period:EvidencePeriod|null):boolean {
 return period===null||(strictIsoDay(period.from)&&strictIsoDay(period.to)&&period.from<=period.to);
}
function reviewInvalidEvidence(input:EvidenceRecord[]):EvidenceRecord[] {
 return input.map(record=>{
  const warnings=[...record.warnings];
  if(strictTimestamp(record.sourceTimestamp)===null||strictTimestamp(record.asOf)===null){
   warnings.push("INVALID_EVIDENCE_TIMESTAMP");
   return {...record,status:"NEEDS_REVIEW" as const,warnings:[...new Set(warnings)]};
  }
  if(!validEvidencePeriod(record.period)){
   warnings.push("INVALID_EVIDENCE_PERIOD");
   return {...record,status:"NEEDS_REVIEW" as const,warnings:[...new Set(warnings)]};
  }
  return record;
 });
}
function reviewInvalidMetricSnapshots(input:MetricSnapshot[],generatedAtTime:number):MetricSnapshot[] {
 return input.map(metric=>{
  const warnings=[...metric.warnings];
  const calculatedAtTime=strictTimestamp(metric.lineage.calculatedAt);
  if(strictTimestamp(metric.asOf)===null||calculatedAtTime===null||calculatedAtTime>generatedAtTime){
   warnings.push(calculatedAtTime!==null&&calculatedAtTime>generatedAtTime?"METRIC_CALCULATED_AFTER_GENERATION":"INVALID_METRIC_TIMESTAMP");
   return {...metric,status:"NEEDS_REVIEW" as const,completeness:"PARTIAL" as const,warnings:[...new Set(warnings)]};
  }
  if(!validEvidencePeriod(metric.period)){
   warnings.push("INVALID_METRIC_PERIOD");
   return {...metric,status:"NEEDS_REVIEW" as const,completeness:"PARTIAL" as const,warnings:[...new Set(warnings)]};
  }
  return metric;
 });
}
const validOperators = new Set<DecisionOperator>(["GTE","GT","LTE","LT","EQ"]);
function numeric(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string"||! /^-?\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const n=Number(value);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
}
function meets(value:number,op:DecisionOperator,threshold:number):boolean {
 switch(op){case "GTE":return value>=threshold;case "GT":return value>threshold;case "LTE":return value<=threshold;case "LT":return value<threshold;case "EQ":return value===threshold}
}
function meetsExact(value:bigint,op:DecisionOperator,threshold:bigint):boolean {
 switch(op){case "GTE":return value>=threshold;case "GT":return value>threshold;case "LTE":return value<=threshold;case "LT":return value<threshold;case "EQ":return value===threshold}
}
function compareMetricThreshold(metric:MetricSnapshot,operator:DecisionOperator,threshold:number,numericValue:number):
 {matches:boolean|null;reason:"UNKNOWN_VALUE"|"INVALID_THRESHOLD"|"UNIT_MISMATCH"|null} {
 if(metric.unit==="COUNT"){
  if(!Number.isSafeInteger(numericValue))return {matches:null,reason:"UNKNOWN_VALUE"};
  if(!Number.isSafeInteger(threshold))return {matches:null,reason:"INVALID_THRESHOLD"};
  return {matches:meets(numericValue,operator,threshold),reason:null};
 }
 if(metric.unit==="CURRENCY"||metric.unit==="CURRENCY_PER_UNIT"||metric.unit==="QUANTITY"||metric.unit==="RATIO"||metric.unit==="DAYS"){
  const source=decimalToMinorUnits(metric.value,6,true);
  if(source===null)return {matches:null,reason:"UNKNOWN_VALUE"};
  const limit=decimalToMinorUnits(threshold,6,true);
  if(limit===null)return {matches:null,reason:"INVALID_THRESHOLD"};
  return {matches:meetsExact(source,operator,limit),reason:null};
 }
 return {matches:null,reason:"UNIT_MISMATCH"};
}
const withheld=(rule:DecisionRule|null|undefined,reason:WithheldDecisionReason,status:EvidenceStatus|null,explanation:string):WithheldDecision=>({ruleId:typeof rule?.id==="string"&&rule.id.trim()?rule.id:"invalid-rule",metricKey:typeof rule?.metricKey==="string"&&rule.metricKey.trim()?rule.metricKey:"unknown-metric",reason,evidenceStatus:status,explanation});
function hasText(value:unknown):value is string {return typeof value==="string"&&value.trim().length>0;}
function isImpactFormulaValid(formula: ImpactFormula): boolean {
 if (!formula || typeof formula.id !== "string" || !formula.id.trim() ||
  typeof formula.version !== "string" || !formula.version.trim() ||
  typeof formula.resultUnit !== "string" || !formula.resultUnit.trim() ||
  !Array.isArray(formula.metricKeys) || formula.metricKeys.length === 0 ||
  formula.metricKeys.some(key => typeof key !== "string" || !key.trim() || key !== key.trim()) ||
  new Set(formula.metricKeys).size !== formula.metricKeys.length ||
  !["IDENTITY","SUM","PRODUCT"].includes(formula.operation)) return false;
 if (formula.operation === "IDENTITY" && formula.metricKeys.length !== 1) return false;
 if (formula.operation === "PRODUCT" && formula.metricKeys.length !== 2) return false;
 if (formula.operation === "SUM" && formula.metricKeys.length < 2) return false;
 return true;
}

function metricFormulaUnit(metric:MetricSnapshot):string|null {
 if(metric.unit==="QUANTITY"||metric.unit==="CURRENCY_PER_UNIT"){
  const unitOfMeasure=typeof metric.unitOfMeasure==="string"?metric.unitOfMeasure.trim():"";
  return unitOfMeasure?metric.unit+":"+unitOfMeasure:null;
 }
 return metric.unit;
}

function impactFor(formula:ImpactFormula|undefined,index:Map<string,MetricSnapshot[]>,anchor:MetricSnapshot):{impact:DecisionImpact|null;status:DecisionImpactStatus;reason:string|null} {
 if(!formula)return {impact:null,status:"NOT_CONFIGURED",reason:"NO_APPROVED_IMPACT_FORMULA"};
 if (!isImpactFormulaValid(formula)) return {impact:null,status:"WITHHELD",reason:"INVALID_IMPACT_FORMULA"};
 const sources:MetricSnapshot[]=[];
 for(const key of formula.metricKeys){const rows=index.get(key)??[];if(rows.length!==1)return {impact:null,status:"WITHHELD",reason:"IMPACT_SOURCE_MISSING"};
  const m=rows[0];if(m.status!=="VERIFIED"||m.completeness!=="COMPLETE"||m.quality!=="ACCEPTABLE"||m.value===null||!m.lineage.evidenceIds.length)
   return {impact:null,status:"WITHHELD",reason:"IMPACT_NOT_VERIFIED"};sources.push(m)}
 if(new Set(sources.map(source=>source.id)).size!==sources.length)
  return {impact:null,status:"WITHHELD",reason:"IMPACT_SOURCE_DUPLICATED"};
 const samePeriod=(a:EvidencePeriod|null,b:EvidencePeriod|null)=>a===null||b===null?a===b:a.from===b.from&&a.to===b.to;
 if(sources.some(m=>m.asOf!==anchor.asOf||!samePeriod(m.period,anchor.period)))return {impact:null,status:"WITHHELD",reason:"IMPACT_SCOPE_MISMATCH"};
 const values=sources.map(m=>numeric(m.value));if(values.some(v=>v===null))return {impact:null,status:"WITHHELD",reason:"IMPACT_NOT_VERIFIED"};
 const currencySources=sources.filter(m=>m.unit==="CURRENCY"||m.unit==="CURRENCY_PER_UNIT");
 if(currencySources.some(m=>!m.currency?.trim()))return {impact:null,status:"WITHHELD",reason:"CURRENCY_MISMATCH"};
 const currencies=[...new Set(currencySources.map(m=>m.currency as string))];
 if(currencies.length>1)return {impact:null,status:"WITHHELD",reason:"CURRENCY_MISMATCH"};

 if(formula.operation==="IDENTITY"){
  const expectedUnit=metricFormulaUnit(sources[0]);
  if(!expectedUnit||formula.resultUnit!==expectedUnit)return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
 }
 if(formula.operation==="SUM"){
  const expectedUnits=sources.map(metricFormulaUnit);
  if(expectedUnits.some(unit=>unit===null)||new Set(expectedUnits).size!==1||formula.resultUnit!==expectedUnits[0])
   return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
 }
 if(formula.operation==="PRODUCT"){
  const perUnit=sources.filter(m=>m.unit==="CURRENCY_PER_UNIT");
  const quantities=sources.filter(m=>m.unit==="QUANTITY");
  if(perUnit.length!==1||quantities.length!==1||formula.resultUnit!=="CURRENCY")
   return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
  const priceUnit=perUnit[0].unitOfMeasure?.trim();
  const quantityUnit=quantities[0].unitOfMeasure?.trim();
  if(!priceUnit||!quantityUnit||priceUnit!==quantityUnit)
   return {impact:null,status:"WITHHELD",reason:"UNIT_MISMATCH"};
 }

 let value:number|null=null;
 if(formula.operation==="IDENTITY"){
  const source=sources[0];
  if(source.unit==="CURRENCY"||source.unit==="CURRENCY_PER_UNIT"||source.unit==="QUANTITY"){
   const minor=decimalToMinorUnits(source.value,6,true);
   if(minor===null)return {impact:null,status:"WITHHELD",reason:"IMPACT_PRECISION_UNSUPPORTED"};
   value=minorUnitsToNumber(minor,6);
   if(value===null)return {impact:null,status:"WITHHELD",reason:"IMPACT_PRECISION_OVERFLOW"};
  }else value=values[0] as number;
 }
 if(formula.operation==="SUM"){
  const minor=sources.map(m=>decimalToMinorUnits(m.value,6,true));
  if(minor.some(v=>v===null))return {impact:null,status:"WITHHELD",reason:"IMPACT_PRECISION_UNSUPPORTED"};
  const total=(minor as bigint[]).reduce((sum,current)=>sum+current,0n);
  value=minorUnitsToNumber(total,6);
  if(value===null)return {impact:null,status:"WITHHELD",reason:"IMPACT_PRECISION_OVERFLOW"};
 }
 if(formula.operation==="PRODUCT"){
  const price=decimalToMinorUnits(sources.find(m=>m.unit==="CURRENCY_PER_UNIT")?.value,3);
  const quantity=decimalToMinorUnits(sources.find(m=>m.unit==="QUANTITY")?.value,3);
  if(price===null||quantity===null)return {impact:null,status:"WITHHELD",reason:"IMPACT_PRECISION_UNSUPPORTED"};
  value=minorUnitsToNumber(price*quantity,6);
  if(value===null)return {impact:null,status:"WITHHELD",reason:"IMPACT_PRECISION_OVERFLOW"};
 }
 if(value===null||!Number.isFinite(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)
  return {impact:null,status:"WITHHELD",reason:"INVALID_IMPACT_FORMULA"};
 const currencyResult=formula.resultUnit==="CURRENCY"||formula.resultUnit.startsWith("CURRENCY_PER_UNIT:");
 if(currencyResult&&currencies.length!==1)return {impact:null,status:"WITHHELD",reason:"CURRENCY_MISMATCH"};
 return {impact:{value,unit:formula.resultUnit,...(currencies.length===1?{currency:currencies[0]}:{}),formulaId:formula.id,formulaVersion:formula.version,sourceMetricIds:sources.map(m=>m.id)},status:"CALCULATED",reason:null};
}
function expiry(at:string,days:number|undefined):string|null {
 if(days===undefined)return null;if(!Number.isInteger(days)||days<1||days>3650)return null;
 const t=Date.parse(at);return Number.isFinite(t)?new Date(t+days*86400000).toISOString():null;
}
function statusReason(status:EvidenceStatus):{reason:WithheldDecisionReason;message:string} {
 if(status==="UNAVAILABLE")return {reason:"UNAVAILABLE",message:"المصدر غير متاح؛ لم يصدر قرار."};
 if(status==="UNVERIFIED")return {reason:"UNVERIFIED",message:"مصدر المؤشر غير مثبت؛ لم يصدر قرار."};
 if(status==="NEEDS_REVIEW")return {reason:"NEEDS_REVIEW",message:"المؤشر يحتاج مراجعة؛ لم يصدر قرار."};
 return {reason:"INCOMPLETE_DATA",message:"بيانات المؤشر غير مكتملة؛ لم يصدر قرار."};
}
/** Deterministic rule engine. Unknown values stay null; there is no model or write side effect. */
export function buildDailyDecisions(input:BuildDailyDecisionsInput):DailyDecisionResult {
 const generatedAtTime=strictTimestamp(input.generatedAt),asOfTime=strictTimestamp(input.asOf);
 if(generatedAtTime===null||asOfTime===null||generatedAtTime<asOfTime)
  throw new Error("generatedAt and asOf must be valid ordered ISO timestamps");
 const safeEvidence=reviewInvalidEvidence(input.evidenceRecords);
 const safeMetrics=reviewInvalidMetricSnapshots(input.metrics,generatedAtTime);
 const passport=buildEvidencePassport({id:"daily-decisions:"+input.asOf,generatedAt:input.generatedAt,asOf:input.asOf,evidenceRecords:safeEvidence,metrics:safeMetrics});
 const index=new Map<string,MetricSnapshot[]>();for(const m of passport.metrics){const rows=index.get(m.key)??[];rows.push(m);index.set(m.key,rows)}
 const candidates:DecisionCandidate[]=[],reasons:WithheldDecision[]=[],seen=new Set<string>();
 for(const candidate of input.rules){
  const rule=candidate as DecisionRule|null;
  if(!rule||typeof rule!=="object"){reasons.push(withheld(rule,"INVALID_RULE",null,"Rule is not a valid object."));continue}
  const ruleId=typeof rule.id==="string"?rule.id:"";
  if(ruleId&&seen.has(ruleId)){reasons.push(withheld(rule,"INVALID_RULE",null,"Rule ID is duplicated."));continue}
  if(ruleId)seen.add(ruleId);
  const invalidExpiry=rule.expiresInDays!==undefined&&(!Number.isInteger(rule.expiresInDays)||rule.expiresInDays<1||rule.expiresInDays>3650);
  if(!hasText(rule.id)||!hasText(rule.version)||!hasText(rule.metricKey)||!Number.isFinite(rule.threshold)||!["P0","P1","P2","P3"].includes(rule.priority)||
   !validOperators.has(rule.operator)||invalidExpiry||!hasText(rule.what)||!hasText(rule.why)||!hasText(rule.soWhat)||!hasText(rule.whatNext)||!hasText(rule.owner)||!hasText(rule.expectedOutcome)){
   reasons.push(withheld(rule,"INVALID_RULE",null,"Rule metadata is incomplete or invalid."));continue}
  const rows=index.get(rule.metricKey)??[];
  if(!rows.length){reasons.push(withheld(rule,"NO_SOURCE",null,"No sourced metric was provided."));continue}
  if(rows.length>1){const first=rows[0],conflict=rows.some(m=>m.value!==first.value||m.currency!==first.currency||m.status!==first.status);
   reasons.push(withheld(rule,conflict?"CONFLICTING_SIGNALS":"DUPLICATE_METRIC",null,conflict?"Conflicting metric snapshots exist.":"Duplicate metric snapshots exist."));continue}
  const metric=rows[0];
  if(metric.status==="NEEDS_REVIEW"&&metric.value===null){reasons.push(withheld(rule,"UNKNOWN_VALUE",metric.status,"Metric value is null/unknown; no zero was substituted."));continue}
  if(!metric.lineage.evidenceIds.length){reasons.push(withheld(rule,"NO_SOURCE",metric.status,"Metric has no evidence lineage."));continue}
  if(metric.status!=="VERIFIED"){const r=statusReason(metric.status);reasons.push(withheld(rule,r.reason,metric.status,r.message));continue}
  if(metric.completeness!=="COMPLETE"||metric.quality!=="ACCEPTABLE"){reasons.push(withheld(rule,"INCOMPLETE_DATA",metric.status,"Metric quality or completeness gate failed."));continue}
  const value=numeric(metric.value);if(value===null){reasons.push(withheld(rule,"UNKNOWN_VALUE",metric.status,"Metric is unknown or nonnumeric; it was not converted to zero."));continue}
  if((metric.unit==="CURRENCY"||metric.unit==="CURRENCY_PER_UNIT")&&!metric.currency?.trim()){reasons.push(withheld(rule,"CURRENCY_MISMATCH",metric.status,"Currency is not identified."));continue}
  if((metric.unit==="QUANTITY"||metric.unit==="CURRENCY_PER_UNIT")&&!hasText(metric.unitOfMeasure)){reasons.push(withheld(rule,"UNIT_MISMATCH",metric.status,"The metric quantity unit is not identified."));continue}
  const comparison=compareMetricThreshold(metric,rule.operator,rule.threshold,value);
  if(comparison.reason){reasons.push(withheld(rule,comparison.reason,metric.status,
   comparison.reason==="INVALID_THRESHOLD"?"Rule threshold exceeds the supported precision or integer domain."
    :comparison.reason==="UNIT_MISMATCH"?"A numeric decision requires a supported unit of measure."
    :"Metric value exceeds the supported precision or numeric domain."));continue}
  if(!comparison.matches)continue;
  const impact=impactFor(rule.impactFormula,index,metric);
  const formulaMetricKeys=rule.impactFormula&&isImpactFormulaValid(rule.impactFormula)?rule.impactFormula.metricKeys:[];
  const related=formulaMetricKeys.flatMap(key=>index.get(key)??[]);
  const proofMetrics=[metric,...related],evidenceIds=[...new Set(proofMetrics.flatMap(m=>m.lineage.evidenceIds))];
  const formulaVersions=[...new Set(proofMetrics.map(m=>m.lineage.formulaId+"@"+m.lineage.formulaVersion))];
  if(impact.impact)formulaVersions.push(impact.impact.formulaId+"@"+impact.impact.formulaVersion);
  candidates.push({
   id:rule.id+":"+metric.id+":"+metric.asOf,ruleId:rule.id,ruleVersion:rule.version,priority:rule.priority,priorityScore:scores[rule.priority],
   what:rule.what,why:rule.why+" Observed "+value+" "+metric.unit+" against "+rule.operator+" "+rule.threshold+".",
   soWhat:rule.soWhat,impact:impact.impact,impactStatus:impact.status,impactReason:impact.reason,whatNext:rule.whatNext,
   proof:{evidenceIds,metricKeys:[...new Set([metric.key,...formulaMetricKeys])],asOf:metric.asOf,formulaVersions},
   owner:rule.owner,expectedOutcome:rule.expectedOutcome,createdAt:input.generatedAt,expiresAt:expiry(input.generatedAt,rule.expiresInDays),
  });
 }
 candidates.sort((a,b)=>b.priorityScore-a.priorityScore||a.ruleId.localeCompare(b.ruleId)||a.id.localeCompare(b.id));
 return {generatedAt:input.generatedAt,asOf:input.asOf,modelMode:"RULE_BASED",candidates,withheld:reasons};
}

export interface DailyDecisionHighlightSelection {
  candidates: DecisionCandidate[];
  totalCandidates: number;
  omittedCount: number;
  limit: number;
}

function comparableCurrencyImpact(candidate: DecisionCandidate): { currency: string; magnitude: bigint } | null {
  if (
    candidate.impactStatus !== "CALCULATED" ||
    candidate.impact?.unit !== "CURRENCY" ||
    typeof candidate.impact.currency !== "string" ||
    !/^[A-Z]{3}$/.test(candidate.impact.currency)
  ) return null;
  const amount = decimalToMinorUnits(candidate.impact.value, 6, true);
  if (amount === null) return null;
  return { currency: candidate.impact.currency, magnitude: amount < 0n ? -amount : amount };
}

/**
 * Selects the daily action shortlist without treating unlike currencies as comparable.
 * Priority is always dominant; verified currency impact only orders candidates inside
 * the same currency bucket. Currency buckets retain their stable first-seen order.
 */
export function selectTopDailyDecisions(
  candidates: readonly DecisionCandidate[],
  limit = 10,
): DailyDecisionHighlightSelection {
  if (!Number.isInteger(limit) || limit < 5 || limit > 10) {
    throw new RangeError("Daily decision highlight limit must be an integer from 5 through 10.");
  }

  const stable = [...candidates].sort((a, b) =>
    b.priorityScore - a.priorityScore ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.id.localeCompare(b.id)
  );
  const priorityOrder = [...new Set(stable.map(candidate => candidate.priorityScore))]
    .sort((a, b) => b - a);
  const ranked: DecisionCandidate[] = [];

  for (const priorityScore of priorityOrder) {
    const buckets = new Map<string, { currency: string | null; rows: Array<{ candidate: DecisionCandidate; magnitude: bigint | null }> }>();
    for (const candidate of stable) {
      if (candidate.priorityScore !== priorityScore) continue;
      const comparable = comparableCurrencyImpact(candidate);
      const key = comparable ? "currency:" + comparable.currency : "unpriced";
      const bucket = buckets.get(key) ?? { currency: comparable?.currency ?? null, rows: [] };
      bucket.rows.push({ candidate, magnitude: comparable?.magnitude ?? null });
      buckets.set(key, bucket);
    }

    for (const bucket of buckets.values()) {
      if (bucket.currency !== null) {
        bucket.rows.sort((a, b) => {
          if (a.magnitude !== null && b.magnitude !== null && a.magnitude !== b.magnitude) {
            return a.magnitude > b.magnitude ? -1 : 1;
          }
          if (a.magnitude !== null && b.magnitude === null) return -1;
          if (a.magnitude === null && b.magnitude !== null) return 1;
          return a.candidate.ruleId.localeCompare(b.candidate.ruleId) ||
            a.candidate.id.localeCompare(b.candidate.id);
        });
      }
      ranked.push(...bucket.rows.map(row => row.candidate));
    }
  }

  const selected = ranked.slice(0, limit);
  return {
    candidates: selected,
    totalCandidates: ranked.length,
    omittedCount: Math.max(0, ranked.length - selected.length),
    limit,
  };
}
