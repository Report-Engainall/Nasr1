import {buildEvidencePassport} from "./evidence-passport";
import {decimalToMinorUnits,minorUnitsToNumber,roundedPercentageHundredths} from "./financial-precision";
import type {EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export interface CustomerRetentionRecord {
 customerRef:string;ordersCurrentPeriod:MetricSnapshot;ordersPreviousPeriod:MetricSnapshot;lastOrderAt:string|null;
}
export interface CustomerRetentionSaleRecord {customerRef:string;currency:string;sales:MetricSnapshot}
export interface CustomerRetentionCoverage {
 status:EvidenceStatus;completeness:"COMPLETE"|"PARTIAL"|"UNKNOWN";quality:"ACCEPTABLE"|"WARNINGS"|"INVALID"|"UNKNOWN";
 expectedCustomerCount:number;returnedCustomerCount:number;expectedSalesRecordCount:number;returnedSalesRecordCount:number;
 truncated:boolean;evidenceIds:string[];
}
export interface CustomerRetentionReport {
 id:string;asOf:string;period:EvidencePeriod;previousPeriod:EvidencePeriod;status:EvidenceStatus;
 population:{total:number|null;activeCurrentPeriod:number|null;priorPeriodCohort:number|null;retainedCustomers:number|null;repeatPurchaseCustomers:number|null};
 retentionRate:number|null;repeatPurchaseRate:number|null;averageOrdersPerActiveCustomer:number|null;
 activity:{active30Days:number|null;cooling31To60Days:number|null;atRisk61To90Days:number|null;inactiveOver90Days:number|null;noOrderDate:number|null};
 focusByCurrency:Array<{currency:string;totalSales:number|null;top5SalesConcentration:number|null;customerCount:number;status:EvidenceStatus}>;
 customers:Array<{customerRef:string;orderCountCurrent:number|null;orderCountPrevious:number|null;lastOrderAt:string|null;daysSinceLastOrder:number|null;activity:"ACTIVE"|"COOLING"|"AT_RISK"|"INACTIVE"|"NO_ORDER_DATE"|"UNKNOWN";repeatCustomer:boolean|null;status:EvidenceStatus;evidenceIds:string[]}>;
 warnings:string[];
}
function day(value:string):number|null {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const time=Date.parse(value+"T00:00:00.000Z");
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}
function timestamp(value:string):number|null {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 if(day(value.slice(0,10))===null)return null;
 const parsed=Date.parse(value);
 return Number.isFinite(parsed)?parsed:null;
}
function num(value:number|string|null):number|null {
 if(typeof value==="number")return Number.isFinite(value)&&value>=0&&value<=Number.MAX_SAFE_INTEGER?value:null;
 if(typeof value!=="string"||! /^\d+(?:\.\d+)?$/.test(value.trim()))return null;
 const result=Number(value);return Number.isFinite(result)&&result<=Number.MAX_SAFE_INTEGER?result:null;
}
function coverageSafeInteger(value:number):boolean {return Number.isSafeInteger(value)&&value>=0;}

/** Uses unique customer records for retention counts and separate currency rows for sales focus. */
export function buildCustomerRetentionReport(input:{
 id:string;asOf:string;period:EvidencePeriod;previousPeriod:EvidencePeriod;evidenceRecords:EvidenceRecord[];
 coverage:CustomerRetentionCoverage;customers:CustomerRetentionRecord[];salesByCurrency:CustomerRetentionSaleRecord[];
}):CustomerRetentionReport {
 const asOfTime=timestamp(input.asOf);
 if(asOfTime===null)throw new Error("asOf must be a valid ISO timestamp");
 const asOfDay=new Date(asOfTime).setUTCHours(0,0,0,0);
 const customerRefs=input.customers.map(c=>c.customerRef);
 const uniqueCustomers=new Set(customerRefs);
 const uniqueSales=new Set(input.salesByCurrency.map(s=>JSON.stringify([s.customerRef,s.currency])));
 const customerPopulationValid=customerRefs.every(ref=>typeof ref==="string"&&ref.trim().length>0);
 const salesRowsValid=input.salesByCurrency.every(s=>typeof s.customerRef==="string"&&s.customerRef.trim().length>0&&
  typeof s.currency==="string"&&s.currency.trim().length>0&&uniqueCustomers.has(s.customerRef));
 const countsValid=[coverageSafeInteger(input.coverage.expectedCustomerCount),coverageSafeInteger(input.coverage.returnedCustomerCount),
  coverageSafeInteger(input.coverage.expectedSalesRecordCount),coverageSafeInteger(input.coverage.returnedSalesRecordCount)].every(Boolean);
 const coverage=input.coverage;
 const coverageEvidenceIds=coverage.evidenceIds;
 const coverageEvidenceMap=new Map<string,EvidenceRecord[]>();
 for(const e of input.evidenceRecords){const group=coverageEvidenceMap.get(e.id)??[];group.push(e);coverageEvidenceMap.set(e.id,group);}
 const coverageEvidenceValid=coverageEvidenceIds.length>0&&new Set(coverageEvidenceIds).size===coverageEvidenceIds.length&&
  Number.isFinite(asOfTime)&&coverageEvidenceIds.every(id=>{
   const matches=coverageEvidenceMap.get(id)??[];
   const sourceTime=matches.length===1?timestamp(matches[0].sourceTimestamp):null;
   return matches.length===1&&matches[0].status==="VERIFIED"&&matches[0].completeness==="COMPLETE"&&matches[0].quality==="ACCEPTABLE"&&
    matches[0].asOf===input.asOf&&sourceTime!==null&&sourceTime<=asOfTime;
  });
 const fullCoverage=coverage.status==="VERIFIED"&&coverage.completeness==="COMPLETE"&&coverage.quality==="ACCEPTABLE"&&!coverage.truncated&&countsValid&&
  customerPopulationValid&&salesRowsValid&&coverage.expectedCustomerCount===coverage.returnedCustomerCount&&
  coverage.returnedCustomerCount===input.customers.length&&uniqueCustomers.size===input.customers.length&&
  coverage.expectedSalesRecordCount===coverage.returnedSalesRecordCount&&coverage.returnedSalesRecordCount===input.salesByCurrency.length&&
  uniqueSales.size===input.salesByCurrency.length&&coverageEvidenceValid;
 const metrics=[...input.customers.flatMap(c=>[c.ordersCurrentPeriod,c.ordersPreviousPeriod]),...input.salesByCurrency.map(s=>s.sales)];
 const passport=buildEvidencePassport({id:"retention:"+input.asOf,generatedAt:input.asOf,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics});
 const counts=new Map<string,number>();for(const metric of passport.metrics)counts.set(metric.id,(counts.get(metric.id)??0)+1);
 const index=new Map<string,MetricSnapshot>();for(const metric of passport.metrics)if(counts.get(metric.id)===1)index.set(metric.id,metric);
 const read=(metric:MetricSnapshot|undefined,unit:string,period:EvidencePeriod,currency?:string):number|null=>{
  if(!metric)return null;
  const source=index.get(metric.id);
  const calculatedAt=source?timestamp(source.lineage.calculatedAt):null;
  if(!source||source.status!=="VERIFIED"||source.completeness!=="COMPLETE"||source.quality!=="ACCEPTABLE"||source.unit!==unit||
   source.asOf!==input.asOf||calculatedAt===null||calculatedAt>asOfTime||!source.lineage.evidenceIds.length)return null;
  if(!source.period||source.period.from!==period.from||source.period.to!==period.to)return null;
  if(unit==="CURRENCY"&&source.currency!==currency)return null;
  const value=num(source.value);
  return value===null||(unit==="COUNT"&&!Number.isSafeInteger(value))?null:value;
 };
 const mapped=input.customers.map(customer=>{
  const current=read(customer.ordersCurrentPeriod,"COUNT",input.period),previous=read(customer.ordersPreviousPeriod,"COUNT",input.previousPeriod);
  const rawTime=customer.lastOrderAt?timestamp(customer.lastOrderAt):null;
  const lastDay=rawTime!==null?new Date(rawTime).setUTCHours(0,0,0,0):null;
  const age=lastDay!==null?Math.floor((asOfDay-lastDay)/86400000):null;
  let activity:CustomerRetentionReport["customers"][number]["activity"]="UNKNOWN";
  if(age!==null&&age>=0)activity=age<=30?"ACTIVE":age<=60?"COOLING":age<=90?"AT_RISK":"INACTIVE";
  else if(customer.lastOrderAt===null&&current===0&&previous===0)activity="NO_ORDER_DATE";
  const evidenceIds=[...new Set([customer.ordersCurrentPeriod,customer.ordersPreviousPeriod]
   .flatMap(metric=>index.get(metric.id)?.lineage.evidenceIds??[]))];
  return {customerRef:customer.customerRef,orderCountCurrent:current,orderCountPrevious:previous,lastOrderAt:customer.lastOrderAt,
   daysSinceLastOrder:age,activity,repeatCustomer:current===null?null:current>=2,
   status:current!==null&&previous!==null&&activity!=="UNKNOWN"&&evidenceIds.length>0?"VERIFIED" as const:"NEEDS_REVIEW" as const,
   evidenceIds};
 });
 const saleRows=input.salesByCurrency.map(sale=>{
  const numericValue=read(sale.sales,"CURRENCY",input.period,sale.currency);
  const source=index.get(sale.sales.id);
  const minorUnits=numericValue===null||!source?null:decimalToMinorUnits(source.value,2,true);
  const value=minorUnits===null?null:minorUnitsToNumber(minorUnits,2);
  return {customerRef:sale.customerRef,currency:sale.currency,value,minorUnits,precisionInvalid:numericValue!==null&&minorUnits===null};
 });
 const allCustomerMetricsValid=mapped.every(customer=>customer.status==="VERIFIED");
 const active=mapped.filter(c=>(c.orderCountCurrent??0)>0);
 const prior=mapped.filter(c=>(c.orderCountPrevious??0)>0);
 const retained=prior.filter(c=>(c.orderCountCurrent??0)>0);
 const repeat=active.filter(c=>(c.orderCountCurrent??0)>=2);
 const currencies=[...new Set(saleRows.map(s=>s.currency))];
 const focusByCurrency=currencies.map(currency=>{
  const group=saleRows.filter(s=>s.currency===currency);
  const knownRows=group.every(s=>s.minorUnits!==null);
  const totalMinor=knownRows?group.reduce((sum,s)=>sum+(s.minorUnits??0n),0n):null;
  const total=totalMinor===null?null:minorUnitsToNumber(totalMinor,2);
  const valid=fullCoverage&&knownRows&&total!==null;
  const topMinor=knownRows?group.map(s=>s.minorUnits as bigint).sort((a,b)=>a===b?0:a>b?-1:1).slice(0,5).reduce((sum,v)=>sum+v,0n):null;
  const concentrationHundredths=valid&&totalMinor!==null&&totalMinor>0n&&topMinor!==null
   ?roundedPercentageHundredths(topMinor,totalMinor):null;
  return {currency,totalSales:valid?total:null,
   top5SalesConcentration:valid&&totalMinor===0n?0:concentrationHundredths===null?null:Number(concentrationHundredths)/100,
   customerCount:new Set(group.map(s=>s.customerRef)).size,status:valid?"VERIFIED" as const:"NEEDS_REVIEW" as const};
 });
 const allSalesMetricsValid=saleRows.every(sale=>sale.minorUnits!==null)&&focusByCurrency.every(group=>group.status==="VERIFIED");
 const status:EvidenceStatus=fullCoverage&&allCustomerMetricsValid&&allSalesMetricsValid?"VERIFIED":"NEEDS_REVIEW";
 const activeOrderTotal=active.reduce((sum,customer)=>sum+BigInt(customer.orderCountCurrent??0),0n);
 const averageOrdersPerActiveCustomer=status==="VERIFIED"&&active.length>0&&activeOrderTotal<=BigInt(Number.MAX_SAFE_INTEGER)
  ?Number(activeOrderTotal)/active.length:null;
 const countActivity=(activity:CustomerRetentionReport["customers"][number]["activity"])=>status==="VERIFIED"?mapped.filter(c=>c.activity===activity).length:null;
 const warnings:string[]=[];
 if(!fullCoverage)warnings.push("FULL_CUSTOMER_AGGREGATE_NOT_VERIFIED");
 if(mapped.some(customer=>customer.orderCountCurrent===null||customer.orderCountPrevious===null))warnings.push("CUSTOMER_COUNT_METRIC_INVALID_OR_UNVERIFIED");
 if(saleRows.some(sale=>sale.precisionInvalid))warnings.push("CUSTOMER_CURRENCY_PRECISION_INVALID");
 if(focusByCurrency.some(group=>group.totalSales===null&&group.status!=="NEEDS_REVIEW"||group.status==="NEEDS_REVIEW"&&saleRows.some(sale=>sale.currency===group.currency&&sale.minorUnits!==null)))warnings.push("CUSTOMER_CURRENCY_TOTAL_UNAVAILABLE_OR_OVERFLOW");
 if(!allCustomerMetricsValid||!allSalesMetricsValid)warnings.push("CUSTOMER_METRIC_EVIDENCE_INCOMPLETE");
 if(active.length>0&&activeOrderTotal>BigInt(Number.MAX_SAFE_INTEGER))warnings.push("CUSTOMER_ORDER_COUNT_AGGREGATE_OVERFLOW");
 return {
  id:input.id,asOf:input.asOf,period:input.period,previousPeriod:input.previousPeriod,status,
  population:{total:status==="VERIFIED"?mapped.length:null,activeCurrentPeriod:status==="VERIFIED"?active.length:null,
   priorPeriodCohort:status==="VERIFIED"?prior.length:null,retainedCustomers:status==="VERIFIED"?retained.length:null,repeatPurchaseCustomers:status==="VERIFIED"?repeat.length:null},
  retentionRate:status==="VERIFIED"&&prior.length>0?retained.length/prior.length*100:null,
  repeatPurchaseRate:status==="VERIFIED"&&active.length>0?repeat.length/active.length*100:null,
  averageOrdersPerActiveCustomer,
  activity:{active30Days:countActivity("ACTIVE"),cooling31To60Days:countActivity("COOLING"),atRisk61To90Days:countActivity("AT_RISK"),inactiveOver90Days:countActivity("INACTIVE"),noOrderDate:countActivity("NO_ORDER_DATE")},
  focusByCurrency,customers:mapped,warnings,
 };
}

export type CustomerRetentionActionPriority = "HIGH" | "MEDIUM" | "REVIEW";
export type CustomerRetentionActionKind =
  | "REACTIVATE"
  | "PREVENT_CHURN"
  | "REENGAGE"
  | "VERIFY_ORDER_HISTORY";

export interface CustomerRetentionAction {
  customerRef: string;
  priority: CustomerRetentionActionPriority;
  action: CustomerRetentionActionKind;
  activity: CustomerRetentionReport["customers"][number]["activity"];
  daysSinceLastOrder: number | null;
  lastOrderAt: string | null;
  orderCountCurrent: number;
  orderCountPrevious: number;
  reason: string;
  evidenceIds: string[];
}

export interface CustomerRetentionActionQueue {
  status: EvidenceStatus;
  actions: CustomerRetentionAction[];
  totalActionable: number;
  omittedCount: number;
  withheldCustomerCount: number;
  warnings: string[];
}

/**
 * Converts a fully verified customer cohort into an explainable follow-up queue.
 * It ranks recency risk only; it never invents customer lifetime value or recovery revenue.
 */
export function buildCustomerRetentionActionQueue(
  report: CustomerRetentionReport,
  limit = 50,
): CustomerRetentionActionQueue {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new RangeError("Customer retention action limit must be an integer from 1 through 200.");
  }

  if (report.status !== "VERIFIED") {
    return {
      status: report.status,
      actions: [],
      totalActionable: 0,
      omittedCount: 0,
      withheldCustomerCount: report.customers.length,
      warnings: ["CUSTOMER_RETENTION_POPULATION_NOT_VERIFIED"],
    };
  }

  const actions: CustomerRetentionAction[] = [];
  let withheldCustomerCount = 0;

  for (const customer of report.customers) {
    if (
      customer.status !== "VERIFIED" ||
      !customer.evidenceIds.length ||
      !Number.isSafeInteger(customer.orderCountCurrent) ||
      customer.orderCountCurrent === null ||
      !Number.isSafeInteger(customer.orderCountPrevious) ||
      customer.orderCountPrevious === null
    ) {
      withheldCustomerCount += 1;
      continue;
    }

    const shared = {
      customerRef: customer.customerRef,
      activity: customer.activity,
      daysSinceLastOrder: customer.daysSinceLastOrder,
      lastOrderAt: customer.lastOrderAt,
      orderCountCurrent: customer.orderCountCurrent,
      orderCountPrevious: customer.orderCountPrevious,
      evidenceIds: customer.evidenceIds,
    };

    switch (customer.activity) {
      case "INACTIVE":
        actions.push({
          ...shared,
          priority: "HIGH",
          action: "REACTIVATE",
          reason: "لم يظهر طلب منذ أكثر من 90 يوماً؛ راجع سبب الانقطاع قبل تقديم عرض استعادة.",
        });
        break;
      case "AT_RISK":
        actions.push({
          ...shared,
          priority: "HIGH",
          action: "PREVENT_CHURN",
          reason: "لم يظهر طلب منذ 61 إلى 90 يوماً؛ تواصل للتحقق من سبب تراجع النشاط.",
        });
        break;
      case "COOLING":
        actions.push({
          ...shared,
          priority: "MEDIUM",
          action: "REENGAGE",
          reason: "لم يظهر طلب منذ 31 إلى 60 يوماً؛ أعد التفاعل قبل انتقال العميل إلى شريحة الخطر.",
        });
        break;
      case "NO_ORDER_DATE":
        actions.push({
          ...shared,
          priority: "REVIEW",
          action: "VERIFY_ORDER_HISTORY",
          reason: "لا يوجد تاريخ طلب والعدادان الحالي والسابق صفر؛ تحقق من سجل العميل قبل تصنيفه كعميل خامل.",
        });
        break;
      case "ACTIVE":
        break;
      case "UNKNOWN":
        withheldCustomerCount += 1;
        break;
    }
  }

  const priorityOrder: Record<CustomerRetentionActionPriority, number> = {
    HIGH: 0,
    MEDIUM: 1,
    REVIEW: 2,
  };
  actions.sort((left, right) =>
    priorityOrder[left.priority] - priorityOrder[right.priority] ||
    (right.daysSinceLastOrder ?? -1) - (left.daysSinceLastOrder ?? -1) ||
    left.customerRef.localeCompare(right.customerRef)
  );

  return {
    status: withheldCustomerCount === 0 ? "VERIFIED" : "NEEDS_REVIEW",
    actions: actions.slice(0, limit),
    totalActionable: actions.length,
    omittedCount: Math.max(0, actions.length - limit),
    withheldCustomerCount,
    warnings: withheldCustomerCount > 0 ? ["CUSTOMER_ACTION_ROWS_WITHHELD"] : [],
  };
}
