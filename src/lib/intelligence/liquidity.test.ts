import {describe,expect,it} from "vitest";
import {buildLiquiditySnapshot} from "./liquidity";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z",period={from:"2026-10-01",to:"2026-10-30"};
const evidence=(id:string,currency:string):EvidenceRecord=>({id,source:{kind:"RPC",name:"finance.tenant_liquidity",version:"v1"},sourceTimestamp:asOf,asOf,period,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,key:string,value:number,currency:string,overrides:Partial<MetricSnapshot>={}):MetricSnapshot=>({id,key,value,unit:"CURRENCY",currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period,asOf,lineage:{evidenceIds:[id],calculatedAt:asOf,formulaId:key+".v1",formulaVersion:"1.0",transformations:[]},warnings:[],...overrides});
describe("per-currency liquidity",()=>{
 it("calculates net liquidity separately by currency",()=>{
  const y=[metric("y1","cash.available",10000,"YER"),metric("y2","receivables.expected",2000,"YER"),metric("y3","payables.due",3000,"YER")];
  const u=[metric("u1","cash.available",100,"USD"),metric("u2","receivables.expected",20,"USD"),metric("u3","payables.due",50,"USD")];
  const r=buildLiquiditySnapshot({id:"l",generatedAt:asOf,asOf,period,evidenceRecords:[evidence("y1","YER"),evidence("y2","YER"),evidence("y3","YER"),evidence("u1","USD"),evidence("u2","USD"),evidence("u3","USD")],currencies:[
   {currency:"YER",availableBalance:y[0],expectedCollections:y[1],dueObligations:y[2]},
   {currency:"USD",availableBalance:u[0],expectedCollections:u[1],dueObligations:u[2]},
  ]});
  expect(r.positions.map(p=>[p.currency,p.netAvailableLiquidity])).toEqual([["YER",9000],["USD",70]]);
 });
 it("withholds net liquidity when a mandatory source is absent",()=>{
  const a=metric("a","cash",50,"YER"),b=metric("b","collections",10,"YER");
  const r=buildLiquiditySnapshot({id:"l",generatedAt:asOf,asOf,period,evidenceRecords:[evidence("a","YER"),evidence("b","YER")],currencies:[{currency:"YER",availableBalance:a,expectedCollections:b,dueObligations:null}]});
  expect(r.positions[0].netAvailableLiquidity).toBeNull();
  expect(r.positions[0].status).toBe("UNAVAILABLE");
 });
 it("withholds mixed currencies and incomplete periods",()=>{
  const a=metric("a","cash",50,"USD"),b=metric("b","collections",10,"USD"),c=metric("c","payables",5,"YER");
  const r=buildLiquiditySnapshot({id:"l",generatedAt:asOf,asOf,period,evidenceRecords:[evidence("a","USD"),evidence("b","USD"),evidence("c","YER")],currencies:[{currency:"USD",availableBalance:a,expectedCollections:b,dueObligations:c}]});
  expect(r.positions[0].netAvailableLiquidity).toBeNull();
  expect(r.positions[0].status).toBe("UNVERIFIED");
 });
 it("does not subtract stock cost from cash and leaves missing cost unavailable",()=>{
  const a=metric("a","cash",50,"YER"),b=metric("b","collections",10,"YER"),c=metric("c","payables",5,"YER");
  const r=buildLiquiditySnapshot({id:"l",generatedAt:asOf,asOf,period,evidenceRecords:[evidence("a","YER"),evidence("b","YER"),evidence("c","YER")],currencies:[{currency:"YER",availableBalance:a,expectedCollections:b,dueObligations:c}]});
  expect(r.positions[0].netAvailableLiquidity).toBe(55);
  expect(r.positions[0].stagnantStockExposure).toBeNull();
  expect(r.positions[0].warnings).toContain("METRIC_NOT_SUPPLIED");
 });
 it("downgrades an arithmetic overflow instead of returning verified null liquidity",()=>{
  const a=metric("a","cash",Number.MAX_SAFE_INTEGER,"YER");
  const b=metric("b","collections",Number.MAX_SAFE_INTEGER,"YER");
  const d=metric("d","payables",0,"YER");
  const r=buildLiquiditySnapshot({id:"overflow",generatedAt:asOf,asOf,period,
   evidenceRecords:[evidence("a","YER"),evidence("b","YER"),evidence("d","YER")],
   currencies:[{currency:"YER",availableBalance:a,expectedCollections:b,dueObligations:d}]});
  expect(r.positions[0].netAvailableLiquidity).toBeNull();
  expect(r.positions[0].status).toBe("NEEDS_REVIEW");
  expect(r.positions[0].completeness).toBe("PARTIAL");
  expect(r.positions[0].warnings).toContain("LIQUIDITY_ARITHMETIC_OVERFLOW");
 });
 it("preserves UNVERIFIED severity when a currency position is duplicated",()=>{
  const first=[metric("a1","cash",50,"YER"),metric("b1","collections",10,"YER"),metric("c1","payables",5,"YER")];
  const second=[metric("a2","cash",40,"YER",{status:"UNVERIFIED"}),metric("b2","collections",10,"YER"),metric("c2","payables",5,"YER")];
  const records=[...first,...second].map(m=>evidence(m.id,"YER"));
  const r=buildLiquiditySnapshot({id:"duplicate",generatedAt:asOf,asOf,period,evidenceRecords:records,currencies:[
   {currency:"YER",availableBalance:first[0],expectedCollections:first[1],dueObligations:first[2]},
   {currency:"YER",availableBalance:second[0],expectedCollections:second[1],dueObligations:second[2]},
  ]});
  expect(r.positions[1].status).toBe("UNVERIFIED");
  expect(r.positions[1].netAvailableLiquidity).toBeNull();
 });
 it("exposes field-level evidence states without invalidating independently verified net liquidity",()=>{
  const cash=metric("cash","cash",50,"YER");
  const collections=metric("collections","collections",10,"YER");
  const obligations=metric("obligations","payables",5,"YER");
  const overdue=metric("overdue","overdue",12,"USD");
  const stock=metric("stock","stagnant-cost",80,"YER",{status:"UNVERIFIED"});
  const result=buildLiquiditySnapshot({
   id:"field-status",generatedAt:asOf,asOf,period,
   evidenceRecords:[evidence("cash","YER"),evidence("collections","YER"),evidence("obligations","YER"),evidence("overdue","USD"),evidence("stock","YER")],
   currencies:[{currency:"YER",availableBalance:cash,expectedCollections:collections,dueObligations:obligations,
    overdueReceivables:overdue,stagnantStockCost:stock}],
  });
  const position=result.positions[0];
  expect(position).toMatchObject({
   status:"VERIFIED",completeness:"COMPLETE",netAvailableLiquidity:55,
   availableBalance:50,availableBalanceStatus:"VERIFIED",
   expectedCollections:10,expectedCollectionsStatus:"VERIFIED",
   dueObligations:5,dueObligationsStatus:"VERIFIED",
   overdueReceivables:null,overdueReceivablesStatus:"UNVERIFIED",
   stagnantStockExposure:null,stagnantStockExposureStatus:"UNVERIFIED",
  });
 });
});
