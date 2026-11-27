import {describe,expect,it} from "vitest";
import {buildSystemHealthSnapshot,type SystemHealthProbe} from "@/lib/intelligence/system-health";
import type {EvidenceRecord} from "@/lib/intelligence/types";

const asOf="2026-11-27T20:10:00.000Z";
const checkedAt="2026-11-27T20:09:30.000Z";
const component="DATABASE_READ";

function probe(overrides:Partial<SystemHealthProbe>={}):SystemHealthProbe {
 return {component,status:"HEALTHY",checkedAt,latencyMs:24,sourceEvidenceId:"probe:database:1",
  errorCode:null,owner:"platform_ops",freshForSeconds:120,...overrides};
}
function evidence(overrides:Partial<EvidenceRecord>={}):EvidenceRecord {
 return {id:"probe:database:1",source:{kind:"SYSTEM_PROBE",name:"database.read"},
  sourceTimestamp:checkedAt,asOf:checkedAt,period:null,status:"VERIFIED",completeness:"COMPLETE",
  quality:"ACCEPTABLE",warnings:[],...overrides};
}
function build(overrides:Partial<Parameters<typeof buildSystemHealthSnapshot>[0]>={}) {
 return buildSystemHealthSnapshot({asOf,requiredComponents:[component],probes:[probe()],
  evidenceRecords:[evidence()],...overrides});
}

describe("system health evidence and source-clock contract",()=>{
 it("marks a component healthy only with a fresh, complete SYSTEM_PROBE record",()=>{
  const result=build();
  expect(result.status).toBe("HEALTHY");
  expect(result.components[0]).toMatchObject({component,status:"HEALTHY",checkedAt,latencyMs:24,sourceEvidenceId:"probe:database:1",owner:"platform_ops"});
 });

 it.each([
  ["timezone-less","2026-11-27T20:10:00.000"],
  ["impossible calendar date","2026-02-30T20:10:00.000Z"],
  ["invalid hour","2026-11-27T25:10:00.000Z"],
  ["unsupported offset","2026-11-27T20:10:00.000+14:01"],
  ["fractional over-precision","2026-11-27T20:10:00.1234567890Z"],
 ])("rejects an invalid report clock: %s",(_label,timestamp)=>{
  expect(()=>build({asOf:timestamp})).toThrow("asOf must be a valid timezone-qualified timestamp");
 });

 it.each([
  ["timezone-less","2026-11-27T20:09:30.000"],
  ["impossible date","2026-02-30T20:09:30.000Z"],
  ["unsupported offset","2026-11-27T20:09:30.000+14:01"],
 ])("does not accept an invalid probe clock: %s",(_label,timestamp)=>{
  const result=build({probes:[probe({checkedAt:timestamp})]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.components[0].checkedAt).toBeNull();
  expect(result.warnings).toContain("PROBE_STALE_OR_INVALID");
 });

 it("does not treat an ordinary RPC evidence record as a health probe",()=>{
  const result=build({evidenceRecords:[evidence({source:{kind:"RPC",name:"public.get_ai_gateway_budget"}})]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.warnings).toContain("HEALTH_EVIDENCE_SOURCE_KIND_INVALID");
 });

 it("keeps global health unknown when a successful read has no persistent evidence",()=>{
  const result=build({evidenceRecords:[]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.warnings).toContain("HEALTH_EVIDENCE_MISSING");
 });

 it("rejects source evidence with a future or malformed source clock",()=>{
  const future=build({evidenceRecords:[evidence({sourceTimestamp:"2026-11-27T20:10:00.000Z"})]});
  const invalid=build({evidenceRecords:[evidence({sourceTimestamp:"2026-11-27T20:09:30.000"})]});
  expect(future.status).toBe("UNKNOWN");
  expect(invalid.status).toBe("UNKNOWN");
  expect(invalid.warnings).toContain("HEALTH_EVIDENCE_MISSING_OR_UNVERIFIED");
 });

 it("rejects duplicate evidence identities and duplicate probe rows",()=>{
  const duplicateEvidence=build({evidenceRecords:[evidence(),evidence()]});
  const duplicateProbe=build({probes:[probe(),probe()]});
  expect(duplicateEvidence.status).toBe("UNKNOWN");
  expect(duplicateEvidence.warnings).toContain("HEALTH_EVIDENCE_AMBIGUOUS");
  expect(duplicateProbe.status).toBe("UNKNOWN");
  expect(duplicateProbe.warnings).toContain("DUPLICATE_HEALTH_PROBE");
 });

 it.each([-1,1.5,Number.MAX_SAFE_INTEGER])("rejects an invalid freshness window: %s",freshForSeconds=>{
  const result=build({probes:[probe({freshForSeconds})]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.warnings).toContain("PROBE_STALE_OR_INVALID");
 });

 it.each([-1,1.5,600001])("rejects an invalid latency measurement: %s",latencyMs=>{
  const result=build({probes:[probe({latencyMs})]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.components[0].latencyMs).toBeNull();
  expect(result.warnings).toContain("INVALID_LATENCY");
 });

 it("does not return untrusted error details as error codes",()=>{
  const result=build({probes:[probe({errorCode:"provider key leaked to caller"})]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.components[0].errorCode).toBeNull();
  expect(result.warnings).toContain("PROBE_ERROR_CODE_INVALID");
 });

 it("keeps a safe error code visible but never reports a healthy component with it",()=>{
  const result=build({probes:[probe({status:"HEALTHY",errorCode:"PROBE_TIMEOUT"})]});
  expect(result.status).toBe("DEGRADED");
  expect(result.components[0]).toMatchObject({status:"DEGRADED",errorCode:"PROBE_TIMEOUT"});
 });

 it("preserves an observed unavailable state without inventing a healthy result",()=>{
  const result=build({probes:[probe({status:"UNAVAILABLE",sourceEvidenceId:null})],evidenceRecords:[]});
  expect(result.status).toBe("UNAVAILABLE");
 });

 it("reports a repeated required component as unknown instead of duplicating it",()=>{
  const result=build({requiredComponents:[component,component]});
  expect(result.components).toHaveLength(1);
  expect(result.status).toBe("UNKNOWN");
  expect(result.warnings).toContain("DUPLICATE_REQUIRED_COMPONENT");
 });

 it("keeps an empty required set unknown",()=>{
  const result=build({requiredComponents:[],probes:[],evidenceRecords:[]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.warnings).toContain("NO_REQUIRED_HEALTH_COMPONENTS");
 });
});
