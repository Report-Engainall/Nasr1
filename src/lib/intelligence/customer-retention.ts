import {buildEvidencePassport} from "./evidence-passport";
import type {EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export interface CustomerRetentionRecord {
 customerRef:string;currency:string;ordersCurrentPeriod:MetricSnapshot;ordersPreviousPeriod:MetricSnapshot;salesCurrentPeriod:MetricSnapshot;lastOrderAt:string|null;
}
export interface CustomerRetentionCoverage {
 status:EvidenceStatus;completeness:"COMPLETE"|"PARTIAL"|"UNKNOWN";quality:"ACCEPTABLE"|"WARNINGS"|"INVALID"|"UNKNOWN";
 expectedCustomerCount:number;returnedCustomerCount:number;truncated:boolean;evidenceIds:string[];
}
export interface CustomerRetentionReport {
 id:string;asOf:string;period:EvidencePeriod;previousPeriod:EvidencePeriod;status:EvidenceStatus;
 population:{total:number;activeCurrentPeriod:number;priorPeriodCohort:number;retainedCustomers:number;repeatPurchaseCustomers:number};
 retentionRate:number|null;repeatPurchaseRate:number|null;averageOrdersPerActiveCustomer:number|null;
 activity:{active30Days:number;cooling31To60Days:number;atRisk61To90Days:number;inactiveOver90Days:number;noOrderDate:number};
 focusByCurrency:Array<{currency:string;totalSales:number|null;top5SalesConcentration:number|null;customerCount:number;status:EvidenceStatus}>;
 customers:Array<{customerRef:string;currency:string;orderCountCurrent:number|null;orderCountPrevious:number|null;lastOrderAt:string|null;daysSinceLastOrder:number|null;activity:"ACTIVE"|"COOLING"|"AT_RISK"|"INACTIVE"|"NO_ORDER_DATE"|"UNKNOWN";repeatCustomer:boolean|null;status:EvidenceStatus}>;
 warnings:string[];
}
function day(value:string):number|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;const t=Date.parse(value+"T00:00:00.000Z");
 return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===value?t:null;
}
function num(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string"||! /^\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const n=Number(value);return Number.isFinite(n)&&n<=Number.MAX_SAFE_INTEGER?n:null;
}
/** Requires the complete server aggregate; first-page or truncated customer lists are rejected. */
export function buildCustomerRetentionReport(input:{
 id:string;asOf:string;period:EvidencePeriod;previousPeriod:EvidencePeriod;evidenceRecords:EvidenceRecord[];
 coverage:CustomerRetentionCoverage;customers:CustomerRetentionRecord[];
}):CustomerRetentionReport {
 const currentDay=day(input.asOf.slice(0,10));if(currentDay===null)throw new Error("asOf must contain an ISO day");
 const {coverage}=input;
 const uniqueRefs=new Set(input.customers.map(c=>c.customerRef+"|"+c.currency));
 const fullCoverage=coverage.status==="VERIFIED"&&coverage.completeness==="COMPLETE"&&coverage.quality==="ACCEPTABLE"&&
  !coverage.truncated&&coverage.expectedCustomerCount===coverage.returnedCustomerCount&&coverage.returnedCustomerCount===input.customers.length&&
  uniqueRefs.size===input.customers.length&&coverage.evidenceIds.length>0&&coverage.evidenceIds.every(id=>input.evidenceRecords.some(e=>e.id===id&&e.status==="VERIFIED"&&e.completeness==="COMPLETE"&&e.quality==="ACCEPTABLE"));
 const metrics=input.customers.flatMap(c=>[c.ordersCurrentPeriod,c.ordersPreviousPeriod,c.salesCurrentPeriod]);
 const passport=buildEvidencePassport({id:"retention:"+input.asOf,generatedAt:input.asOf,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics});
 const idCounts=new Map<string,number>();for(const m of passport.metrics)idCounts.set(m.id,(idCounts.get(m.id)??0)+1);
 const index=new Map<string,MetricSnapshot>();for(const m of passport.metrics)if(idCounts.get(m.id)===1)index.set(m.id,m);
 const mapped=input.customers.map(c=>{
  const current=index.get(c.ordersCurrentPeriod.id),previous=index.get(c.ordersPreviousPeriod.id),sales=index.get(c.salesCurrentPeriod.id);
  const value=(m:MetricSnapshot|undefined,unit:string,period:EvidencePeriod):number|null=>{
   if(!m||m.status!=="VERIFIED"||m.completeness!=="COMPLETE"||m.quality!=="ACCEPTABLE"||m.unit!==unit||m.asOf!==input.asOf||!m.lineage.evidenceIds.length)return null;
   if(!m.period||m.period.from!==period.from||m.period.to!==period.to)return null;
   if(unit==="CURRENCY"&&m.currency!==c.currency)return null;
   return num(m.value);
  };
  const currentCount=value(current,"COUNT",input.period),previousCount=value(previous,"COUNT",input.previousPeriod),salesValue=value(sales,"CURRENCY",input.period);
  const time=c.lastOrderAt?Date.parse(c.lastOrderAt):null,age=time!==null&&Number.isFinite(time)?Math.floor((currentDay-new Date(time).setUTCHours(0,0,0,0))/86400000):null;
  let activity:CustomerRetentionReport["customers"][number]["activity"]="UNKNOWN";
  if(age!==null&&age>=0)activity=age<=30?"ACTIVE":age<=60?"COOLING":age<=90?"AT_RISK":"INACTIVE";
  else if(c.lastOrderAt===null)activity="NO_ORDER_DATE";
  const good=currentCount!==null&&previousCount!==null&&salesValue!==null&&activity!=="UNKNOWN";
  return {customerRef:c.customerRef,currency:c.currency,orderCountCurrent:currentCount,orderCountPrevious:previousCount,lastOrderAt:c.lastOrderAt,
   daysSinceLastOrder:age,activity,repeatCustomer:currentCount===null?null:currentCount>=2,status:good?"VERIFIED":"NEEDS_REVIEW",salesValue};
 });
 const active=mapped.filter(c=>(c.orderCountCurrent??0)>0),prior=mapped.filter(c=>(c.orderCountPrevious??0)>0);
 const retained=prior.filter(c=>(c.orderCountCurrent??0)>0);
 const repeat=active.filter(c=>(c.orderCountCurrent??0)>=2);
 const status:EvidenceStatus=fullCoverage&&mapped.every(c=>c.status==="VERIFIED")?"VERIFIED":"NEEDS_REVIEW";
 const focusCurrencies=[...new Set(input.customers.map(c=>c.currency))];
 const focusByCurrency=focusCurrencies.map(currency=>{
  const group=mapped.filter(c=>c.currency===currency),verified=group.every(c=>c.status==="VERIFIED")&&fullCoverage;
  const total=group.reduce((sum,c)=>sum+(c.salesValue??0),0);
  const top=group.map(c=>c.salesValue).sort((a,b)=>(b??0)-(a??0)).slice(0,5);
  return {currency,totalSales:verified?total:null,top5SalesConcentration:verified&&total>0?top.reduce((sum,v)=>sum+(v??0),0)/total*100:verified?0:null,customerCount:group.length,status:verified?"VERIFIED" as const:"NEEDS_REVIEW" as const};
 });
 const activityCount=(name:CustomerRetentionReport["customers"][number]["activity"])=>mapped.filter(c=>c.activity===name).length;
 const warnings:string[]=[];
 if(!fullCoverage)warnings.push("FULL_CUSTOMER_AGGREGATE_NOT_VERIFIED");
 if(mapped.some(c=>c.status!=="VERIFIED"))warnings.push("CUSTOMER_METRIC_EVIDENCE_INCOMPLETE");
 return {
  id:input.id,asOf:input.asOf,period:input.period,previousPeriod:input.previousPeriod,status,
  population:{total:status==="VERIFIED"?mapped.length:coverage.returnedCustomerCount,activeCurrentPeriod:status==="VERIFIED"?active.length:0,
   priorPeriodCohort:status==="VERIFIED"?prior.length:0,retainedCustomers:status==="VERIFIED"?retained.length:0,repeatPurchaseCustomers:status==="VERIFIED"?repeat.length:0},
  retentionRate:status==="VERIFIED"&&prior.length>0?retained.length/prior.length*100:null,
  repeatPurchaseRate:status==="VERIFIED"&&active.length>0?repeat.length/active.length*100:null,
  averageOrdersPerActiveCustomer:status==="VERIFIED"&&active.length>0?active.reduce((sum,c)=>sum+(c.orderCountCurrent??0),0)/active.length:null,
  activity:{active30Days:activityCount("ACTIVE"),cooling31To60Days:activityCount("COOLING"),atRisk61To90Days:activityCount("AT_RISK"),inactiveOver90Days:activityCount("INACTIVE"),noOrderDate:activityCount("NO_ORDER_DATE")},
  focusByCurrency,customers:mapped.map(({salesValue,...customer})=>customer),warnings,
 };
}
