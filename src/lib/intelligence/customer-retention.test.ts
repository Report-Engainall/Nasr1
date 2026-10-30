import {describe,expect,it} from "vitest";
import {buildCustomerRetentionReport} from "./customer-retention";
import type {CustomerRetentionRecord,CustomerRetentionSaleRecord} from "./customer-retention";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z",period={from:"2026-10-01",to:"2026-10-30"},previousPeriod={from:"2026-09-01",to:"2026-09-30"};
const evidence=(id:string,currency?:string,p=period):EvidenceRecord=>({id,source:{kind:"RPC",name:"analytics.full_customer_retention",version:"v1"},sourceTimestamp:asOf,asOf,period:p,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,value:number,unit:MetricSnapshot["unit"],p=period,currency?:string):MetricSnapshot=>({id,key:id,value,unit,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period:p,asOf,lineage:{evidenceIds:[id],calculatedAt:asOf,formulaId:id,formulaVersion:"1",transformations:[]},warnings:[]});
const customer=(ref:string,current:number,previous:number,lastOrderAt:string|null):CustomerRetentionRecord=>({customerRef:ref,ordersCurrentPeriod:metric(ref+"-current",current,"COUNT"),ordersPreviousPeriod:metric(ref+"-previous",previous,"COUNT",previousPeriod),lastOrderAt});
const sale=(ref:string,currency:string,value:number):CustomerRetentionSaleRecord=>({customerRef:ref,currency,sales:metric(ref+"-"+currency,value,"CURRENCY",period,currency)});
const data=(customers:CustomerRetentionRecord[],salesByCurrency:CustomerRetentionSaleRecord[])=>({
 id:"r",asOf,period,previousPeriod,
 evidenceRecords:[...customers.flatMap(c=>[evidence(c.ordersCurrentPeriod.id),evidence(c.ordersPreviousPeriod.id,undefined,previousPeriod)]),...salesByCurrency.map(s=>evidence(s.sales.id,s.currency))],
 coverage:{status:"VERIFIED" as const,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,expectedCustomerCount:customers.length,returnedCustomerCount:customers.length,expectedSalesRecordCount:salesByCurrency.length,returnedSalesRecordCount:salesByCurrency.length,truncated:false,evidenceIds:customers.map(c=>c.ordersCurrentPeriod.id)},
 customers,salesByCurrency,
});
describe("customer retention full aggregate",()=>{
 it("separates retention, repeat frequency, activity and currency focus",()=>{
  const r=buildCustomerRetentionReport(data([
   customer("C1",3,2,"2026-10-25T00:00:00Z"),customer("C2",0,1,"2026-06-01T00:00:00Z"),
   customer("C3",1,0,"2026-10-20T00:00:00Z"),customer("C4",2,0,"2026-10-15T00:00:00Z"),
  ],[sale("C1","YER",300),sale("C2","YER",0),sale("C3","YER",50),sale("C4","YER",50)]));
  expect(r.status).toBe("VERIFIED");expect(r.retentionRate).toBe(50);expect(r.repeatPurchaseRate).toBeCloseTo(2/3*100);
  expect(r.focusByCurrency.find(x=>x.currency==="YER")?.totalSales).toBe(400);expect(r.activity.inactiveOver90Days).toBe(1);
 });
 it("withholds aggregate KPIs when the returned customer list is truncated",()=>{
  const input=data([customer("C1",1,1,"2026-10-20T00:00:00Z")],[sale("C1","YER",100)]);
  input.coverage={...input.coverage,expectedCustomerCount:100,truncated:true};
  const r=buildCustomerRetentionReport(input);
  expect(r.status).toBe("NEEDS_REVIEW");expect(r.retentionRate).toBeNull();expect(r.focusByCurrency[0].totalSales).toBeNull();
  expect(r.population.total).toBeNull();expect(r.activity.active30Days).toBeNull();
 });
 it("does not count a multi-currency customer twice",()=>{
  const r=buildCustomerRetentionReport(data([customer("C1",2,1,"2026-10-20T00:00:00Z")],[sale("C1","YER",100),sale("C1","USD",10)]));
  expect(r.population.total).toBe(1);expect(r.population.activeCurrentPeriod).toBe(1);
  expect(r.focusByCurrency.map(x=>[x.currency,x.totalSales])).toEqual([["YER",100],["USD",10]]);
 });
 it("does not invent inactivity causes",()=>{
  const r=buildCustomerRetentionReport(data([customer("C2",0,1,"2026-06-01T00:00:00Z")],[sale("C2","YER",0)]));
  expect(r.customers[0].activity).toBe("INACTIVE");expect(JSON.stringify(r)).not.toMatch(/reason|cause|سبب/);
 });
});
