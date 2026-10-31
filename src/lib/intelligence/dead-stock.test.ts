import {describe,expect,it} from "vitest";
import {buildDeadStockReport} from "./dead-stock";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const asOf="2026-10-30T07:00:00Z",period={from:"2026-07-31",to:"2026-10-30"};
const evidence=(id:string,currency?:string):EvidenceRecord=>({id,source:{kind:"RPC",name:"inventory.movement_history",version:"v1"},sourceTimestamp:asOf,asOf,period,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,unit:MetricSnapshot["unit"],value:number,currency?:string,uom:string|null="EA"):MetricSnapshot=>({id,key:id,value,unit,currency,...((unit==="QUANTITY"||unit==="CURRENCY_PER_UNIT")&&uom?{unitOfMeasure:uom}:{}),status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period,asOf,lineage:{evidenceIds:[id],calculatedAt:asOf,formulaId:id+".formula",formulaVersion:"1",transformations:[]},warnings:[]});
const rule={id:"dead-stock-days",version:"1.0",activeWithinDays:30,stagnantAfterDays:90,lowTurnoverRatio:0.1,turnoverWindowDays:92};
describe("dead-stock engine",()=>{
 it("accepts point-in-time available quantity separately from the historical movement window",()=>{
  const p={productRef:"P-SNAPSHOT",lastMovementAt:"2026-06-01T00:00:00Z",movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},
   availableQuantity:{...metric("qty","QUANTITY",10),period:null},quantityUnit:"EA",unitCost:null,soldQuantityWindow:null,averageInventoryWindow:null};
  const records=[evidence("mv"),{...evidence("qty"),period:null}];
  const result=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:records,products:[p],rule});
  expect(result.items[0]).toMatchObject({classification:"STAGNANT",availableQuantity:10,financialExposure:null});
 });
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
 it("does not mark an empty unsourced population as verified",()=>{
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[],products:[],rule});
  expect(r.status).toBe("UNAVAILABLE");
  expect(r.items).toEqual([]);
  expect(r.totalsByCurrency).toEqual([]);
  expect(r.warnings).toContain("NO_PRODUCT_POPULATION_EVIDENCE");
 });
 it("preserves an UNVERIFIED item status in the report roll-up",()=>{
  const p={productRef:"P-005",lastMovementAt:"not-a-valid-date",movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},availableQuantity:metric("qty","QUANTITY",2),quantityUnit:"EA",unitCost:null,soldQuantityWindow:null,averageInventoryWindow:null};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv"),evidence("qty")],products:[p],rule});
  expect(r.items[0].movementStatus).toBe("UNVERIFIED");
  expect(r.status).toBe("UNVERIFIED");
 });
 it("withholds exposure when source unit cost is expressed in a different quantity UOM",()=>{
  const p={productRef:"P-UOM",lastMovementAt:"2026-06-01T00:00:00Z",movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},
   availableQuantity:metric("qty","QUANTITY",10),quantityUnit:"EA",unitCost:metric("cost","CURRENCY_PER_UNIT",4,"YER","CARTON"),costQuantityUnit:"EA",
   soldQuantityWindow:metric("sold","QUANTITY",1),averageInventoryWindow:metric("avg","QUANTITY",20)};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv"),evidence("qty"),evidence("cost","YER"),evidence("sold"),evidence("avg")],products:[p],rule});
  expect(r.items[0]).toMatchObject({financialExposure:null,exposureStatus:"UNVERIFIED",currency:null});
  expect(r.items[0].warnings).toContain("COST_QUANTITY_UNIT_MISMATCH");
 });
 it("withholds exposure when available quantity UOM does not match product UOM",()=>{
  const p={productRef:"P-QTY-UOM",lastMovementAt:"2026-06-01T00:00:00Z",movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},
   availableQuantity:metric("qty","QUANTITY",10,undefined,"CARTON"),quantityUnit:"EA",unitCost:metric("cost","CURRENCY_PER_UNIT",4,"YER"),costQuantityUnit:"EA",
   soldQuantityWindow:metric("sold","QUANTITY",1),averageInventoryWindow:metric("avg","QUANTITY",20)};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv"),evidence("qty"),evidence("cost","YER"),evidence("sold"),evidence("avg")],products:[p],rule});
  expect(r.items[0]).toMatchObject({financialExposure:null,exposureStatus:"UNVERIFIED"});
 });
 it("rejects movement coverage that extends beyond the as-of day",()=>{
  const p={productRef:"P-FUTURE-COVERAGE",lastMovementAt:"2026-06-01T00:00:00Z",movementCoverage:{status:"VERIFIED" as const,period:{from:"2026-07-31",to:"2026-10-31"},completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},
   availableQuantity:metric("qty","QUANTITY",2),quantityUnit:"EA",unitCost:null,soldQuantityWindow:null,averageInventoryWindow:null};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv")],products:[p],rule});
  expect(r.items[0].classification).toBe("UNKNOWN");
  expect(r.items[0].movementStatus).toBe("NEEDS_REVIEW");
 });
 it("rejects movement evidence whose period does not match coverage",()=>{
  const p={productRef:"P-MISMATCHED-COVERAGE",lastMovementAt:"2026-06-01T00:00:00Z",movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},
   availableQuantity:metric("qty","QUANTITY",2),quantityUnit:"EA",unitCost:null,soldQuantityWindow:null,averageInventoryWindow:null};
  const wrongEvidence={...evidence("mv"),period:{from:"2026-10-01",to:"2026-10-30"}};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[wrongEvidence,evidence("qty")],products:[p],rule});
  expect(r.items[0].classification).toBe("UNKNOWN");
 });
 it("rejects last movement timestamps later than the exact as-of instant",()=>{
  const p={productRef:"P-FUTURE-MOVEMENT",lastMovementAt:"2026-10-30T23:00:00Z",movementCoverage:{status:"VERIFIED" as const,period,completeness:"COMPLETE" as const,quality:"ACCEPTABLE" as const,evidenceIds:["mv"]},
   availableQuantity:metric("qty","QUANTITY",2),quantityUnit:"EA",unitCost:null,soldQuantityWindow:null,averageInventoryWindow:null};
  const r=buildDeadStockReport({id:"d",asOf,period,evidenceRecords:[evidence("mv"),evidence("qty")],products:[p],rule});
  expect(r.items[0].classification).toBe("UNKNOWN");
  expect(r.items[0].movementStatus).toBe("UNVERIFIED");
 });
});
