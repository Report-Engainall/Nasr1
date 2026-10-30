import {describe,expect,it} from "vitest";
import {buildSystemHealthSnapshot} from "./system-health";
import type {EvidenceRecord} from "./types";
const at="2026-10-30T07:00:00Z";
const ev:EvidenceRecord={id:"db",source:{kind:"SYSTEM_PROBE",name:"health.db"},sourceTimestamp:at,asOf:at,period:null,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]};
const probe=(component:string,overrides:Record<string,unknown>={})=>({component,status:"HEALTHY" as const,checkedAt:at,latencyMs:12,sourceEvidenceId:"db",errorCode:null,owner:"platform",freshForSeconds:3600,...overrides});
describe("source-backed system health",()=>{
 it("reports healthy only when required probes are fresh and verified",()=>expect(buildSystemHealthSnapshot({asOf:at,requiredComponents:["db"],probes:[probe("db")],evidenceRecords:[ev]}).status).toBe("HEALTHY"));
 it("keeps a missing required component UNKNOWN",()=>expect(buildSystemHealthSnapshot({asOf:at,requiredComponents:["db","storage"],probes:[probe("db")],evidenceRecords:[ev]}).status).toBe("UNKNOWN"));
 it("marks stale or missing evidence as unknown",()=>expect(buildSystemHealthSnapshot({asOf:at,requiredComponents:["db"],probes:[probe("db",{checkedAt:"2026-10-28T00:00:00Z"})],evidenceRecords:[ev]}).components[0].status).toBe("UNKNOWN"));
 it("does not mark an empty required-probe catalog healthy",()=>expect(buildSystemHealthSnapshot({asOf:at,requiredComponents:[],probes:[],evidenceRecords:[]}).status).toBe("UNKNOWN"));
 it("does not upgrade an unavailable dependency",()=>expect(buildSystemHealthSnapshot({asOf:at,requiredComponents:["db"],probes:[probe("db",{status:"UNAVAILABLE"})],evidenceRecords:[ev]}).status).toBe("UNAVAILABLE"));
 it("does not trust a duplicate evidence ID when one copy is verified",()=>{
  const conflicting={...ev,status:"UNVERIFIED" as const};
  const result=buildSystemHealthSnapshot({asOf:at,requiredComponents:["db"],probes:[probe("db")],evidenceRecords:[ev,conflicting]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.components[0].warnings).toContain("HEALTH_EVIDENCE_AMBIGUOUS");
 });
 it("rejects source evidence timestamps later than the probe checkedAt",()=>{
  const future={...ev,sourceTimestamp:"2026-10-30T07:00:01Z"};
  const result=buildSystemHealthSnapshot({asOf:at,requiredComponents:["db"],probes:[probe("db")],evidenceRecords:[future]});
  expect(result.status).toBe("UNKNOWN");
  expect(result.components[0].warnings).toContain("HEALTH_EVIDENCE_MISSING_OR_UNVERIFIED");
 });
});
