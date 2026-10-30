import {describe,expect,it} from "vitest";
import {evaluateDecisionLearning} from "./learning-loop";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const at="2026-10-30T07:00:00Z",period={from:"2026-10-01",to:"2026-10-30"};
const ev=(id:string,currency?:string):EvidenceRecord=>({id,source:{kind:"RPC",name:"decision.outcome.measurement",version:"1"},sourceTimestamp:at,asOf:at,period,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]});
const metric=(id:string,value:number,unit:MetricSnapshot["unit"],currency?:string):MetricSnapshot=>({id,key:"orders.closed",value,unit,currency,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",period,asOf:at,
 lineage:{evidenceIds:[id],calculatedAt:at,formulaId:"orders.closed",formulaVersion:"1",transformations:[]},warnings:[]});
const run=(expected:MetricSnapshot,actual:MetricSnapshot)=>evaluateDecisionLearning({id:"learn1",measuredAt:at,
 evidenceRecords:[ev(expected.lineage.evidenceIds[0],expected.currency),ev(actual.lineage.evidenceIds[0],actual.currency)],
 expected,actual,expectedRuleId:"r",expectedRuleVersion:"1",currentRuleId:"r",currentRuleVersion:"1"});
describe("learning outcome measurement",()=>{
 it("measures numeric variance only across verified comparable facts",()=>expect(run(metric("e",10,"COUNT"),metric("a",8,"COUNT"))).toMatchObject({status:"VERIFIED",expectedValue:10,actualValue:8,variance:-2,variancePercent:-20}));
 it("withholds variance across currencies or units",()=>expect(run(metric("e",10,"CURRENCY","YER"),metric("a",8,"CURRENCY","USD"))).toMatchObject({status:"NEEDS_REVIEW",variance:null,warnings:["CURRENCY_MISMATCH"]}));
 it("stores rule versions and evidence references",()=>expect(run(metric("e",10,"COUNT"),metric("a",12,"COUNT"))).toMatchObject({ruleVersions:{expected:"r@1",measured:"r@1"},evidenceIds:["e","a"]}));
 it("does not divide percentage variance by zero",()=>expect(run(metric("e",0,"COUNT"),metric("a",5,"COUNT")).variancePercent).toBeNull());
});
