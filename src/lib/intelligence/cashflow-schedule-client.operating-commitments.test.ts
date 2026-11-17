import { describe, expect, it } from "vitest";
import type { IntelligenceAggregateRequest } from "./aggregate-contract";
import { parseOperatingExpenseCommitmentScheduleResponse } from "./cashflow-schedule-client";
const asOf="2026-11-17T00:00:00.000Z",commitmentId="11111111-1111-4111-8111-111111111111",documentId="22222222-2222-4222-8222-222222222222";
const request:IntelligenceAggregateRequest={requestId:"cashflow-operating-test",metricKeys:["cashflow.schedule"],period:{from:"2026-11-17",to:"2026-12-17"},asOf,currency:"YER"};
function response(){return {status:"OK",completeness:"COMPLETE",quality:"ACCEPTABLE",asOf,period:request.period,currency:"YER",sideEffects:"NONE",
 entries:[{id:"cash-expense-commitment-outflow:"+commitmentId,direction:"OUTFLOW",dueDate:"2026-11-20",
 amount:{id:"metric:"+commitmentId,key:"cashflow.operating_expense_commitment",value:"250.75",unit:"CURRENCY",currency:"YER",status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",asOf,
 lineage:{evidenceIds:["cash-expense-commitment:"+commitmentId,"cash-expense-commitment-evidence:"+documentId],formulaId:"nasr1.approved-operating-expense-commitment",formulaVersion:"1"}}}],
 evidenceRecords:[
 {id:"cash-expense-commitment:"+commitmentId,source:{kind:"TABLE",name:"cash_expense_commitments",recordId:commitmentId,version:"approved"},sourceTimestamp:asOf,asOf,period:request.period,currency:"YER",status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]},
 {id:"cash-expense-commitment-evidence:"+documentId,source:{kind:"TABLE",name:"cash_expense_commitment_evidence",recordId:documentId,version:"sha256"},sourceTimestamp:asOf,asOf,period:request.period,currency:"YER",status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]}],
 pendingApprovalCount:0,overdueApprovedCount:0,paymentAwaitingJournalCount:0,missingEvidenceCount:0,changedAfterAsOfCount:0,warnings:[]};}
describe("operating commitment cashflow evidence",()=>{
 it("accepts verified in-window outflows with both commitment and source-document lineage",()=>expect(parseOperatingExpenseCommitmentScheduleResponse(response(),request)).toMatchObject({status:"OK",entries:[{direction:"OUTFLOW",dueDate:"2026-11-20",amount:{value:250.75}}]}));
 it("rejects out-of-window dates, altered IDs and substituted metrics",()=>{
  const date=response();date.entries[0].dueDate="2026-12-18";expect(parseOperatingExpenseCommitmentScheduleResponse(date,request)).toBeNull();
  const id=response();id.entries[0].id="supplier:"+commitmentId;expect(parseOperatingExpenseCommitmentScheduleResponse(id,request)).toBeNull();
  const metric=response();metric.entries[0].amount.key="cashflow.expected_collections";expect(parseOperatingExpenseCommitmentScheduleResponse(metric,request)).toBeNull();
 });
 it("rejects commitment metric or source records that belong to a different commitment",()=>{
  const wrongCommitment=response();
  wrongCommitment.evidenceRecords[0].id="cash-expense-commitment:33333333-3333-4333-8333-333333333333";
  wrongCommitment.evidenceRecords[0].source.recordId="33333333-3333-4333-8333-333333333333";
  wrongCommitment.entries[0].amount.lineage.evidenceIds[0]=wrongCommitment.evidenceRecords[0].id;
  expect(parseOperatingExpenseCommitmentScheduleResponse(wrongCommitment,request)).toBeNull();
  const wrongDocument=response();
  wrongDocument.evidenceRecords[1].source.recordId="33333333-3333-4333-8333-333333333333";
  expect(parseOperatingExpenseCommitmentScheduleResponse(wrongDocument,request)).toBeNull();
  const wrongMetric=response();
  wrongMetric.entries[0].amount.id="metric:cash-expense-commitment:33333333-3333-4333-8333-333333333333";
  expect(parseOperatingExpenseCommitmentScheduleResponse(wrongMetric,request)).toBeNull();
 });
 it("rejects missing evidence links, unverified amounts and formula substitution",()=>{
  const missing=response();missing.entries[0].amount.lineage.evidenceIds=["cash-expense-commitment:"+commitmentId];expect(parseOperatingExpenseCommitmentScheduleResponse(missing,request)).toBeNull();
  const unverified=response();unverified.entries[0].amount.status="NEEDS_REVIEW";expect(parseOperatingExpenseCommitmentScheduleResponse(unverified,request)).toBeNull();
  const formula=response();formula.entries[0].amount.lineage.formulaId="client.supplied";expect(parseOperatingExpenseCommitmentScheduleResponse(formula,request)).toBeNull();
 });
 it("retains PARTIAL when approval or a journal is outstanding",()=>{
  const partial=response();partial.status="PARTIAL";partial.completeness="PARTIAL";partial.quality="WARNINGS";partial.paymentAwaitingJournalCount=1;
  expect(parseOperatingExpenseCommitmentScheduleResponse(partial,request)).toMatchObject({status:"PARTIAL",completeness:"PARTIAL",quality:"WARNINGS"});
 });
});
