import {buildEvidencePassport} from "./evidence-passport";
import {decimalToMinorUnits,minorUnitsToNumber,roundedPercentageHundredths} from "./financial-precision";
import type {EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";
export interface LearningEvaluationInput {
 id:string;measuredAt:string;evidenceRecords:EvidenceRecord[];expected:MetricSnapshot;actual:MetricSnapshot;
 expectedRuleId:string;expectedRuleVersion:string;currentRuleId:string;currentRuleVersion:string;
}
export interface LearningEvaluation {
 id:string;status:EvidenceStatus;metricKey:string;unit:string;currency?:string;expectedValue:number|null;actualValue:number|null;
 variance:number|null;variancePercent:number|null;formulaId:string;formulaVersion:string;measuredAt:string;evidenceIds:string[];
 ruleVersions:{expected:string;measured:string};warnings:string[];
}
function numberValue(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string"||! /^-?\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const n=Number(value);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
}
/** Measures comparable facts only; never updates the rule or trains a model. */
export function evaluateDecisionLearning(input:LearningEvaluationInput):LearningEvaluation {
 if(!Number.isFinite(Date.parse(input.measuredAt)))throw new Error("measuredAt must be valid");
 const passport=buildEvidencePassport({id:"learning:"+input.id,generatedAt:input.measuredAt,asOf:input.measuredAt,evidenceRecords:input.evidenceRecords,metrics:[input.expected,input.actual]});
 const [expected,actual]=passport.metrics,warnings:string[]=[];
 if(expected.status!=="VERIFIED"||actual.status!=="VERIFIED")warnings.push("EXPECTED_OR_ACTUAL_NOT_VERIFIED");
 if(expected.asOf!==input.measuredAt||actual.asOf!==input.measuredAt)warnings.push("MEASUREMENT_AS_OF_MISMATCH");
 if(expected.key!==actual.key)warnings.push("METRIC_KEY_MISMATCH");
 if(expected.unit!==actual.unit)warnings.push("UNIT_MISMATCH");
 if(expected.currency!==actual.currency)warnings.push("CURRENCY_MISMATCH");
 if(expected.unitOfMeasure!==actual.unitOfMeasure)warnings.push("UNIT_OF_MEASURE_MISMATCH");
 if((expected.unit==="QUANTITY"||expected.unit==="CURRENCY_PER_UNIT")&&
   (!expected.unitOfMeasure?.trim()||!actual.unitOfMeasure?.trim()))warnings.push("UNIT_OF_MEASURE_MISSING");
 if(JSON.stringify(expected.period)!==JSON.stringify(actual.period))warnings.push("PERIOD_MISMATCH");
 if(expected.lineage.formulaId!==actual.lineage.formulaId||
   expected.lineage.formulaVersion!==actual.lineage.formulaVersion)warnings.push("FORMULA_MISMATCH");
 if(!input.expectedRuleId.trim()||!input.expectedRuleVersion.trim()||!input.currentRuleId.trim()||!input.currentRuleVersion.trim())warnings.push("RULE_VERSION_MISSING");
 const left=numberValue(expected.value),right=numberValue(actual.value);
 if(left===null||right===null)warnings.push("UNKNOWN_EXPECTED_OR_ACTUAL_VALUE");
 if(expected.unit==="COUNT"&&
   (left===null||right===null||!Number.isSafeInteger(left)||!Number.isSafeInteger(right)))
  warnings.push("COUNT_VALUE_NOT_INTEGER");
 const expectedMinor=left===null?null:decimalToMinorUnits(expected.value,6,true);
 const actualMinor=right===null?null:decimalToMinorUnits(actual.value,6,true);
 if(left!==null&&right!==null&&(expectedMinor===null||actualMinor===null))
  warnings.push("OUTCOME_PRECISION_UNSUPPORTED");
 let valid=warnings.length===0&&left!==null&&right!==null&&expectedMinor!==null&&actualMinor!==null;
 let variance:number|null=null,percent:number|null=null;
 if(valid){
  const varianceMinor=(actualMinor as bigint)-(expectedMinor as bigint);
  const exactVariance=minorUnitsToNumber(varianceMinor,6);
  const denominator=(expectedMinor as bigint)<0n?-(expectedMinor as bigint):(expectedMinor as bigint);
  const numerator=varianceMinor<0n?-varianceMinor:varianceMinor;
  const percentHundredths=denominator>0n?roundedPercentageHundredths(numerator,denominator):null;
  const exactPercent=percentHundredths===null?null:Number(percentHundredths)/100*(varianceMinor<0n?-1:1);
  if(exactVariance===null||(percentHundredths!==null&&
    (percentHundredths>BigInt(Number.MAX_SAFE_INTEGER)||!Number.isFinite(exactPercent)||Math.abs(exactPercent as number)>Number.MAX_SAFE_INTEGER))){
   warnings.push("OUTCOME_ARITHMETIC_UNSAFE");
   valid=false;
  }else{
   variance=exactVariance;
   percent=exactPercent;
  }
 }
 const status:EvidenceStatus=valid?"VERIFIED":expected.status==="UNVERIFIED"||actual.status==="UNVERIFIED"?"UNVERIFIED":"NEEDS_REVIEW";
 return {id:input.id,status,metricKey:expected.key,unit:expected.unit,...(expected.currency?{currency:expected.currency}:{}),
  expectedValue:valid?left:null,actualValue:valid?right:null,variance,variancePercent:percent!==null&&Number.isFinite(percent)?percent:null,
  formulaId:"decision.outcome.variance",formulaVersion:"1.0.0",measuredAt:input.measuredAt,
  evidenceIds:[...new Set([...expected.lineage.evidenceIds,...actual.lineage.evidenceIds])],
  ruleVersions:{expected:input.expectedRuleId+"@"+input.expectedRuleVersion,measured:input.currentRuleId+"@"+input.currentRuleVersion},warnings};
}
