import {buildEvidencePassport} from "./evidence-passport";
import {decimalToMinorUnits,minorUnitsToNumber} from "./financial-precision";
import type {DataCompleteness,DataQuality,EvidencePeriod,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";

export interface LiquidityAgingBucketInput {bucket:string;amount:MetricSnapshot}
export interface LiquidityForecastFlowInput {
 id:string;direction:"COLLECTION"|"COMMITTED_OBLIGATION";dueOn:string;amount:MetricSnapshot;
}
export interface LiquidityForecastCoverageInput {
 status:EvidenceStatus;completeness:DataCompleteness;quality:DataQuality;
 expectedFlowCount:number;returnedFlowCount:number;truncated:boolean;evidenceIds:string[];
}
export interface LiquidityCurrencyForecastInput {
 coverage:LiquidityForecastCoverageInput;flows:LiquidityForecastFlowInput[];
}
export interface LiquidityCurrencyInput {
 currency:string;availableBalance:MetricSnapshot|null;expectedCollections:MetricSnapshot|null;dueObligations:MetricSnapshot|null;
 overdueReceivables?:MetricSnapshot|null;stagnantStockCost?:MetricSnapshot|null;receivableAging?:LiquidityAgingBucketInput[];
 forecast?:LiquidityCurrencyForecastInput|null;
}

export interface BuildLiquidityInput {id:string;generatedAt:string;asOf:string;period:EvidencePeriod;evidenceRecords:EvidenceRecord[];currencies:LiquidityCurrencyInput[]}
export interface LiquidityLineage {metricIds:string[];evidenceIds:string[];formulaVersions:string[]}
export interface LiquidityMetricEvidence {
 key:string;label:string;metricId:string|null;metricKey:string|null;status:EvidenceStatus;currency:string;
 sourceCurrency:string|null;sourceAsOf:string|null;sourcePeriod:EvidencePeriod|null;calculatedAt:string|null;
 formulaId:string|null;formulaVersion:string|null;evidenceIds:string[];sources:EvidenceRecord[];warnings:string[];
}
export interface LiquidityForecastHorizon {
 days:7|30|90;through:string;status:EvidenceStatus;openingBalance:number|null;expectedCollections:number|null;
 committedObligations:number|null;projectedBalance:number|null;flowCount:number;
 overdueCollections:number;overdueObligations:number;evidenceIds:string[];warnings:string[];
}
export interface LiquidityForecastPosition {
 currency:string;asOf:string;status:EvidenceStatus;horizons:LiquidityForecastHorizon[];warnings:string[];
}
export interface LiquidityPosition {
 currency:string;asOf:string;period:EvidencePeriod;
 /** Status/completeness describe netAvailableLiquidity only; field statuses below govern each component amount. */
 status:EvidenceStatus;completeness:DataCompleteness;
 availableBalance:number|null;availableBalanceStatus:EvidenceStatus;
 expectedCollections:number|null;expectedCollectionsStatus:EvidenceStatus;
 overdueReceivables:number|null;overdueReceivablesStatus:EvidenceStatus;
 dueObligations:number|null;dueObligationsStatus:EvidenceStatus;
 netAvailableLiquidity:number|null;stagnantStockExposure:number|null;stagnantStockExposureStatus:EvidenceStatus;
 receivableAging:Array<{bucket:string;amount:number|null;status:EvidenceStatus;warnings:string[]}>;
 metricEvidence:LiquidityMetricEvidence[];forecast:LiquidityForecastPosition;
 formulaId:string;formulaVersion:string;lineage:LiquidityLineage;warnings:string[];
}
export interface LiquiditySnapshot {id:string;generatedAt:string;asOf:string;period:EvidencePeriod;positions:LiquidityPosition[];warnings:string[]}
interface MetricValue {value:number|null;minorUnits:bigint|null;status:EvidenceStatus;warnings:string[]}
const FORMULA_ID="liquidity.net-available";
const FORMULA_VERSION="1.0.0";
function metricValue(metric:MetricSnapshot|null|undefined,index:Map<string,MetricSnapshot>,currency:string,asOf:string,period:EvidencePeriod,allowNegative=false):MetricValue {
 if(!metric)return {value:null,minorUnits:null,status:"UNAVAILABLE",warnings:["METRIC_NOT_SUPPLIED"]};
 const verified=index.get(metric.id);
 if(!verified)return {value:null,minorUnits:null,status:"UNVERIFIED",warnings:["METRIC_ID_AMBIGUOUS_OR_MISSING"]};
 if(verified.status!=="VERIFIED")return {value:null,minorUnits:null,status:verified.status,warnings:[...verified.warnings,"METRIC_NOT_VERIFIED"]};
 if(verified.unit!=="CURRENCY"||verified.currency!==currency)return {value:null,minorUnits:null,status:"UNVERIFIED",warnings:["CURRENCY_OR_UNIT_MISMATCH"]};
 if(verified.asOf!==asOf)return {value:null,minorUnits:null,status:"NEEDS_REVIEW",warnings:["AS_OF_MISMATCH"]};
 if(!verified.period||verified.period.from!==period.from||verified.period.to!==period.to)return {value:null,minorUnits:null,status:"NEEDS_REVIEW",warnings:["PERIOD_MISMATCH"]};
 const minorUnits=decimalToMinorUnits(verified.value,6,allowNegative);
 if(minorUnits===null)return {value:null,minorUnits:null,status:"NEEDS_REVIEW",warnings:["FINANCIAL_PRECISION_UNSUPPORTED_OR_OVERFLOW"]};
 const value=minorUnitsToNumber(minorUnits,6);
 if(value===null)return {value:null,minorUnits:null,status:"NEEDS_REVIEW",warnings:["FINANCIAL_PRECISION_UNSUPPORTED_OR_OVERFLOW"]};
 return {value,minorUnits,status:"VERIFIED",warnings:[]};
}
function statusOf(values:MetricValue[]):EvidenceStatus {
 if(values.some(v=>v.status==="UNVERIFIED"))return "UNVERIFIED";
 if(values.some(v=>v.status==="NEEDS_REVIEW"))return "NEEDS_REVIEW";
 if(values.some(v=>v.status==="UNAVAILABLE"))return "UNAVAILABLE";
 return "VERIFIED";
}
function allMetricInputs(p:LiquidityCurrencyInput):MetricSnapshot[] {
 return [p.availableBalance,p.expectedCollections,p.dueObligations,p.overdueReceivables,p.stagnantStockCost,
  ...(p.receivableAging??[]).map(x=>x.amount),...(p.forecast?.flows??[]).map(flow=>flow?.amount)]
  .filter((metric):metric is MetricSnapshot=>metric!==null&&metric!==undefined);
}
function buildMetricEvidence(args:{
 key:string;label:string;metric:MetricSnapshot|null|undefined;status:EvidenceStatus;warnings:string[];
 currency:string;index:Map<string,MetricSnapshot>;evidenceRecords:EvidenceRecord[];evidenceCounts:Map<string,number>;
}):LiquidityMetricEvidence {
 const {key,label,metric,status,warnings,currency,index,evidenceRecords,evidenceCounts}=args;
 if(!metric)return {
  key,label,metricId:null,metricKey:null,status,currency,sourceCurrency:null,sourceAsOf:null,sourcePeriod:null,
  calculatedAt:null,formulaId:null,formulaVersion:null,evidenceIds:[],sources:[],
  warnings:[...new Set(warnings)],
 };
 const sourceMetric=index.get(metric.id)??metric;
 const evidenceIds=[...new Set(sourceMetric.lineage?.evidenceIds??[])];
 const sources=evidenceIds.flatMap(id=>{
  if(evidenceCounts.get(id)!==1)return [];
  const record=evidenceRecords.find(item=>item.id===id);
  return record?[record]:[];
 });
 const unresolved=evidenceIds.some(id=>evidenceCounts.get(id)!==1);
 return {
  key,label,metricId:sourceMetric.id,metricKey:sourceMetric.key,status,currency,
  sourceCurrency:sourceMetric.currency??null,sourceAsOf:sourceMetric.asOf??null,
  sourcePeriod:sourceMetric.period??null,calculatedAt:sourceMetric.lineage?.calculatedAt??null,
  formulaId:sourceMetric.lineage?.formulaId??null,formulaVersion:sourceMetric.lineage?.formulaVersion??null,
  evidenceIds,sources,
  warnings:[...new Set([...warnings,...(sourceMetric.warnings??[]),...(unresolved?["SOURCE_EVIDENCE_REFERENCE_UNRESOLVED_OR_AMBIGUOUS"]:[])])],
 };
}
function utcDay(value:string):number|null {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const time=Date.parse(value+"T00:00:00.000Z");
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?time:null;
}
function forecastTimestamp(value:string):number|null {
 if(typeof value!=="string"||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value))return null;
 if(utcDay(value.slice(0,10))===null)return null;
 const parsed=Date.parse(value);return Number.isFinite(parsed)?parsed:null;
}
function forecastStatus(statuses:EvidenceStatus[]):EvidenceStatus {
 if(statuses.includes("UNVERIFIED"))return "UNVERIFIED";
 if(statuses.includes("NEEDS_REVIEW"))return "NEEDS_REVIEW";
 if(statuses.includes("UNAVAILABLE"))return "UNAVAILABLE";
 return "VERIFIED";
}
function readForecastAmount(metric:MetricSnapshot|undefined,index:Map<string,MetricSnapshot>,currency:string,asOf:string):MetricValue {
 if(!metric)return {value:null,minorUnits:null,status:"UNAVAILABLE",warnings:["FORECAST_AMOUNT_NOT_SUPPLIED"]};
 const source=index.get(metric.id);
 if(!source)return {value:null,minorUnits:null,status:"UNVERIFIED",warnings:["FORECAST_AMOUNT_SOURCE_AMBIGUOUS_OR_MISSING"]};
 if(source.status!=="VERIFIED")return {value:null,minorUnits:null,status:source.status,warnings:[...source.warnings,"FORECAST_AMOUNT_NOT_VERIFIED"]};
 if(source.completeness!=="COMPLETE"||source.quality!=="ACCEPTABLE"||!source.lineage.evidenceIds.length)
  return {value:null,minorUnits:null,status:"NEEDS_REVIEW",warnings:["FORECAST_AMOUNT_INCOMPLETE"]};
 if(source.asOf!==asOf||forecastTimestamp(source.asOf)===null||forecastTimestamp(source.lineage.calculatedAt)===null||
   Date.parse(source.lineage.calculatedAt)>Date.parse(asOf))
  return {value:null,minorUnits:null,status:"NEEDS_REVIEW",warnings:["FORECAST_AMOUNT_AS_OF_MISMATCH"]};
 if(source.unit!=="CURRENCY"||source.currency!==currency)
  return {value:null,minorUnits:null,status:"UNVERIFIED",warnings:["FORECAST_AMOUNT_CURRENCY_MISMATCH"]};
 const minorUnits=decimalToMinorUnits(source.value,6);
 const value=minorUnits===null?null:minorUnitsToNumber(minorUnits,6);
 if(minorUnits===null||value===null)return {value:null,minorUnits:null,status:"NEEDS_REVIEW",warnings:["FORECAST_AMOUNT_PRECISION_UNSUPPORTED"]};
 return {value,minorUnits,status:"VERIFIED",warnings:[]};
}
function buildCurrencyForecast(args:{
 currency:string;asOf:string;openingBalance:MetricValue;openingBalanceMetric:MetricSnapshot|null;forecast:LiquidityCurrencyForecastInput|null|undefined;
 index:Map<string,MetricSnapshot>;evidenceRecords:EvidenceRecord[];
}):LiquidityForecastPosition {
 const {currency,asOf,openingBalance,openingBalanceMetric,forecast,index,evidenceRecords}=args;
 const asOfDay=utcDay(asOf.slice(0,10));
 const horizons=[7,30,90] as const;
 const empty=(status:EvidenceStatus,warning:string):LiquidityForecastPosition=>({
  currency,asOf,status,warnings:[warning],horizons:horizons.map(days=>({
   days,through:asOfDay===null?asOf.slice(0,10):new Date(asOfDay+days*86400000).toISOString().slice(0,10),
   status,openingBalance:openingBalance.status==="VERIFIED"?openingBalance.value:null,
   expectedCollections:null,committedObligations:null,projectedBalance:null,flowCount:0,
   overdueCollections:0,overdueObligations:0,evidenceIds:[],warnings:[warning],
  })),
 });
 if(!forecast)return empty("UNAVAILABLE","FORECAST_COVERAGE_NOT_SUPPLIED");
 if(!/^[A-Z]{3}$/.test(currency))return empty("NEEDS_REVIEW","FORECAST_CURRENCY_INVALID");
 if(asOfDay===null||forecastTimestamp(asOf)===null)return empty("NEEDS_REVIEW","FORECAST_AS_OF_INVALID");
 const flows=Array.isArray(forecast.flows)?forecast.flows:[];
 const coverage=forecast.coverage;
 if(!coverage||coverage.status!=="VERIFIED"||coverage.completeness!=="COMPLETE"||coverage.quality!=="ACCEPTABLE"||
   !Number.isSafeInteger(coverage.expectedFlowCount)||coverage.expectedFlowCount<0||
   !Number.isSafeInteger(coverage.returnedFlowCount)||coverage.returnedFlowCount<0||
   coverage.expectedFlowCount!==coverage.returnedFlowCount||coverage.returnedFlowCount!==flows.length||coverage.truncated||
   !Array.isArray(coverage.evidenceIds)||coverage.evidenceIds.length===0||
   new Set(coverage.evidenceIds).size!==coverage.evidenceIds.length||
   coverage.evidenceIds.some(id=>typeof id!=="string"||!id.trim())){
  const status:EvidenceStatus=coverage?.status&&coverage.status!=="VERIFIED"?coverage.status:"NEEDS_REVIEW";
  return empty(status,"FORECAST_COVERAGE_INCOMPLETE_OR_INVALID");
 }
 const recordsById=new Map<string,EvidenceRecord[]>();
 for(const record of evidenceRecords){const list=recordsById.get(record.id)??[];list.push(record);recordsById.set(record.id,list);}
 const coverageRecords=coverage.evidenceIds.map(id=>recordsById.get(id)??[]);
 const coverageEvidenceValid=coverageRecords.every(matches=>matches.length===1&&
  matches[0].status==="VERIFIED"&&matches[0].completeness==="COMPLETE"&&matches[0].quality==="ACCEPTABLE"&&
  matches[0].asOf===asOf&&forecastTimestamp(matches[0].sourceTimestamp)!==null&&
  Date.parse(matches[0].sourceTimestamp)<=Date.parse(asOf)&&matches[0].currency===currency);
 if(!coverageEvidenceValid)return empty("UNVERIFIED","FORECAST_COVERAGE_EVIDENCE_INVALID");
 const flowIdCounts=new Map<string,number>();
 for(const flow of flows){const id=typeof flow?.id==="string"?flow.id.trim():"";if(id)flowIdCounts.set(id,(flowIdCounts.get(id)??0)+1);}
 const duplicateFlowIds=[...flowIdCounts.values()].some(count=>count>1);
 const malformedFlow=flows.some(flow=>!flow||typeof flow.id!=="string"||!flow.id.trim()||
  (flow.direction!=="COLLECTION"&&flow.direction!=="COMMITTED_OBLIGATION")||utcDay(flow.dueOn)===null||
  !flow.amount||typeof flow.amount.id!=="string"||!flow.amount.id.trim());
 if(malformedFlow||duplicateFlowIds)return empty("NEEDS_REVIEW",duplicateFlowIds?"FORECAST_FLOW_ID_DUPLICATED":"FORECAST_FLOW_METADATA_INVALID");
 const normalized=flows.map(flow=>({flow,day:utcDay(flow.dueOn) as number}));
 const overdueCollections=normalized.filter(row=>row.day<asOfDay&&row.flow.direction==="COLLECTION").length;
 const overdueObligations=normalized.filter(row=>row.day<asOfDay&&row.flow.direction==="COMMITTED_OBLIGATION").length;
 const positionWarnings:string[]=[];
 const horizonResults:LiquidityForecastHorizon[]=horizons.map(days=>{
  const throughDay=asOfDay+days*86400000;
  const through=new Date(throughDay).toISOString().slice(0,10);
  const included=normalized.filter(row=>row.day<=throughDay&&
   (row.day>=asOfDay||row.flow.direction==="COMMITTED_OBLIGATION"));
  const amountReads=included.map(row=>({row,amount:readForecastAmount(row.flow.amount,index,currency,asOf)}));
  const bad=amountReads.find(item=>item.amount.status!=="VERIFIED");
  const evidenceIds=[...new Set([...coverage.evidenceIds,...(openingBalanceMetric?.lineage.evidenceIds??[]),
   ...amountReads.flatMap(item=>item.row.flow.amount.lineage?.evidenceIds??[])])];
  const openingOkay=openingBalance.status==="VERIFIED"&&openingBalance.minorUnits!==null;
  if(bad||!openingOkay){
   const warnings=[...new Set([...(bad?.amount.warnings??[]),...(!openingOkay?openingBalance.warnings:[""])].filter(Boolean))];
   const status=forecastStatus([coverage.status,...(bad?[bad.amount.status]:[]),openingBalance.status]);
   positionWarnings.push(...warnings);
   return {days,through,status,openingBalance:openingOkay?openingBalance.value:null,
    expectedCollections:null,committedObligations:null,projectedBalance:null,flowCount:included.length,
    overdueCollections,overdueObligations,evidenceIds,warnings};
  }
  const collections=amountReads.reduce((sum,item)=>item.row.flow.direction==="COLLECTION"?sum+(item.amount.minorUnits??0n):sum,0n);
  const obligations=amountReads.reduce((sum,item)=>item.row.flow.direction==="COMMITTED_OBLIGATION"?sum+(item.amount.minorUnits??0n):sum,0n);
  const projected= (openingBalance.minorUnits as bigint)+collections-obligations;
  const collectionValue=minorUnitsToNumber(collections,6),obligationValue=minorUnitsToNumber(obligations,6),projectedValue=minorUnitsToNumber(projected,6);
  if(collectionValue===null||obligationValue===null||projectedValue===null){
   const warning="FORECAST_ARITHMETIC_OVERFLOW";positionWarnings.push(warning);
   return {days,through,status:"NEEDS_REVIEW",openingBalance:openingBalance.value,expectedCollections:null,
    committedObligations:null,projectedBalance:null,flowCount:included.length,overdueCollections,overdueObligations,
    evidenceIds,warnings:[warning]};
  }
  return {days,through,status:"VERIFIED",openingBalance:openingBalance.value,expectedCollections:collectionValue,
   committedObligations:obligationValue,projectedBalance:projectedValue,flowCount:included.length,
   overdueCollections,overdueObligations,evidenceIds,warnings:[]};
 });
 const status=forecastStatus(horizonResults.map(item=>item.status));
 return {currency,asOf,status,horizons:horizonResults,warnings:[...new Set(positionWarnings)]};
}

