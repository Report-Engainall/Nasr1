import type {EvidenceRecord,EvidenceStatus} from "./types";
export interface CanonicalRoleDefinition {roleId:string;label:string;capabilityIds:string[];sourceVersion:string}
export interface CanonicalRbacSnapshot {
 asOf:string;status:EvidenceStatus;source:"SERVER_CANONICAL_PERMISSION_CATALOG";actorRole:string;
 actorCapabilities:string[];roles:CanonicalRoleDefinition[];evidenceIds:string[];
}
export interface RbacCapabilityDecision {
 allowed:boolean;status:EvidenceStatus;capabilityId:string;actorRole:string;
 reason:"CANONICAL_CAPABILITY_PRESENT"|"CAPABILITY_NOT_GRANTED"|"CATALOG_NOT_VERIFIED"|"CAPABILITY_UNKNOWN";sourceVersion:string|null;
}
/** Read-only consumer of the server's canonical permissions; this module defines no local roles or enforcement. */
export function evaluateCanonicalCapability(input:{snapshot:CanonicalRbacSnapshot;evidenceRecords:EvidenceRecord[];capabilityId:string}):RbacCapabilityDecision {
 const evidence=new Map(input.evidenceRecords.map(e=>[e.id,e])),role=input.snapshot.roles.find(r=>r.roleId===input.snapshot.actorRole);
 const validEvidence=input.snapshot.evidenceIds.length>0&&input.snapshot.evidenceIds.every(id=>{
  const e=evidence.get(id);return Boolean(e&&e.status==="VERIFIED"&&e.completeness==="COMPLETE"&&e.quality==="ACCEPTABLE"&&e.asOf===input.snapshot.asOf);
 });
 const status:EvidenceStatus=input.snapshot.status==="UNVERIFIED"?"UNVERIFIED":input.snapshot.status==="VERIFIED"&&validEvidence&&role?"VERIFIED":"NEEDS_REVIEW";
 if(status!=="VERIFIED")return {allowed:false,status,capabilityId:input.capabilityId,actorRole:input.snapshot.actorRole,reason:"CATALOG_NOT_VERIFIED",sourceVersion:role?.sourceVersion??null};
 if(!input.capabilityId.trim())return {allowed:false,status,capabilityId:input.capabilityId,actorRole:input.snapshot.actorRole,reason:"CAPABILITY_UNKNOWN",sourceVersion:role.sourceVersion};
 if(!role.capabilityIds.includes(input.capabilityId))return {allowed:false,status,capabilityId:input.capabilityId,actorRole:input.snapshot.actorRole,reason:"CAPABILITY_NOT_GRANTED",sourceVersion:role.sourceVersion};
 const allowed=input.snapshot.actorCapabilities.includes(input.capabilityId);
 return {allowed,status,capabilityId:input.capabilityId,actorRole:input.snapshot.actorRole,
  reason:allowed?"CANONICAL_CAPABILITY_PRESENT":"CAPABILITY_NOT_GRANTED",sourceVersion:role.sourceVersion};
}
