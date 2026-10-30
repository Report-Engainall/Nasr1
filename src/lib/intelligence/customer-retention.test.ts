import {describe,expect,it} from "vitest";
import {buildCustomerRetentionReport} from "./customer-retention";
import type {CustomerRetentionRecord} from "./customer-retention";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z",period={from:"2026-10-01",to:"2026-10-30"},previousPeriod={from:"2026-09-01",to:"2026-09-30"};
const evidence=(id:string,currency?:string,p=period):EvidenceRecord=>({id,source:{kind:"RPC",name:"analytics.full_customer_retention",version:"v1"},sourceTimestamp:asOf,asOf,period:p,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,value:number,unit:MetricSnapshot["unit"],p=period,currency?:string):MetricSnapshot=>({id,key:id,value,unit,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period:p,asOf,lineage:{evidenceIds:[id],calculatedAt:asOf,formulaId:id,formulaVersion:"1",transformations:[]},warnings:[]});
const customer=(ref:string,currency:string,current:number,previous:number,sales:number,lastOrderAt:string|null):CustomerRetentionRecord=>({
 customerRef:ref,currency,ordersCurrentPeriod:metric(ref+"-current",current,"COUNT"),ordersPreviousPeriod:metric(ref+"-previous",previous,"COUNT",previousPeriod),salesCurrentPeriod:metric(ref+"-sales",sales,"CURRENCY",period,currency),lastOrderAt,
});
const data=(customers:CustomerRetentionRecord[])=>({
 id:"r",asOf,period,previousPeriod,evidenceRecords:customers.flatMap(c=>[
  evidence(c.ordersCurrentPeriod.id),evidence(c.ordersPreviousPeriod.id,undefined,previousPeriod),evidence(c.salesCurrentPeriod.id,c.currency),
 ]),coverage:{status:"VERIFIED" as const,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,expectedCustomerCount:customers.length,returnedCustomerCount:customers.length,truncated:false,evidenceIds:customers.map(c=>c.ordersCurrentPeriod.id)},customers,
});
describe("customer retention full aggregate",()=>{
 it("separates retention, repeat frequency, activity and currency concentration",()=>{
  const r=buildCustomerRetentionReport(data([
   customer("C1","YER",3,2,300,"2026-10-25T00:00:00Z"),
   customer("C2","YER",1,1,100,"2026-08-10T00:00:00Z"),
   customer("C3","USD",2,0,50,"2026-10-20T00:00:00Z"),
  ]));
  expect(r.status).toBe("VERIFIED");expect(r.retentionRate).toBe(50);expect(r.repeatPurchaseRate).toBe(2/3*100);
  expect(r.focusByCurrency.find(x=>x.currency==="YER")?.totalSales).toBe(400);
  expect(r.activity.inactiveOver90Days).toBe(0);
 });
 it("withholds aggregate KPIs when the returned customer list is truncated",()=>{
  const input=data([customer("C1","YER",1,1,100,"2026-10-20T00:00:00Z")]);
  input.coverage={...input.coverage,expectedCustomerCount:100,truncated:true};
  const r=buildCustomerRetentionReport(input);
  expect(r.status).toBe("NEEDS_REVIEW");expect(r.retentionRate).toBeNull();expect(r.focusByCurrency[0].totalSales).toBeNull();
 });
 it("keeps focus/concentration calculations separate for each currency",()=>{
  const r=buildCustomerRetentionReport(data([
   customer("C1","YER",1,1,100,"2026-10-20T00:00:00Z"),
   customer("C2","USD",1,1,10,"2026-10-20T00:00:00Z"),
  ]));
  expect(r.focusByCurrency.map(x=>[x.currency,x.totalSales])).toEqual([["YER",100],["USD",10]]);
 });
 it("does not invent inactivity causes",()=>{
  const r=buildCustomerRetentionReport(data([customer("C2","YER",0,1,0,"2026-07-01T00:00:00Z")]));
  expect(r.customers[0].activity).toBe("INACTIVE");
  expect(JSON.stringify(r)).not.toMatch(/reason|cause|سبب/);
 });
});
