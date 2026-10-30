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
});
