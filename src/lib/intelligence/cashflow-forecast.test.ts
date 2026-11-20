import {describe,expect,it} from "vitest";
import {buildCashflowForecast} from "./cashflow-forecast";
import type {CashflowScheduledEntry} from "./cashflow-forecast";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z";
const evidence=(id:string,currency:string):EvidenceRecord=>({id,source:{kind:"RPC",name:"finance.cash_schedule",version:"v1"},sourceTimestamp:asOf,asOf,period:null,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,key:string,value:number,currency:string):MetricSnapshot=>({id,key,value,unit:"CURRENCY",currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period:null,asOf,lineage:{evidenceIds:[id],calculatedAt:asOf,formulaId:key,formulaVersion:"1.0",transformations:[]},warnings:[]});
const entry=(id:string,direction:"INFLOW"|"OUTFLOW",dueDate:string,value:number,currency="YER"):CashflowScheduledEntry=>({id,direction,dueDate,amount:metric(id,id,value,currency)});
const base=(entries:CashflowScheduledEntry[]=[])=>({id:"f",generatedAt:asOf,asOf,evidenceRecords:[evidence("open","YER"),...entries.map(e=>e.amount).map(m=>evidence(m.id,m.currency??""))],openingBalances:[metric("open","cash.opening",100,"YER")],entries,scheduleStatus:"VERIFIED" as const,scheduleCompleteness:"COMPLETE" as const,scheduleQuality:"ACCEPTABLE" as const});
describe("scheduled cash-flow forecast",()=>{
 it("calculates the 7/30/90-day windows from actual dated events only",()=>{
  const r=buildCashflowForecast(base([entry("a","INFLOW","2026-11-01",20),entry("b","OUTFLOW","2026-11-05",5),entry("c","INFLOW","2026-11-20",10),entry("d","OUTFLOW","2026-12-01",5),entry("e","INFLOW","2026-12-20",7)]));
  // Each forecast window is [asOf, asOf + horizonDays); the Dec 1 payment is outside the 30-day window.
  expect(r.points.map(p=>[p.horizonDays,p.projectedBalance])).toEqual([[7,115],[30,125],[90,127]]);
  expect(r.points.every(point=>point.formulaVersion==="1.1.0")).toBe(true);
 });
 it("keeps currency groups separate",()=>{
  const usd=metric("usd-open","cash.opening",100,"USD"),usdIn=entry("usd-in","INFLOW","2026-11-01",15,"USD");
  const r=buildCashflowForecast({...base([usdIn]),openingBalances:[metric("open","cash.opening",100,"YER"),usd],evidenceRecords:[evidence("open","YER"),evidence("usd-open","USD"),evidence("usd-in","USD")]});
  expect(r.points.every(p=>p.projectedBalance===null)).toBe(true);
  expect(r.points.every(p=>p.status==="NEEDS_REVIEW")).toBe(true);
  expect(r.points.every(p=>p.currency==="YER" || p.currency==="USD")).toBe(true);
 });
 it("withholds projected balance when schedule coverage is partial",()=>{
  const r=buildCashflowForecast({...base([entry("a","INFLOW","2026-11-01",20)]),scheduleCompleteness:"PARTIAL"});
  expect(r.points[0].projectedBalance).toBeNull();
  expect(r.points[0].status).toBe("NEEDS_REVIEW");
  expect(r.points[0].knownInflows).toBe(20);
 });
 it("withholds projection for unknown due dates",()=>{
  const r=buildCashflowForecast(base([entry("a","INFLOW","next Friday",20)]));
  expect(r.points[0].projectedBalance).toBeNull();
  expect(r.points[0].status).toBe("NEEDS_REVIEW");
  expect(r.points[0].scheduleComplete).toBe(false);
  expect(r.points[0].warnings).toContain("INVALID_DUE_DATE");
 });
 it("withholds every affected forecast when a scheduled entry has no currency",()=>{
  const unscoped={...entry("unscoped","INFLOW","2026-11-02",20),amount:{...metric("unscoped","unclassified",20,"YER"),currency:undefined}};
  const r=buildCashflowForecast(base([unscoped]));
  expect(r.points.every(p=>p.projectedBalance===null&&p.status==="NEEDS_REVIEW")).toBe(true);
  expect(r.points.every(p=>p.warnings.includes("UNSCOPED_SCHEDULE_CURRENCY"))).toBe(true);
 });
 it("withholds a closing balance when only future receivables exist and no supplier/expense outflow schedule is proven",()=>{
  const opening=metric("open","cash.opening",100,"YER");
  const result=buildCashflowForecast({
   ...base([entry("known-inflow","INFLOW","2026-11-01",20)]),
   openingBalances:[opening],
   evidenceRecords:[evidence("open","YER"),evidence("known-inflow","YER")],
  });
  const point=result.points.find(item=>item.currency==="YER"&&item.horizonDays===7);
  expect(point).toMatchObject({
   openingBalance:100,knownInflows:20,knownOutflows:null,
   projectedBalance:null,status:"NEEDS_REVIEW",scheduleComplete:false,
  });
  expect(point?.warnings).toContain("PROJECTED_BALANCE_WITHHELD");
 });
 it("shows verified scheduled movements without inventing an opening or projected balance",()=>{
  const result=buildCashflowForecast({...base([entry("unfunded-in","INFLOW","2026-11-01",20)]),openingBalances:[]});
  const point=result.points.find(item=>item.currency==="YER"&&item.horizonDays===7);
  expect(point).toMatchObject({
   currency:"YER",openingBalance:null,knownInflows:20,knownOutflows:null,
   projectedBalance:null,status:"NEEDS_REVIEW",scheduleComplete:false,
  });
  expect(point?.warnings).toContain("OPENING_BALANCE_NOT_VERIFIED");
  expect(point?.warnings).toContain("PROJECTED_BALANCE_WITHHELD");
  expect(result.warnings).toContain("SCHEDULE_CURRENCY_WITHOUT_OPENING_BALANCE:YER");
 });
 it("adds financial movements in exact cents without floating-point drift",()=>{
  const result=buildCashflowForecast(base([
   entry("in-tenth","INFLOW","2026-11-01",0.1),
   entry("in-two-tenths","INFLOW","2026-11-02",0.2),
   entry("out-tenth","OUTFLOW","2026-11-03",0.1),
  ]));
  const point=result.points.find(item=>item.currency==="YER"&&item.horizonDays===7);
  expect(point?.knownInflows).toBe(0.3);
  expect(point?.knownOutflows).toBe(0.1);
  expect(point?.projectedBalance).toBe(100.2);
 });
 it("withholds sub-cent and over-precision source values",()=>{
  const invalid={...entry("sub-cent","INFLOW","2026-11-01",10),amount:{...metric("sub-cent","sub-cent",10,"YER"),value:"10.001"}};
  const result=buildCashflowForecast(base([invalid]));
  const point=result.points.find(item=>item.currency==="YER"&&item.horizonDays===7);
  expect(point?.knownInflows).toBeNull();
  expect(point?.projectedBalance).toBeNull();
  expect(point?.status).toBe("NEEDS_REVIEW");
  expect(point?.warnings).toContain("SCHEDULE_ENTRY_NOT_VERIFIED");
 });
 it("withholds a currency aggregate that exceeds the safe minor-unit ceiling",()=>{
  const result=buildCashflowForecast(base([
   entry("large-in-a","INFLOW","2026-11-01",7_000_000_000_000),
   entry("large-in-b","INFLOW","2026-11-02",7_000_000_000_000),
   entry("outflow","OUTFLOW","2026-11-03",1),
  ]));
  const point=result.points.find(item=>item.currency==="YER"&&item.horizonDays===7);
  expect(point?.knownInflows).toBeNull();
  expect(point?.projectedBalance).toBeNull();
  expect(point?.status).toBe("NEEDS_REVIEW");
  expect(point?.warnings).toContain("SCHEDULE_AMOUNT_OUT_OF_RANGE");
 });
 it("uses the UTC calendar day of an offset-aware as-of timestamp",()=>{
  const source=base([entry("utc-day-outflow","OUTFLOW","2026-10-30",5)]);
  const offsetAsOf="2026-10-31T01:00:00+03:00";
  const withAsOf=(m:MetricSnapshot):MetricSnapshot=>({...m,asOf:offsetAsOf,lineage:{...m.lineage,calculatedAt:offsetAsOf}});
  const result=buildCashflowForecast({
   ...source,
   asOf:offsetAsOf,
   openingBalances:source.openingBalances.map(withAsOf),
   entries:source.entries.map(item=>({...item,amount:withAsOf(item.amount)})),
   evidenceRecords:source.evidenceRecords.map(record=>({...record,asOf:offsetAsOf,sourceTimestamp:offsetAsOf})),
  });
  const point=result.points.find(item=>item.currency==="YER"&&item.horizonDays===7);
  expect(point?.period.from).toBe("2026-10-30");
  expect(point?.knownOutflows).toBe(5);
 });
 it("retains a verified negative opening balance without floating-point projection arithmetic",()=>{
  const negativeOpening=metric("open","cash.opening",-25.5,"YER");
  const result=buildCashflowForecast({
   ...base([entry("inflow","INFLOW","2026-11-01",30),entry("outflow","OUTFLOW","2026-11-02",5)]),
   openingBalances:[negativeOpening],
  });
  const point=result.points.find(item=>item.currency==="YER"&&item.horizonDays===7);
  expect(point).toMatchObject({openingBalance:-25.5,knownInflows:30,knownOutflows:5,projectedBalance:-0.5,status:"VERIFIED"});
 });

});
