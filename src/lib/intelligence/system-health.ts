import type {EvidenceRecord} from "./types";

export type HealthStatus="HEALTHY"|"DEGRADED"|"UNAVAILABLE"|"UNKNOWN";
export interface SystemHealthProbe {
 component:string;status:HealthStatus;checkedAt:string;latencyMs:number|null;sourceEvidenceId:string|null;
 errorCode:string|null;owner:string|null;freshForSeconds:number;
}
export interface SystemHealthComponent {
 component:string;status:HealthStatus;checkedAt:string|null;latencyMs:number|null;sourceEvidenceId:string|null;
 errorCode:string|null;owner:string|null;warnings:string[];
}
export interface SystemHealthSnapshot {
 asOf:string;status:HealthStatus;components:SystemHealthComponent[];evidenceRecords:EvidenceRecord[];warnings:string[];
}

const HEALTH_STATUSES=new Set<HealthStatus>(["HEALTHY","DEGRADED","UNAVAILABLE","UNKNOWN"]);
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/;
const SAFE_ERROR_CODE=/^[A-Z0-9][A-Z0-9_.-]{0,79}$/;
const SAFE_OWNER=/^[A-Za-z][A-Za-z0-9._:-]{0,63}$/;

/** Parse a real ISO-8601 instant without Date.parse's timezone-less/date-normalizing leniency. */
function strictInstant(value:unknown):number|null {
 if(typeof value!=="string"||
  !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,9})?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/.test(value))return null;
 const year=Number(value.slice(0,4)),month=Number(value.slice(5,7)),day=Number(value.slice(8,10));
 const leap=year%4===0&&(year%100!==0||year%400===0);
 const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 if(day>days[month-1])return null;
 const parsed=Date.parse(value);
 return Number.isFinite(parsed)?parsed:null;
}
function unique(values:string[]):string[]{return [...new Set(values)];}
function unknownUnlessUnavailable(status:HealthStatus):HealthStatus {
 return status==="UNAVAILABLE"?"UNAVAILABLE":"UNKNOWN";
}

/**
 * A source can prove HEALTHY only when it is a fresh, valid SYSTEM_PROBE evidence
 * record tied to the exact checkedAt instant. Missing evidence never becomes healthy.
 */