/** Computes reconciled liquidity independently by currency; this engine contains no FX conversion. */
export function buildLiquiditySnapshot(input:BuildLiquidityInput):LiquiditySnapshot {
 if(!Number.isFinite(Date.parse(input.generatedAt))||!Number.isFinite(Date.parse(input.asOf)))throw new Error("generatedAt and asOf must be valid timestamps");
 const all=input.currencies.flatMap(allMetricInputs);
 const passport=buildEvidencePassport({id:"liquidity:"+input.asOf,generatedAt:input.generatedAt,asOf:input.asOf,evidenceRecords:input.evidenceRecords,metrics:all});
 const idCounts=new Map<string,number>();for(const m of passport.metrics)idCounts.set(m.id,(idCounts.get(m.id)??0)+1);
 const index=new Map<string,MetricSnapshot>();for(const m of passport.metrics)if(idCounts.get(m.id)===1)index.set(m.id,m);
 const evidenceCounts=new Map<string,number>();for(const record of input.evidenceRecords)evidenceCounts.set(record.id,(evidenceCounts.get(record.id)??0)+1);
 const currencyCounts=new Map<string,number>();for(const p of input.currencies)currencyCounts.set(p.currency,(currencyCounts.get(p.currency)??0)+1);
 const warnings:string[]=[];
 const positions=input.currencies.map(position=>{
  const duplicate=(currencyCounts.get(position.currency)??0)>1;
  const available=metricValue(position.availableBalance,index,position.currency,input.asOf,input.period,true);
  const collections=metricValue(position.expectedCollections,index,position.currency,input.asOf,input.period);
  const obligations=metricValue(position.dueObligations,index,position.currency,input.asOf,input.period);
  const required=[available,collections,obligations],baseStatus=statusOf(required);
  const netMinorUnits=!duplicate&&baseStatus==="VERIFIED"&&available.minorUnits!==null&&collections.minorUnits!==null&&obligations.minorUnits!==null
   ?available.minorUnits+collections.minorUnits-obligations.minorUnits:null;
  const net=netMinorUnits===null?null:minorUnitsToNumber(netMinorUnits,6);
  const arithmeticUnsafe=netMinorUnits!==null&&net===null;
  const status:EvidenceStatus=arithmeticUnsafe?"NEEDS_REVIEW":duplicate&&baseStatus==="VERIFIED"?"NEEDS_REVIEW":baseStatus;
  const overdue=metricValue(position.overdueReceivables,index,position.currency,input.asOf,input.period);
  const stock=metricValue(position.stagnantStockCost,index,position.currency,input.asOf,input.period);
  const aging=(position.receivableAging??[]).map(item=>{
   const value=metricValue(item.amount,index,position.currency,input.asOf,input.period);
   return {bucket:item.bucket,amount:value.value,status:value.status,warnings:value.warnings};
  });
  const metricEvidence=[
   buildMetricEvidence({key:"availableBalance",label:"الرصيد النقدي/المصرفي المتاح",metric:position.availableBalance,status:available.status,warnings:available.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   buildMetricEvidence({key:"expectedCollections",label:"التحصيلات المتوقعة",metric:position.expectedCollections,status:collections.status,warnings:collections.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   buildMetricEvidence({key:"dueObligations",label:"الالتزامات المستحقة",metric:position.dueObligations,status:obligations.status,warnings:obligations.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   buildMetricEvidence({key:"overdueReceivables",label:"الذمم المتأخرة",metric:position.overdueReceivables,status:overdue.status,warnings:overdue.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   buildMetricEvidence({key:"stagnantStockCost",label:"تكلفة المخزون الراكد المثبتة",metric:position.stagnantStockCost,status:stock.status,warnings:stock.warnings,currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts}),
   ...(position.receivableAging??[]).map((item,i)=>buildMetricEvidence({
    key:"receivableAging:"+i,label:"أعمار الذمم · "+item.bucket,metric:item.amount,status:aging[i].status,warnings:aging[i].warnings,
    currency:position.currency,index,evidenceRecords:passport.evidenceRecords,evidenceCounts,
   })),
  ];
  const metricList=allMetricInputs(position),metricIds=[...new Set(metricList.map(m=>m.id))];
  const evidenceIds=[...new Set(metricList.flatMap(m=>m.lineage.evidenceIds))];
  const formulaVersions=[...new Set(metricList.map(m=>m.lineage.formulaId+"@"+m.lineage.formulaVersion))];
  const positionWarnings=[
   ...(duplicate?["DUPLICATE_CURRENCY_POSITION"]:[]),...(arithmeticUnsafe?["LIQUIDITY_ARITHMETIC_OVERFLOW"]:[]),
   ...available.warnings,...collections.warnings,...obligations.warnings,
   ...overdue.warnings,...stock.warnings,...aging.flatMap((a,i)=>a.status==="VERIFIED"?[]:["AGING_BUCKET_"+(i+1)+"_NOT_VERIFIED"]),
  ];
  warnings.push(...positionWarnings.map(w=>position.currency+":"+w));
  return {
   currency:position.currency,asOf:input.asOf,period:input.period,status,completeness:status==="VERIFIED"?"COMPLETE" as const:"PARTIAL" as const,
   availableBalance:available.value,availableBalanceStatus:available.status,
   expectedCollections:collections.value,expectedCollectionsStatus:collections.status,
   overdueReceivables:overdue.value,overdueReceivablesStatus:overdue.status,
   dueObligations:obligations.value,dueObligationsStatus:obligations.status,
   netAvailableLiquidity:duplicate?null:net,stagnantStockExposure:stock.value,stagnantStockExposureStatus:stock.status,
   receivableAging:aging,metricEvidence,
   forecast:buildCurrencyForecast({currency:position.currency,asOf:input.asOf,openingBalance:available,
    openingBalanceMetric:position.availableBalance,forecast:position.forecast,index,evidenceRecords:passport.evidenceRecords}),
   formulaId:FORMULA_ID,formulaVersion:FORMULA_VERSION,lineage:{metricIds,evidenceIds,formulaVersions},warnings:positionWarnings,
  };
 });
 return {id:input.id,generatedAt:input.generatedAt,asOf:input.asOf,period:input.period,positions,warnings:[...new Set(warnings)]};
}
