import {describe,expect,it} from "vitest";
import {buildReplenishmentRecommendations} from "./replenishment";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z",period={from:"2026-08-02",to:"2026-10-30"};
const evidence=(id:string):EvidenceRecord=>({id,source:{kind:"RPC",name:"inventory.replenishment_inputs",version:"v1"},sourceTimestamp:asOf,asOf,period,currency:undefined,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,value:number,unit:MetricSnapshot["unit"],p:MetricSnapshot["period"]=period,uom:string|null="EA"):MetricSnapshot=>({id,key:id,value,unit,...(unit==="QUANTITY"&&uom?{unitOfMeasure:uom}:{}),status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period:p,asOf,lineage:{evidenceIds:[id],calculatedAt:asOf,formulaId:id,formulaVersion:"1",transformations:[]},warnings:[]});
const build=(overrides:Partial<{atp:MetricSnapshot;rop:MetricSnapshot;sold:MetricSnapshot;lead:MetricSnapshot}>={},quantityUnit="EA")=>{
 const rows={atp:metric("atp",5,"QUANTITY"),rop:metric("rop",20,"QUANTITY"),sold:metric("sold",30,"QUANTITY"),lead:metric("lead",15,"DAYS",null),...overrides};
 return buildReplenishmentRecommendations({id:"r",asOf,period,evidenceRecords:[evidence("atp"),evidence("rop"),evidence("sold"),evidence("lead")],products:[{productRef:"SKU-1",availableToPromise:rows.atp,reorderPoint:rows.rop,soldQuantityWindow:rows.sold,supplierLeadTimeDays:rows.lead,quantityUnit}]});
};
describe("replenishment recommendations",()=>{
 it("calculates demand from the full inclusive lookback period and preserves the lead-time basis",()=>{
  const result=build(),r=result.recommendations[0];
  expect(r).toMatchObject({status:"VERIFIED",action:"RECOMMEND",quantityUnit:"EA",availableToPromise:5,reorderPoint:20,dailyDemand:1/3,leadTimeDemand:5,targetStock:20,recommendedQuantity:15,automaticPurchase:false});
 });
 it("withholds when a required evidence field is unverified",()=>{
  const lead={...metric("lead",15,"DAYS",null),status:"UNVERIFIED" as const};
  const result=build({lead}),r=result.recommendations[0];
  expect(r.status).toBe("UNVERIFIED");expect(r.action).toBe("WITHHELD");expect(r.recommendedQuantity).toBeNull();
 });
 it("does not purchase automatically when ATP is adequate",()=>{
  const result=build({atp:metric("atp",50,"QUANTITY")});
  expect(result.recommendations[0]).toMatchObject({action:"NO_ACTION",quantityUnit:"EA",recommendedQuantity:0,automaticPurchase:false});
 });
 it("withholds a missing supplier lead time instead of inventing zero days",()=>{
  const missingLead={...metric("lead",15,"DAYS",null),status:"UNAVAILABLE" as const};
  const r=build({lead:missingLead}).recommendations[0];
  expect(r).toMatchObject({status:"UNAVAILABLE",action:"WITHHELD",leadTimeDemand:null,recommendedQuantity:null,automaticPurchase:false});
 });
 it("withholds recommendations when quantity inputs use a different UOM",()=>{
  const mismatched=metric("sold",30,"QUANTITY",period,"CARTON");
  const r=build({sold:mismatched}).recommendations[0];
  expect(r).toMatchObject({status:"UNVERIFIED",action:"WITHHELD",quantityUnit:null,recommendedQuantity:null});
  expect(r.warnings).toContain("QUANTITY_UOM_MISMATCH");
 });
 it("withholds recommendations when a quantity source omits its UOM",()=>{
  const missing=metric("sold",30,"QUANTITY",period,null);
  const r=build({sold:missing}).recommendations[0];
  expect(r).toMatchObject({status:"NEEDS_REVIEW",action:"WITHHELD",quantityUnit:null,recommendedQuantity:null});
  expect(r.warnings).toContain("QUANTITY_UOM_MISSING");
 });
 it("withholds sold quantity when its source period is absent or different",()=>{
  const missingPeriod=metric("sold",30,"QUANTITY",null);
  const r=build({sold:missingPeriod}).recommendations[0];
  expect(r).toMatchObject({status:"NEEDS_REVIEW",action:"WITHHELD",recommendedQuantity:null});
 });
});