export function buildSystemHealthSnapshot(input:{
 asOf:string;requiredComponents:string[];probes:SystemHealthProbe[];evidenceRecords:EvidenceRecord[];
}):SystemHealthSnapshot {
 const now=strictInstant(input.asOf);
 if(now===null)throw new Error("asOf must be a valid timezone-qualified timestamp");

 if(!Array.isArray(input.requiredComponents)||!Array.isArray(input.probes)||!Array.isArray(input.evidenceRecords))
  throw new Error("system health input collections must be arrays");

 if(input.requiredComponents.length===0)return {
  asOf:input.asOf,status:"UNKNOWN",components:[],evidenceRecords:input.evidenceRecords,
  warnings:["NO_REQUIRED_HEALTH_COMPONENTS"],
 };

 const requiredCounts=new Map<string,number>();
 for(const component of input.requiredComponents){
  if(typeof component==="string"&&IDENTIFIER.test(component))
   requiredCounts.set(component,(requiredCounts.get(component)??0)+1);
 }
 const evidence=new Map<string,EvidenceRecord[]>(),byName=new Map<string,SystemHealthProbe[]>();
 const inputWarnings:string[]=[];
 for(const record of input.evidenceRecords){
  const id=record&&typeof record.id==="string"?record.id:"";
  if(!IDENTIFIER.test(id)){inputWarnings.push("HEALTH_EVIDENCE_RECORD_ID_INVALID");continue;}
  const rows=evidence.get(id)??[];rows.push(record);evidence.set(id,rows);
 }
 for(const probe of input.probes){
  const component=probe&&typeof probe.component==="string"?probe.component:"";
  if(!IDENTIFIER.test(component)){inputWarnings.push("HEALTH_PROBE_COMPONENT_INVALID");continue;}
  const rows=byName.get(component)??[];rows.push(probe);byName.set(component,rows);
 }

 const requiredNames=[...requiredCounts.keys()];
 if(requiredNames.length!==input.requiredComponents.length)inputWarnings.push("REQUIRED_COMPONENT_INVALID");
 const components:SystemHealthComponent[]=[];
 for(const name of requiredNames){
  const warnings:string[]=[];
  if((requiredCounts.get(name)??0)!==1){
   components.push({component:name,status:"UNKNOWN",checkedAt:null,latencyMs:null,sourceEvidenceId:null,errorCode:null,owner:null,
    warnings:["DUPLICATE_REQUIRED_COMPONENT"]});
   continue;
  }
  const rows=byName.get(name)??[];
  if(rows.length!==1){
   components.push({component:name,status:"UNKNOWN",checkedAt:null,latencyMs:null,sourceEvidenceId:null,errorCode:null,owner:null,
    warnings:[rows.length?"DUPLICATE_HEALTH_PROBE":"REQUIRED_PROBE_MISSING"]});
   continue;
  }

  const probe=rows[0];
  const checked=strictInstant(probe.checkedAt);
  const freshSeconds=probe.freshForSeconds;
  const freshMs=Number.isSafeInteger(freshSeconds)&&freshSeconds>=0?freshSeconds*1000:Number.NaN;
  let status:HealthStatus=HEALTH_STATUSES.has(probe.status)?probe.status:"UNKNOWN";
  if(!HEALTH_STATUSES.has(probe.status))warnings.push("PROBE_STATUS_INVALID");
  if(checked===null||checked>now||!Number.isSafeInteger(freshSeconds)||freshSeconds<0||!Number.isSafeInteger(freshMs)||now-checked>freshMs){
   status="UNKNOWN";warnings.push("PROBE_STALE_OR_INVALID");
  }

  const evidenceId=typeof probe.sourceEvidenceId==="string"&&IDENTIFIER.test(probe.sourceEvidenceId)?probe.sourceEvidenceId:null;
  const evidenceRows=evidenceId?(evidence.get(evidenceId)??[]):[];
  const record=evidenceRows.length===1?evidenceRows[0]:undefined;
  if(probe.sourceEvidenceId!==null&&evidenceId===null)warnings.push("HEALTH_EVIDENCE_ID_INVALID");
  if(evidenceRows.length>1){
   status=unknownUnlessUnavailable(status);warnings.push("HEALTH_EVIDENCE_AMBIGUOUS");
  }else if(!record){
   status=unknownUnlessUnavailable(status);warnings.push("HEALTH_EVIDENCE_MISSING");
  }else if(record.source?.kind!=="SYSTEM_PROBE"){
   status=unknownUnlessUnavailable(status);warnings.push("HEALTH_EVIDENCE_SOURCE_KIND_INVALID");
  }else{
   const sourceTime=strictInstant(record.sourceTimestamp),evidenceAsOf=strictInstant(record.asOf);
   if(record.status!=="VERIFIED"||record.completeness!=="COMPLETE"||record.quality!=="ACCEPTABLE"||
    evidenceAsOf===null||record.asOf!==probe.checkedAt||sourceTime===null||checked===null||sourceTime>checked){
    status=unknownUnlessUnavailable(status);warnings.push("HEALTH_EVIDENCE_MISSING_OR_UNVERIFIED");
   }
  }

  const latency=probe.latencyMs;
  const safeLatency=latency===null?null:
   Number.isSafeInteger(latency)&&latency>=0&&latency<=600_000?latency:null;
  if(latency!==null&&safeLatency===null){status="UNKNOWN";warnings.push("INVALID_LATENCY");}

  let errorCode:string|null=null;
  if(probe.errorCode!==null){
   if(typeof probe.errorCode==="string"&&SAFE_ERROR_CODE.test(probe.errorCode)){
    errorCode=probe.errorCode;
    if(status==="HEALTHY"){status="DEGRADED";warnings.push("ERROR_CODE_PRESENT");}
   }else{
    status="UNKNOWN";warnings.push("PROBE_ERROR_CODE_INVALID");
   }
  }
  let owner:string|null=null;
  if(probe.owner===null||probe.owner===""){
   warnings.push("OWNER_NOT_ASSIGNED");
  }else if(typeof probe.owner==="string"&&SAFE_OWNER.test(probe.owner)){
   owner=probe.owner;
  }else{
   warnings.push("OWNER_IDENTIFIER_INVALID");
  }

  components.push({
   component:name,status,checkedAt:checked===null?null:probe.checkedAt,
   latencyMs:safeLatency,sourceEvidenceId:evidenceId,errorCode,owner,warnings,
  });
 }

 const status=components.some(component=>component.status==="UNAVAILABLE")?"UNAVAILABLE":
  components.some(component=>component.status==="UNKNOWN")?"UNKNOWN":
  components.some(component=>component.status==="DEGRADED")?"DEGRADED":"HEALTHY";
 const warnings=unique([...inputWarnings,...components.flatMap(component=>component.warnings)]);
 return {asOf:input.asOf,status,components,evidenceRecords:input.evidenceRecords,warnings};
}
