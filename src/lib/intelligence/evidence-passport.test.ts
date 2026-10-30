import {describe,expect,it} from "vitest";
import {buildEvidencePassport} from "./evidence-passport";
import type {EvidenceRecord,MetricSnapshot} from "./types";
const evidence=(overrides:Partial<EvidenceRecord>={}):EvidenceRecord=>({
 id:"ev-1",source:{kind:"RPC",name:"analytics.orders",version:"v1"},sourceTimestamp:"2026-10-30T07:00:00Z",asOf:"2026-10-30T07:00:00Z",
 period:{from:"2026-10-01",to:"2026-10-30"},status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[],...overrides,
});
const metric=(overrides:Partial<MetricSnapshot>={}):MetricSnapshot=>({
 id:"m-1",key:"orders.pending",value:7,unit:"COUNT",status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",
 period:{from:"2026-10-01",to:"2026-10-30"},asOf:"2026-10-30T07:00:00Z",
 lineage:{evidenceIds:["ev-1"],calculatedAt:"2026-10-30T07:05:00Z",formulaId:"pending.count",formulaVersion:"1.0",transformations:["COUNT(status=pending)"]},
 warnings:[],...overrides,
});
describe("Evidence Passport",()=>{
 it("retains verified source and formula lineage",()=>{const p=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence()],metrics:[metric()]});expect(p.status).toBe("VERIFIED");expect(p.metrics[0].lineage.formulaVersion).toBe("1.0")});
 it("never upgrades an unverified metric",()=>{const p=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence()],metrics:[metric({status:"UNVERIFIED"})]});expect(p.metrics[0].status).toBe("UNVERIFIED")});
 it("downgrades a claimed verified value with no source",()=>{const p=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence()],metrics:[metric({lineage:{...metric().lineage,evidenceIds:[]}})]});expect(p.metrics[0].status).toBe("UNVERIFIED");expect(p.metrics[0].warnings).toContain("NO_SOURCE_LINEAGE")});
 it("preserves null rather than converting unknown to zero",()=>{const p=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence()],metrics:[metric({value:null})]});expect(p.metrics[0].value).toBeNull();expect(p.metrics[0].status).toBe("NEEDS_REVIEW")});
 it("marks incomplete sources for review and keeps completeness partial",()=>{const p=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence({completeness:"PARTIAL"})],metrics:[metric()]});expect(p.metrics[0].status).toBe("NEEDS_REVIEW");expect(p.metrics[0].completeness).toBe("PARTIAL")});
 it("requires a currency code for money metrics",()=>{const p=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence()],metrics:[metric({unit:"CURRENCY"})]});expect(p.metrics[0].status).toBe("NEEDS_REVIEW")});
 it("requires currency lineage and rejects conflicting source currencies",()=>{
  const missing=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence()],metrics:[metric({unit:"CURRENCY",currency:"YER"})]});
  expect(missing.metrics[0].status).toBe("NEEDS_REVIEW");
  const conflict=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence({currency:"USD"})],metrics:[metric({unit:"CURRENCY",currency:"YER"})]});
  expect(conflict.metrics[0].status).toBe("UNVERIFIED");
 });
 it("downgrades evidence missing from the passport",()=>{const p=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[],metrics:[metric()]});expect(p.metrics[0].status).toBe("UNVERIFIED")});
 it("does not verify metrics whose as-of or source period differs from the passport",()=>{
  const stale=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence()],metrics:[metric({asOf:"2026-10-29T07:00:00Z"})]});
  expect(stale.metrics[0].status).toBe("NEEDS_REVIEW");expect(stale.metrics[0].warnings).toContain("METRIC_AS_OF_MISMATCH");
  const wrongPeriod=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence({period:{from:"2026-09-01",to:"2026-09-30"}})],metrics:[metric()]});
  expect(wrongPeriod.metrics[0].status).toBe("NEEDS_REVIEW");expect(wrongPeriod.metrics[0].warnings).toContain("SOURCE_PERIOD_MISMATCH");
 });
 it("rejects source timestamps later than their metric as-of",()=>{
  const p=buildEvidencePassport({id:"p",generatedAt:"2026-10-30T07:06:00Z",asOf:"2026-10-30T07:00:00Z",evidenceRecords:[evidence({sourceTimestamp:"2026-10-30T07:01:00Z"})],metrics:[metric()]});
  expect(p.metrics[0].status).toBe("NEEDS_REVIEW");expect(p.metrics[0].warnings).toContain("SOURCE_TIMESTAMP_AFTER_METRIC_AS_OF");
 });
});
