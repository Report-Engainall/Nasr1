import type {DataCompleteness,EvidencePassport,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";
export interface BuildEvidencePassportInput {id:string;generatedAt:string;asOf:string;evidenceRecords:EvidenceRecord[];metrics:MetricSnapshot[]}
const validTime=(v:string)=>typeof v==="string"&&v.length>0&&Number.isFinite(Date.parse(v));
const unique=(v:string[])=>[...new Set(v.filter(Boolean))];
function normalize(metric:MetricSnapshot,records:Map<string,EvidenceRecord>,duplicates:Set<string>):MetricSnapshot {
 if(metric.status!=="VERIFIED") return metric;
 const ids=metric.lineage?.evidenceIds??[], warnings=[...(metric.warnings??[])];
 const downgrade=(status:EvidenceStatus,warning:string,completeness=metric.completeness):MetricSnapshot=>({...metric,status,completeness,warnings:unique([...warnings,warning])});
 if(!ids.length)return downgrade("UNVERIFIED","NO_SOURCE_LINEAGE");
 if(ids.some(id=>duplicates.has(id)))return downgrade("UNVERIFIED","AMBIGUOUS_EVIDENCE_ID");
 const sources=ids.map(id=>records.get(id));
 if(sources.some(s=>!s))return downgrade("UNVERIFIED","SOURCE_RECORD_MISSING");
 const rs=sources.filter((s):s is EvidenceRecord=>Boolean(s));
 if(rs.some(s=>s.status==="UNAVAILABLE"))return downgrade("UNAVAILABLE","SOURCE_UNAVAILABLE");
 if(rs.some(s=>s.status==="UNVERIFIED"))return downgrade("UNVERIFIED","SOURCE_UNVERIFIED");
 if(rs.some(s=>s.status==="NEEDS_REVIEW"))return downgrade("NEEDS_REVIEW","SOURCE_NEEDS_REVIEW","PARTIAL");
 if(rs.some(s=>!validTime(s.sourceTimestamp)||!validTime(s.asOf)))return downgrade("NEEDS_REVIEW","SOURCE_TIMESTAMP_INVALID","PARTIAL");
 if(rs.some(s=>s.completeness!=="COMPLETE"))return downgrade("NEEDS_REVIEW","SOURCE_INCOMPLETE","PARTIAL");
 if(rs.some(s=>s.quality!=="ACCEPTABLE"))return downgrade(rs.some(s=>s.quality==="INVALID")?"UNVERIFIED":"NEEDS_REVIEW","SOURCE_QUALITY_NOT_ACCEPTABLE","PARTIAL");
 if(metric.value===null||!validTime(metric.asOf)||!validTime(metric.lineage.calculatedAt)||!metric.lineage.formulaId.trim()||!metric.lineage.formulaVersion.trim())
  return downgrade("NEEDS_REVIEW","METRIC_METADATA_INCOMPLETE","PARTIAL");
 if(metric.unit==="CURRENCY"&&!metric.currency?.trim())return downgrade("NEEDS_REVIEW","CURRENCY_NOT_IDENTIFIED","PARTIAL");
 return {...metric,warnings:unique(warnings)};
}
function statusRollup(statuses:EvidenceStatus[]):EvidenceStatus {
 if(!statuses.length)return "UNAVAILABLE";
 if(statuses.includes("UNVERIFIED"))return "UNVERIFIED";
 if(statuses.includes("NEEDS_REVIEW"))return "NEEDS_REVIEW";
 if(statuses.every(s=>s==="UNAVAILABLE"))return "UNAVAILABLE";
 if(statuses.includes("UNAVAILABLE"))return "NEEDS_REVIEW";
 return "VERIFIED";
}
function completenessRollup(metrics:MetricSnapshot[]):DataCompleteness {
 if(!metrics.length)return "UNKNOWN";
 if(metrics.every(m=>m.completeness==="COMPLETE"))return "COMPLETE";
 if(metrics.some(m=>m.completeness==="PARTIAL"))return "PARTIAL";
 return "UNKNOWN";
}
/** Preserve source provenance; downgrade unsupported VERIFIED claims and never promote weaker states. */
export function buildEvidencePassport(input:BuildEvidencePassportInput):EvidencePassport {
 const records=new Map<string,EvidenceRecord>(),duplicates=new Set<string>();
 for(const record of input.evidenceRecords){if(records.has(record.id))duplicates.add(record.id);else records.set(record.id,record)}
 const metrics=input.metrics.map(m=>normalize(m,records,duplicates));
 const warnings=unique([...input.evidenceRecords.flatMap(r=>r.warnings??[]),...metrics.flatMap(m=>m.warnings??[]),...(duplicates.size?["DUPLICATE_EVIDENCE_RECORD_ID"]:[])]);
 return {id:input.id,generatedAt:input.generatedAt,asOf:input.asOf,status:statusRollup(metrics.map(m=>m.status)),completeness:completenessRollup(metrics),evidenceRecords:input.evidenceRecords,metrics,warnings};
}
