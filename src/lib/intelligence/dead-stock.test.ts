import {describe,expect,it} from "vitest";
import {buildDeadStockReport} from "./dead-stock";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z",period={from:"2026-07-31",to:"2026-10-30"};
const evidence=(id:string,currency?:string):EvidenceRecord=>({id,source:{kind:"RPC",name:"inventory.movement_history",version:"v1"},sourceTimestamp:asOf,asOf,period,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,unit:MetricSnapshot["unit"],value:number,currency?:string):MetricSnapshot=>({id,key:id,value,unit,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period,asOf,lineage:{evidenceIds:[id],calculatedAt:asOf,formulaId:id+".formula",formulaVersion:"1",transformations:[]},warnings:[]});
const rule={id:"dead-stock-days",version:"1.0",activeWithinDays:30,stagnantAfterDays:90,lowTurnoverRatio:0.1,turnoverWindowDays:92};
describe("dead-stock engine",()=>{
 it("classifies stale movement and calculates exposure only with verified unit cost",()=>{
  const p={productRef:"P-001",lastMovementAt:"2026-06-01T00:00:00Z",movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},availableQuantity:metric("qty","QUANTITY",10),quantityUnit:"EA",unitCost:metric("cost","CURRENCY_PER_UNIT",4,"YER"),costQuantityUnit:"EA",soldQuantityWindow:metric("sold","QUANTITY",1),averageInventoryWindow:metric("avg","QUANTITY",20)};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv"),evidence("qty"),evidence("cost","YER"),evidence("sold"),evidence("avg")],products:[p],rule});
  expect(r.items[0]).toMatchObject({classification:"STAGNANT",financialExposure:40,currency:"YER",exposureStatus:"VERIFIED",lowTurnover:true});
 });
 it("does not fabricate cost exposure when unit cost is absent",()=>{
  const p={productRef:"P-002",lastMovementAt:"2026-06-01T00:00:00Z",movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},availableQuantity:metric("qty","QUANTITY",5),quantityUnit:"EA",unitCost:null,soldQuantityWindow:null,averageInventoryWindow:null};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv"),evidence("qty")],products:[p],rule});
  expect(r.items[0].financialExposure).toBeNull();expect(r.items[0].warnings).toContain("UNIT_COST_NOT_AVAILABLE");
 });
 it("does not classify an incomplete movement window as stagnant",()=>{
  const p={productRef:"P-003",lastMovementAt:"2026-01-01T00:00:00Z",movementCoverage:{status:"VERIFIED" as const,period:{from:"2026-10-01",to:"2026-10-30"},completeness:"PARTIAL" as const,quality:"WARNINGS" as const,evidenceIds:["mv"]},availableQuantity:metric("qty","QUANTITY",2),quantityUnit:"EA",unitCost:null,soldQuantityWindow:null,averageInventoryWindow:null};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv"),evidence("qty")],products:[p],rule});
  expect(r.items[0].classification).toBe("UNKNOWN");
 });
 it("marks a complete window with no movements as zero movement, not unknown",()=>{
  const p={productRef:"P-004",lastMovementAt:null,movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},availableQuantity:metric("qty","QUANTITY",3),quantityUnit:"EA",unitCost:null,soldQuantityWindow:null,averageInventoryWindow:null};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv"),evidence("qty")],products:[p],rule});
  expect(r.items[0].classification).toBe("ZERO_MOVEMENT");
 });
});
