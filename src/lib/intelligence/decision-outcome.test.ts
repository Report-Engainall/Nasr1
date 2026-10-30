import {describe,expect,it} from "vitest";
import {createDecisionOutcome,transitionDecisionOutcome} from "./decision-outcome";
import type {DecisionOutcomeEvent} from "./decision-outcome";
const at="2026-10-30T07:00:00Z",actor={id:"u1",role:"manager"};
const initial=()=>createDecisionOutcome({id:"d1",candidateId:"c1",proposedBy:actor,owner:"ops",expectedOutcome:"reduce backlog",createdAt:at});
const event=(type:DecisionOutcomeEvent["type"],n:number,extra:Partial<DecisionOutcomeEvent>={}):DecisionOutcomeEvent=>({id:"e"+n,idempotencyKey:"key"+n,type,actor,at,...extra});
const step=(outcome:ReturnType<typeof initial>,e:DecisionOutcomeEvent)=>transitionDecisionOutcome(outcome,e);
describe("decision outcome transitions",()=>{
 it("enforces the review-to-measure lifecycle",()=>{
  let o=initial();
  const sequence=[event("SUBMIT_FOR_REVIEW",1),event("APPROVE",2,{reason:"approved after evidence review"}),
   event("ASSIGN",3,{owner:"ops2"}),event("START_EXECUTION",4),event("COMPLETE_EXECUTION",5),
   event("MEASURE",6,{measuredOutcome:{value:4,unit:"COUNT",measuredAt:at,evidenceIds:["actual-1"]}})];
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
 it("requires currency for currency-per-unit measured outcomes",()=>{
  let outcome=initial();
  const events=[event("SUBMIT_FOR_REVIEW",1),event("APPROVE",2,{reason:"approved"}),event("ASSIGN",3,{owner:"ops"}),
   event("START_EXECUTION",4),event("COMPLETE_EXECUTION",5)];
  for(const e of events){const result=step(outcome,e);if(!result.ok)throw new Error("pre-measure transition failed");outcome=result.outcome;}
  expect(step(outcome,event("MEASURE",6,{measuredOutcome:{value:12,unit:"CURRENCY_PER_UNIT",measuredAt:at,evidenceIds:["actual-1"]}})))
   .toMatchObject({ok:false,reason:"INVALID_MEASUREMENT"});
  expect(step(outcome,event("MEASURE",7,{measuredOutcome:{value:12,unit:"CURRENCY_PER_UNIT",currency:"YER",measuredAt:at,evidenceIds:["actual-1"]}})))
   .toMatchObject({ok:true,duplicate:false,outcome:{measuredOutcome:{currency:"YER"}}});
 });
});
