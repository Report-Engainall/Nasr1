import {buildEvidencePassport} from "./evidence-passport";
import type {EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export interface ReplenishmentProductInput {
 productRef:string;availableToPromise:MetricSnapshot;reorderPoint:MetricSnapshot;soldQuantityWindow:MetricSnapshot;
 supplierLeadTimeDays:MetricSnapshot;minimumOrderQuantity?:MetricSnapshot|null;orderMultiple?:MetricSnapshot|null;quantityUnit:string;
}
export interface ReplenishmentRecommendation {
 productRef:string;status:EvidenceStatus;action:"RECOMMEND"|"NO_ACTION"|"WITHHELD";availableToPromise:number|null;
 reorderPoint:number|null;dailyDemand:number|null;leadTimeDemand:number|null;targetStock:number|null;recommendedQuantity:number|null;
 formulaId:string;formulaVersion:string;evidenceIds:string[];warnings:string[];automaticPurchase:false;
}
const FORMULA_ID="inventory.replenishment-target";
const FORMULA_VERSION="1.0.0";
function numeric(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&Math.abs(value)<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string"||! /^-?\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const n=Number(value);return Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER?n:null;
}
function dayCount(period:EvidencePeriod):number {
 const from=Date.parse(period.from+"T00:00:00Z"),to=Date.parse(period.to+"T00:00:00Z");
 if(!Number.isFinite(from)||!Number.isFinite(to)||to<from)return 0;
 return Math.floor((to-from)/86400000)+1;
}
export function buildReplenishmentRecommendations(input:{
 id:string;asOf:string;period:EvidencePeriod;evidenceRecords:EvidenceRecord[];products:ReplenishmentProductInput[];
}):{id:string;asOf:string;period:EvidencePeriod;recommendations:ReplenishmentRecommendation[]} {
 if(!Number.isFinite(Date.parse(input.asOf)))throw new Error("asOf must be valid");
 const periodDays=dayCount(input.period);if(periodDays<1)throw new Error("invalid period");
 const metrics=input.products.flatMap(p=>[p.availableToPromise,p.reorderPoint,p.soldQuantityWindow,p.supplierLeadTimeDays,...(p.minimumOrderQuantity?[p.minimumOrderQuantity]:[]),...(p.orderMultiple?[p.orderMultiple]:[])]);
 const passport=buildEvidencePassport({id:"replenishment:"+input.asOf,generatedAt:input.asOf,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics});
 const counts=new Map<string,number>();for(const m of passport.metrics)counts.set(m.id,(counts.get(m.id)??0)+1);
 const index=new Map<string,MetricSnapshot>();for(const m of passport.metrics)if(counts.get(m.id)===1)index.set(m.id,m);
 const recommendations=input.products.map(product=>{
  const warnings:string[]=[],evidenceIds=[...new Set(metrics.filter(m=>[product.availableToPromise.id,product.reorderPoint.id,product.soldQuantityWindow.id,product.supplierLeadTimeDays.id,product.minimumOrderQuantity?.id,product.orderMultiple?.id].includes(m.id)).flatMap(m=>m.lineage.evidenceIds))];
  const read=(metric:MetricSnapshot,unit:string):{value:number|null;status:EvidenceStatus;metric:MetricSnapshot|null}=>{
   const source=index.get(metric.id);if(!source)return {value:null,status:"UNVERIFIED",metric:null};
   if(source.status!=="VERIFIED"||source.completeness!=="COMPLETE"||source.quality!=="ACCEPTABLE"||source.asOf!==input.asOf||source.unit!==unit||!source.lineage.evidenceIds.length)
    return {value:null,status:source.status==="VERIFIED"?"NEEDS_REVIEW":source.status,metric:source};
   if((unit==="QUANTITY"&&source.period&&(source.period.from!==input.period.from||source.period.to!==input.period.to))||
      (unit==="DAYS"&&source.period!==null))return {value:null,status:"NEEDS_REVIEW",metric:source};
   const value=numeric(source.value);return value===null||value<0?{value:null,status:"NEEDS_REVIEW",metric:source}:{value,status:"VERIFIED",metric:source};
  };
  const atp=read(product.availableToPromise,"QUANTITY"),rop=read(product.reorderPoint,"QUANTITY"),sold=read(product.soldQuantityWindow,"QUANTITY"),lead=read(product.supplierLeadTimeDays,"DAYS");
  const optional=[product.minimumOrderQuantity?read(product.minimumOrderQuantity,"QUANTITY"):null,product.orderMultiple?read(product.orderMultiple,"QUANTITY"):null];
  const required=[atp,rop,sold,lead],bad=required.find(r=>r.status!=="VERIFIED")??optional.find(r=>r&&r.status!=="VERIFIED");
  if(bad){warnings.push("REQUIRED_OR_CONFIGURED_INPUT_NOT_VERIFIED");return {
   productRef:product.productRef,status:bad.status,action:"WITHHELD",availableToPromise:atp.value,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  if(required.some(r=>r.value===null)||optional.some(r=>r&&r.value===null)){warnings.push("UNKNOWN_INPUT");return {
   productRef:product.productRef,status:"NEEDS_REVIEW",action:"WITHHELD",availableToPromise:atp.value,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  const dailyDemand=(sold.value as number)/periodDays,leadDemand=dailyDemand*(lead.value as number),target=Math.max(rop.value as number,leadDemand);
  let recommended=Math.max(0,target-(atp.value as number));
  const min=optional[0]?.value??0,multiple=optional[1]?.value??null;
  if(min>0&&recommended>0)recommended=Math.max(recommended,min);
  if(multiple!==null&&multiple>0&&recommended>0)recommended=Math.ceil(recommended/multiple)*multiple;
  const safe=[dailyDemand,leadDemand,target,recommended].every(n=>Number.isFinite(n)&&Math.abs(n)<=Number.MAX_SAFE_INTEGER);
  if(!safe){warnings.push("RECOMMENDED_QUANTITY_OVERFLOW");return {
   productRef:product.productRef,status:"NEEDS_REVIEW",action:"WITHHELD",availableToPromise:atp.value,reorderPoint:rop.value,dailyDemand:null,leadTimeDemand:null,targetStock:null,
   recommendedQuantity:null,formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  }}
  return {
   productRef:product.productRef,status:"VERIFIED",action:recommended>0?"RECOMMEND":"NO_ACTION",
   availableToPromise:atp.value,reorderPoint:rop.value,dailyDemand,leadTimeDemand:leadDemand,targetStock:target,recommendedQuantity:recommended,
   formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,evidenceIds,warnings,automaticPurchase:false,
  };
 });
 return {id:input.id,asOf:input.asOf,period:input.period,recommendations};
}
