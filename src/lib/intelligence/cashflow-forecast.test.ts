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
 });
 it("keeps currency groups separate",()=>{
  const usd=metric("usd-open","cash.opening",100,"USD"),usdIn=entry("usd-in","INFLOW","2026-11-01",15,"USD");
  const r=buildCashflowForecast({...base([usdIn]),openingBalances:[metric("open","cash.opening",100,"YER"),usd],evidenceRecords:[evidence("open","YER"),evidence("usd-open","USD"),evidence("usd-in","USD")]});
  expect(r.points.filter(p=>p.currency==="YER").every(p=>p.projectedBalance===100)).toBe(true);
  expect(r.points.find(p=>p.currency==="USD"&&p.horizonDays===7)?.projectedBalance).toBe(115);
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
  it("shows verified scheduled movements without inventing an opening or projected balance",()=>{
  const result=buildCashflowForecast({...base([entry("unfunded-in","INFLOW","2026-11-01",20)]),openingBalances:[]});
  const point=result.points.find(item=>item.currency==="YER"&&item.horizonDays===7);
  expect(point).toMatchObject({
   currency:"YER",openingBalance:null,knownInflows:20,knownOutflows:0,
   projectedBalance:null,status:"UNAVAILABLE",scheduleComplete:true,
  });
  expect(point?.warnings).toContain("OPENING_BALANCE_NOT_VERIFIED");
  expect(point?.warnings).toContain("PROJECTED_BALANCE_WITHHELD");
  expect(result.warnings).toContain("SCHEDULE_CURRENCY_WITHOUT_OPENING_BALANCE:YER");
 });
});
});