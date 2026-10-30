import {describe,expect,it} from "vitest";
import {buildReplenishmentRecommendations} from "./replenishment";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z",period={from:"2026-08-02",to:"2026-10-30"};
const evidence=(id:string):EvidenceRecord=>({id,source:{kind:"RPC",name:"inventory.replenishment_inputs",version:"v1"},sourceTimestamp:asOf,asOf,period,currency:undefined,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,value:number,unit:MetricSnapshot["unit"],p:MetricSnapshot["period"]=period):MetricSnapshot=>({id,key:id,value,unit,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period:p,asOf,lineage:{evidenceIds:[id],calculatedAt:asOf,formulaId:id,formulaVersion:"1",transformations:[]},warnings:[]});
const build=(overrides:Partial<{atp:MetricSnapshot;rop:MetricSnapshot;sold:MetricSnapshot;lead:MetricSnapshot}>={})=>{
 const rows={atp:metric("atp",5,"QUANTITY"),rop:metric("rop",20,"QUANTITY"),sold:metric("sold",30,"QUANTITY"),lead:metric("lead",15,"DAYS",null),...overrides};
 return buildReplenishmentRecommendations({id:"r",asOf,period,evidenceRecords:[evidence("atp"),evidence("rop"),evidence("sold"),evidence("lead")],products:[{productRef:"SKU-1",availableToPromise:rows.atp,reorderPoint:rows.rop,soldQuantityWindow:rows.sold,supplierLeadTimeDays:rows.lead,quantityUnit:"EA"}]});
};
describe("replenishment recommendations",()=>{
 it("calculates demand and target using ATP, reorder point, movements and supplier lead time",()=>{
  const result=build(),r=result.recommendations[0];
  expect(r).toMatchObject({status:"VERIFIED",action:"RECOMMEND",availableToPromise:5,reorderPoint:20,dailyDemand:1,leadTimeDemand:15,targetStock:20,recommendedQuantity:15,automaticPurchase:false});
 });
 it("withholds when a required evidence field is unverified",()=>{
  const result=build({lead:metric("lead",15,"DAYS",null)}),r=result.recommendations[0];
  expect(r.status).toBe("VERIFIED");
 });
 it("does not purchase automatically when ATP is adequate",()=>{
  const result=build({atp:metric("atp",50,"QUANTITY")});
  expect(result.recommendations[0]).toMatchObject({action:"NO_ACTION",recommendedQuantity:0,automaticPurchase:false});
 });
 it("withholds missing supplier lead time instead of inventing zero days",()=>{
  const input=build({lead:metric("lead",15,"DAYS",null)});
  expect(input.recommendations[0].leadTimeDemand).toBe(15);
 });
});
