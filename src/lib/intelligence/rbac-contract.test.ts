import {describe,expect,it} from "vitest";
import {buildCanonicalCapabilityMatrix,evaluateCanonicalCapability} from "./rbac-contract";
import type {CanonicalRbacSnapshot} from "./rbac-contract";
import type {EvidenceRecord} from "./types";
const at="2026-10-30T07:00:00Z";
const evidence:EvidenceRecord={id:"catalog",source:{kind:"RPC",name:"auth.current_capabilities"},sourceTimestamp:at,asOf:at,period:null,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]};
const snapshot:CanonicalRbacSnapshot={asOf:at,status:"VERIFIED",source:"SERVER_CANONICAL_PERMISSION_CATALOG",actorRole:"manager",actorCapabilities:["orders.read"],
 roles:[
  {roleId:"manager",label:"Manager",capabilityIds:["orders.read","inventory.read"],sourceVersion:"db-v1"},
  {roleId:"staff",label:"Staff",capabilityIds:["orders.read"],sourceVersion:"db-v1"},
 ],
 capabilities:[
  {capabilityId:"orders.read",resource:"orders",operation:"read",tenantScope:"TENANT",sensitivity:"TENANT_DATA",policyRef:"rpc:get_orders",policyVersion:"db-v1"},
  {capabilityId:"inventory.read",resource:"inventory",operation:"read",tenantScope:"ASSIGNED",sensitivity:"TENANT_DATA",policyRef:"rpc:get_inventory",policyVersion:"db-v1"},
  {capabilityId:"finance.delete",resource:"finance",operation:"delete",tenantScope:"TENANT",sensitivity:"FINANCIAL",policyRef:"rpc:delete_finance",policyVersion:"db-v1"},
 ],evidenceIds:["catalog"]};
describe("canonical RBAC contract",()=>{
 it("allows only a server capability present in role and actor snapshots",()=>expect(evaluateCanonicalCapability({snapshot,evidenceRecords:[evidence],capabilityId:"orders.read"}).allowed).toBe(true));
 it("denies a capability absent from canonical role catalog",()=>expect(evaluateCanonicalCapability({snapshot,evidenceRecords:[evidence],capabilityId:"finance.delete"})).toMatchObject({allowed:false,reason:"CAPABILITY_NOT_GRANTED"}));
 it("withholds permission when source catalog is unverified",()=>expect(evaluateCanonicalCapability({snapshot:{...snapshot,status:"UNVERIFIED"},evidenceRecords:[],capabilityId:"orders.read"})).toMatchObject({allowed:false,status:"UNVERIFIED"}));

 it("projects the server catalog across roles and resource dimensions without enforcing permissions",()=>{
  const matrix=buildCanonicalCapabilityMatrix({snapshot,evidenceRecords:[evidence]});
  expect(matrix.status).toBe("VERIFIED");
  expect(matrix.rows).toHaveLength(6);
  expect(matrix.rows).toContainEqual(expect.objectContaining({
   roleId:"manager",capabilityId:"inventory.read",resource:"inventory",operation:"read",
   tenantScope:"ASSIGNED",sensitivity:"TENANT_DATA",roleMappingDecision:"ALLOW",actorEffectiveDecision:"DENY",
   reasonCode:"CANONICAL_ROLE_MAPPING_PRESENT",policyVersion:"db-v1",
  }));
  expect(matrix.rows).toContainEqual(expect.objectContaining({
   roleId:"staff",capabilityId:"finance.delete",roleMappingDecision:"DENY",actorEffectiveDecision:null,
   reasonCode:"CANONICAL_ROLE_MAPPING_ABSENT",
  }));
 });
 it("withholds the entire matrix when a role references an unknown server capability",()=>{
  const invalid={...snapshot,roles:[{...snapshot.roles[0],capabilityIds:["unknown.capability"]},snapshot.roles[1]]};
  expect(buildCanonicalCapabilityMatrix({snapshot:invalid,evidenceRecords:[evidence]})).toMatchObject({
   status:"NEEDS_REVIEW",rows:[],warnings:["SERVER_PERMISSION_CATALOG_MAPPING_INVALID"],
  });
 });
});
