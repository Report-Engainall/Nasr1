import {describe,expect,it} from "vitest";
import {createDecisionOutcome,transitionDecisionOutcome} from "./decision-outcome";
import type {DecisionMeasuredOutcome} from "./types";
import type {DecisionOutcomeEvent} from "./decision-outcome";
const at="2026-10-30T07:00:00Z",actor={id:"u1",role:"manager"};
const initial=()=>createDecisionOutcome({id:"d1",candidateId:"c1",proposedBy:actor,owner:"ops",expectedOutcome:"reduce backlog",createdAt:at});
const measured=(overrides:Partial<DecisionMeasuredOutcome>={}):DecisionMeasuredOutcome=>({
 metricKey:"orders.completed",value:4,unit:"COUNT",status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",
 period:{from:"2026-10-01",to:"2026-10-30"},asOf:at,formulaId:"orders.completed.count",formulaVersion:"1.0.0",
 measuredAt:at,evidenceIds:["actual-1"],...overrides,
});
const executable=()=>{
 let outcome=initial();
 const events=[event("SUBMIT_FOR_REVIEW",1),event("APPROVE",2,{reason:"approved"}),event("ASSIGN",3,{owner:"ops"}),event("START_EXECUTION",4),event("COMPLETE_EXECUTION",5)];
 for(const item of events){const result=step(outcome,item);if(!result.ok)throw new Error("pre-measure transition failed");outcome=result.outcome}
 return outcome;
};
const event=(type:DecisionOutcomeEvent["type"],n:number,extra:Partial<DecisionOutcomeEvent>={}):DecisionOutcomeEvent=>({id:"e"+n,idempotencyKey:"key"+n,type,actor,at,...extra});
const step=(outcome:ReturnType<typeof initial>,e:DecisionOutcomeEvent)=>transitionDecisionOutcome(outcome,e);
describe("decision outcome transitions",()=>{
 it("enforces the review-to-measure lifecycle",()=>{
  let o=initial();
  const sequence=[event("SUBMIT_FOR_REVIEW",1),event("APPROVE",2,{reason:"approved after evidence review"}),
   event("ASSIGN",3,{owner:"ops2"}),event("START_EXECUTION",4),event("COMPLETE_EXECUTION",5),
   event("MEASURE",6,{measuredOutcome:measured()})];
  for(const e of sequence){const result=step(o,e);expect(result.ok).toBe(true);if(result.ok)o=result.outcome}
  expect(o).toMatchObject({state:"MEASURED",version:7,owner:"ops2",approvedAt:at,executedAt:at});
 });
 it("returns identical event retries idempotently and rejects key reuse",()=>{
  const first=step(initial(),event("SUBMIT_FOR_REVIEW",1));if(!first.ok)throw new Error("first transition failed");
  expect(step(first.outcome,event("SUBMIT_FOR_REVIEW",1))).toMatchObject({ok:true,duplicate:true});
  expect(step(first.outcome,event("APPROVE",1,{reason:"different payload"}))).toMatchObject({ok:false,reason:"IDEMPOTENCY_CONFLICT"});
 });
 it("requires an explanation for approval and forbids skipped states",()=>{
  const review=step(initial(),event("SUBMIT_FOR_REVIEW",1));if(!review.ok)throw new Error("submit failed");
  expect(step(review.outcome,event("APPROVE",2))).toMatchObject({ok:false,reason:"MISSING_REASON"});
  expect(step(initial(),event("ASSIGN",1,{owner:"ops"}))).toMatchObject({ok:false,reason:"INVALID_TRANSITION"});
 });
 it("requires a currency for per-unit financial measurements",()=>{
  const outcome=executable();
  expect(step(outcome,event("MEASURE",6,{measuredOutcome:measured({value:12,unit:"CURRENCY_PER_UNIT"})})))
   .toMatchObject({ok:false,reason:"INVALID_MEASUREMENT"});
  expect(step(outcome,event("MEASURE",7,{measuredOutcome:measured({value:12,unit:"CURRENCY_PER_UNIT",currency:"YER"})})))
   .toMatchObject({ok:true,duplicate:false,outcome:{measuredOutcome:{currency:"YER"}}});
 });
 it("rejects measurements without verified, complete, formula-scoped evidence",()=>{
  const outcome=executable();
  const invalid=[
   measured({status:"UNVERIFIED"}),
   measured({status:"NEEDS_REVIEW"}),
   measured({completeness:"PARTIAL"}),
   measured({quality:"WARNINGS"}),
   measured({formulaId:""}),
   measured({formulaVersion:""}),
   measured({asOf:"2026-10-31T07:00:00Z",measuredAt:at}),
   measured({evidenceIds:[]}),
   measured({evidenceIds:["same","same"]}),
   measured({period:{from:"2026-10-31",to:"2026-10-01"}}),
  ];
  for(const [index,measurement] of invalid.entries()){
   expect(step(outcome,event("MEASURE",20+index,{measuredOutcome:measurement})))
    .toMatchObject({ok:false,reason:"INVALID_MEASUREMENT"});
  }
 });
 it("allows verified zero measurements but preserves evidence metadata",()=>{
  const result=step(executable(),event("MEASURE",40,{measuredOutcome:measured({value:0})}));
  expect(result).toMatchObject({ok:true,outcome:{state:"MEASURED",measuredOutcome:{value:0,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",formulaId:"orders.completed.count",formulaVersion:"1.0.0",evidenceIds:["actual-1"]}}});
 });
});
