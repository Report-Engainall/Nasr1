import {describe,expect,it} from "vitest";
import {evaluateCanonicalCapability} from "./rbac-contract";
import type {CanonicalRbacSnapshot} from "./rbac-contract";
import type {EvidenceRecord} from "./types";
const at="2026-10-30T07:00:00Z";
const evidence:EvidenceRecord={id:"catalog",source:{kind:"RPC",name:"auth.current_capabilities"},sourceTimestamp:at,asOf:at,period:null,status:"VERIFIED",completeness:"COMPLETE",quality:"ACCEPTABLE",warnings:[]};
const snapshot:CanonicalRbacSnapshot={asOf:at,status:"VERIFIED",source:"SERVER_CANONICAL_PERMISSION_CATALOG",actorRole:"manager",actorCapabilities:["orders.read"],
 roles:[{roleId:"manager",label:"Manager",capabilityIds:["orders.read","inventory.read"],sourceVersion:"db-v1"}],evidenceIds:["catalog"]};
describe("canonical RBAC contract",()=>{
 it("allows only a server capability present in role and actor snapshots",()=>expect(evaluateCanonicalCapability({snapshot,evidenceRecords:[evidence],capabilityId:"orders.read"}).allowed).toBe(true));
 it("denies a capability absent from canonical role catalog",()=>expect(evaluateCanonicalCapability({snapshot,evidenceRecords:[evidence],capabilityId:"finance.delete"})).toMatchObject({allowed:false,reason:"CAPABILITY_NOT_GRANTED"}));
 it("withholds permission when source catalog is unverified",()=>expect(evaluateCanonicalCapability({snapshot:{...snapshot,status:"UNVERIFIED"},evidenceRecords:[],capabilityId:"orders.read"})).toMatchObject({allowed:false,status:"UNVERIFIED"}));
});
