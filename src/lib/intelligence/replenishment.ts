import {buildEvidencePassport} from "./evidence-passport";
import {decimalToMinorUnits,minorUnitsToNumber} from "./financial-precision";
import type {EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export interface ReplenishmentProductInput {
 productRef:string;availableToPromise:MetricSnapshot;reorderPoint:MetricSnapshot;soldQuantityWindow:MetricSnapshot;
 supplierLeadTimeDays:MetricSnapshot;incomingPurchaseQuantity:MetricSnapshot;minimumOrderQuantity?:MetricSnapshot|null;orderMultiple?:MetricSnapshot|null;quantityUnit:string;
}
export interface ReplenishmentRecommendation {
 productRef:string;status:EvidenceStatus;action:"RECOMMEND"|"NO_ACTION"|"WITHHELD";quantityUnit:string|null;availableToPromise:number|null;incomingPurchaseQuantity:number|null;coveredAfterIncoming:number|null;
 reorderPoint:number|null;dailyDemand:number|null;leadTimeDemand:number|null;targetStock:number|null;recommendedQuantity:number|null;
 formulaId:string;formulaVersion:string;evidenceIds:string[];warnings:string[];automaticPurchase:false;
}
const FORMULA_ID="inventory.replenishment-target";
const FORMULA_VERSION="1.1.1";
function ceilDivNonNegative(numerator:bigint,denominator:bigint):bigint {
 if(numerator<=0n)return 0n;
 return (numerator+denominator-1n)/denominator;
}
function isoDay(value:string):number|null {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const time=Date.parse(value+"T00:00:00Z");
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}
function isoTimestamp(value:unknown):number|null {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[.]\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 if(isoDay(value.slice(0,10))===null)return null;
 const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null;
}
function sanitizeEvidence(records:EvidenceRecord[]):EvidenceRecord[] {
 return records.map(record=>{
  const warnings=[...record.warnings];
  const badTimestamp=isoTimestamp(record.sourceTimestamp)===null||isoTimestamp(record.asOf)===null;
  const badPeriod=record.period!==null&&
   (isoDay(record.period.from)===null||isoDay(record.period.to)===null||record.period.from>record.period.to);
  if(badTimestamp||badPeriod){
   warnings.push(...(badTimestamp?["INVALID_EVIDENCE_TIMESTAMP"]:[]),...(badPeriod?["INVALID_EVIDENCE_PERIOD"]:[]));
   return {...record,status:"NEEDS_REVIEW" as const,warnings:[...new Set(warnings)]};
  }
  return record;
 });
}
function dayCount(period:EvidencePeriod):number {
 const from=isoDay(period.from),to=isoDay(period.to);
 if(from===null||to===null||to<from)return 0;
 const days=Math.floor((to-from)/86400000)+1;
 return Number.isSafeInteger(days)&&days>0?days:0;
}

type ReplenishmentMetricRead = { value: number | null; minorUnits: bigint | null; status: EvidenceStatus; metric: MetricSnapshot | null };

function readReplenishmentMetric(args: {
  metric: MetricSnapshot;
  unit: string;
  expectedQuantityUnit: string;
  asOf: string;
  period: EvidencePeriod;
  soldQuantityMetricId: string;
  index: Map<string, MetricSnapshot>;
  warnings: string[];
}): ReplenishmentMetricRead {
  const { metric, unit, expectedQuantityUnit, asOf, period, soldQuantityMetricId, index, warnings } = args;
  const source = index.get(metric.id);
  if (!source) return { value: null, minorUnits: null, status: "UNVERIFIED", metric: null };
  const sourceAsOfTime=isoTimestamp(source.asOf);
  const calculatedAtTime=isoTimestamp(source.lineage.calculatedAt);
  const expectedAsOfTime=isoTimestamp(asOf);
  if (
    source.status !== "VERIFIED" ||
    source.completeness !== "COMPLETE" ||
    source.quality !== "ACCEPTABLE" ||
    source.asOf !== asOf ||
    sourceAsOfTime === null ||
    calculatedAtTime === null ||
    expectedAsOfTime === null ||
    calculatedAtTime > expectedAsOfTime ||
    source.unit !== unit ||
    !source.lineage.evidenceIds.length
  ) {
    return {
      value: null,
      minorUnits: null,
      status: source.status === "VERIFIED" ? "NEEDS_REVIEW" : source.status,
      metric: source,
    };
  }
  if (unit === "QUANTITY") {
    if (!expectedQuantityUnit || !source.unitOfMeasure?.trim()) {
      warnings.push("QUANTITY_UOM_MISSING");
      return { value: null, minorUnits: null, status: "NEEDS_REVIEW", metric: source };
    }
    if (source.unitOfMeasure.trim() !== expectedQuantityUnit) {
      warnings.push("QUANTITY_UOM_MISMATCH");
      return { value: null, minorUnits: null, status: "UNVERIFIED", metric: source };
    }
  }
  const hasWrongSoldPeriod = metric.id === soldQuantityMetricId &&
    (!source.period || source.period.from !== period.from || source.period.to !== period.to);
  const hasWrongQuantityPeriod = unit === "QUANTITY" && Boolean(source.period) &&
    (source.period!.from !== period.from || source.period!.to !== period.to);
  const hasPeriodOnDayMetric = unit === "DAYS" && source.period !== null;
  if (hasWrongSoldPeriod || hasWrongQuantityPeriod || hasPeriodOnDayMetric) {
    return { value: null, minorUnits: null, status: "NEEDS_REVIEW", metric: source };
  }
  // The source aggregate is NUMERIC(18,3); six fractional places preserve it
  // without float conversion and leave deterministic headroom for calculations.
  const minorUnits = decimalToMinorUnits(source.value, 6);
  const value = minorUnits === null ? null : minorUnitsToNumber(minorUnits, 6);
  if (minorUnits === null || value === null) {
    warnings.push("METRIC_DECIMAL_PRECISION_OR_RANGE_INVALID");
    return { value: null, minorUnits: null, status: "NEEDS_REVIEW", metric: source };
  }
  return { value, minorUnits, status: "VERIFIED", metric: source };
}

export function buildReplenishmentRecommendations(input:{
 id:string;asOf:string;period:EvidencePeriod;evidenceRecords:EvidenceRecord[];products:ReplenishmentProductInput[];
}):{id:string;asOf:string;period:EvidencePeriod;recommendations:ReplenishmentRecommendation[]} {
 if(isoTimestamp(input.asOf)===null)throw new Error("asOf must be a valid ISO timestamp");
 const periodDays=dayCount(input.period);if(periodDays<1)throw new Error("invalid period");
 const metrics=input.products.flatMap(p=>[p.availableToPromise,p.reorderPoint,p.soldQuantityWindow,p.supplierLeadTimeDays,p.incomingPurchaseQuantity,...(p.minimumOrderQuantity?[p.minimumOrderQuantity]:[]),...(p.orderMultiple?[p.orderMultiple]:[])]);
 const passport=buildEvidencePassport({id:"replenishment:"+input.asOf,generatedAt:input.asOf,asOf:input.asOf,evidenceRecords:sanitizeEvidence(input.evidenceRecords),metrics});
 const counts=new Map<string,number>();for(const m of passport.metrics)counts.set(m.id,(counts.get(m.id)??0)+1);
 const index=new Map<string,MetricSnapshot>();for(const m of passport.metrics)if(counts.get(m.id)===1)index.set(m.id,m);
 const productRefCounts=new Map<string,number>();
 for(const product of input.products){
  const ref=typeof product.productRef==="string"?product.productRef.trim():"";
  if(ref)productRefCounts.set(ref,(productRefCounts.get(ref)??0)+1);
 }
 const recommendations:ReplenishmentRecommendation[]=input.products.map((product):ReplenishmentRecommendation=>{
  const productRef=typeof product.productRef==="string"?product.productRef.trim():"";
  const invalidRef=!productRef,duplicateRef=!invalidRef&&(productRefCounts.get(productRef)??0)>1;
  const warnings:string[]=invalidRef?["PRODUCT_REFERENCE_MISSING"]:duplicateRef?["DUPLICATE_PRODUCT_REFERENCE"]:[];
  if(invalidRef||duplicateRef)return {
   productRef,status:"UNVERIFIED",action:"WITHHELD",quantityUnit:null,availableToPromise:null,incomingPurchaseQuantity:null,coveredAfterIncoming:null,reorderPoint:null,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds:[],warnings,automaticPurchase:false,
  };
  const expectedQuantityUnit=typeof product.quantityUnit==="string"?product.quantityUnit.trim():"",evidenceIds=[...new Set(metrics.filter(m=>[product.availableToPromise.id,product.reorderPoint.id,product.soldQuantityWindow.id,product.supplierLeadTimeDays.id,product.incomingPurchaseQuantity.id,product.minimumOrderQuantity?.id,product.orderMultiple?.id].includes(m.id)).flatMap(m=>m.lineage.evidenceIds))];
  const read = (metric: MetricSnapshot, unit: string) => readReplenishmentMetric({
    metric,
    unit,
    expectedQuantityUnit,
    asOf: input.asOf,
    period: input.period,
    soldQuantityMetricId: product.soldQuantityWindow.id,
    index,
    warnings,
  });
  const atp = read(product.availableToPromise, "QUANTITY");
  const rop = read(product.reorderPoint, "QUANTITY");
  const sold = read(product.soldQuantityWindow, "QUANTITY");
  const lead = read(product.supplierLeadTimeDays, "DAYS");
  const incoming = read(product.incomingPurchaseQuantity, "QUANTITY");
  const optional = [
    product.minimumOrderQuantity ? read(product.minimumOrderQuantity, "QUANTITY") : null,
    product.orderMultiple ? read(product.orderMultiple, "QUANTITY") : null,
  ];
  const required=[atp,rop,sold,lead,incoming],bad=required.find(r=>r.status!=="VERIFIED")??optional.find(r=>r&&r.status!=="VERIFIED");
  if(bad){warnings.push("REQUIRED_OR_CONFIGURED_INPUT_NOT_VERIFIED");return {
   productRef:product.productRef,status:bad.status,action:"WITHHELD",quantityUnit:null,availableToPromise:atp.value,incomingPurchaseQuantity:incoming.value,coveredAfterIncoming:null,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  if(required.some(r=>r.value===null)||optional.some(r=>r&&r.value===null)){warnings.push("UNKNOWN_INPUT");return {
   productRef:product.productRef,status:"NEEDS_REVIEW",action:"WITHHELD",quantityUnit:null,availableToPromise:atp.value,incomingPurchaseQuantity:incoming.value,coveredAfterIncoming:null,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  const atpMinor=atp.minorUnits as bigint,ropMinor=rop.minorUnits as bigint,soldMinor=sold.minorUnits as bigint,
   leadDaysMinor=lead.minorUnits as bigint,incomingMinor=incoming.minorUnits as bigint;
  const soldValue=minorUnitsToNumber(soldMinor,6);
  const dailyDemand=soldValue===null?null:soldValue/periodDays;
  // Round demand upward to the source precision before subtracting stock, so the recommendation cannot understate lead-time need.
  const leadDemandMinor=ceilDivNonNegative(soldMinor*leadDaysMinor,BigInt(periodDays)*1_000_000n);
  const targetMinor=ropMinor>leadDemandMinor?ropMinor:leadDemandMinor;
  const coveredMinor=atpMinor+incomingMinor;
  let recommendedMinor=targetMinor>coveredMinor?targetMinor-coveredMinor:0n;
  const minimumMinor=optional[0]?.minorUnits??0n,multipleMinor=optional[1]?.minorUnits??null;
  if(minimumMinor>0n&&recommendedMinor>0n&&recommendedMinor<minimumMinor)recommendedMinor=minimumMinor;
  if(multipleMinor!==null&&multipleMinor>0n&&recommendedMinor>0n)
   recommendedMinor=ceilDivNonNegative(recommendedMinor,multipleMinor)*multipleMinor;
  const leadDemand=minorUnitsToNumber(leadDemandMinor,6);
  const target=minorUnitsToNumber(targetMinor,6);
  const coveredAfterIncoming=minorUnitsToNumber(coveredMinor,6);
  const recommended=minorUnitsToNumber(recommendedMinor,6);
  const safe=[dailyDemand,leadDemand,target,coveredAfterIncoming,recommended].every(n=>n!==null&&Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER);
  if(!safe){warnings.push("RECOMMENDED_QUANTITY_OVERFLOW");return {
   productRef:product.productRef,status:"NEEDS_REVIEW",action:"WITHHELD",quantityUnit:null,availableToPromise:atp.value,incomingPurchaseQuantity:incoming.value,coveredAfterIncoming:null,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  return {
   productRef:product.productRef,status:"VERIFIED",action:(recommended as number)>0?"RECOMMEND":"NO_ACTION",
   quantityUnit:expectedQuantityUnit,availableToPromise:atp.value,incomingPurchaseQuantity:incoming.value,coveredAfterIncoming:coveredAfterIncoming as number,reorderPoint:rop.value,dailyDemand:dailyDemand as number,leadTimeDemand:leadDemand as number,targetStock:target as number,recommendedQuantity:recommended as number,
   formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  };
 });
 return {id:input.id,asOf:input.asOf,period:input.period,recommendations};
}
