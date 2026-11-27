import type {DataCompleteness,EvidencePassport,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";
import { timestampMicroseconds } from "./product-revenue-concentration-client";
export interface BuildEvidencePassportInput {id:string;generatedAt:string;asOf:string;evidenceRecords:EvidenceRecord[];metrics:MetricSnapshot[]}
const validTime=(value:unknown):value is string=>timestampMicroseconds(value)!==null;
const unique=(v:string[])=>[...new Set(v.filter(Boolean))];
function normalize(metric:MetricSnapshot,records:Map<string,EvidenceRecord>,duplicates:Set<string>,expectedAsOf:string,expectedGeneratedAt:string):MetricSnapshot {
 const ids=metric.lineage?.evidenceIds??[], warnings=[...(metric.warnings??[])];
 const downgrade=(status:EvidenceStatus,warning:string,completeness=metric.completeness):MetricSnapshot=>({...metric,status,completeness,warnings:unique([...warnings,warning])});
 if(!validTime(metric.lineage?.calculatedAt)){
  if(metric.status==="VERIFIED")return downgrade("NEEDS_REVIEW","METRIC_CALCULATION_TIMESTAMP_INVALID","PARTIAL");
  return {...metric,warnings:unique([...warnings,"METRIC_CALCULATION_TIMESTAMP_INVALID"])};
 }
 if(timestampMicroseconds(metric.lineage.calculatedAt)!>timestampMicroseconds(expectedGeneratedAt)!)
  return metric.status==="VERIFIED"
    ? downgrade("NEEDS_REVIEW","METRIC_CALCULATED_AFTER_REPORT_GENERATION","PARTIAL")
    : {...metric,warnings:unique([...warnings,"METRIC_CALCULATED_AFTER_REPORT_GENERATION"])};
 if(metric.status!=="VERIFIED") return metric;
 if(!ids.length)return downgrade("UNVERIFIED","NO_SOURCE_LINEAGE");
 if(ids.some(id=>duplicates.has(id)))return downgrade("UNVERIFIED","AMBIGUOUS_EVIDENCE_ID");
 const sources=ids.map(id=>records.get(id));
 if(sources.some(s=>!s))return downgrade("UNVERIFIED","SOURCE_RECORD_MISSING");
 const rs=sources.filter((s):s is EvidenceRecord=>Boolean(s));
 if(rs.some(s=>s.status==="UNAVAILABLE"))return downgrade("UNAVAILABLE","SOURCE_UNAVAILABLE");
 if(rs.some(s=>s.status==="UNVERIFIED"))return downgrade("UNVERIFIED","SOURCE_UNVERIFIED");
 if(rs.some(s=>s.status==="NEEDS_REVIEW"))return downgrade("NEEDS_REVIEW","SOURCE_NEEDS_REVIEW","PARTIAL");
 if(rs.some(s=>!validTime(s.sourceTimestamp)||!validTime(s.asOf)))return downgrade("NEEDS_REVIEW","SOURCE_TIMESTAMP_INVALID","PARTIAL");
 const metricAsOfMicros=timestampMicroseconds(metric.asOf);
 if(metricAsOfMicros===null||metricAsOfMicros!==timestampMicroseconds(expectedAsOf))return downgrade("NEEDS_REVIEW","METRIC_AS_OF_MISMATCH","PARTIAL");
 if(rs.some(s=>timestampMicroseconds(s.asOf)!==metricAsOfMicros))return downgrade("NEEDS_REVIEW","SOURCE_AS_OF_MISMATCH","PARTIAL");
 if(rs.some(s=>timestampMicroseconds(s.sourceTimestamp)!>timestampMicroseconds(metric.asOf)!))return downgrade("NEEDS_REVIEW","SOURCE_TIMESTAMP_AFTER_METRIC_AS_OF","PARTIAL");
 if(metric.period&&rs.some(s=>!s.period||s.period.from!==metric.period?.from||s.period.to!==metric.period?.to))
  return downgrade("NEEDS_REVIEW","SOURCE_PERIOD_MISMATCH","PARTIAL");
 if(rs.some(s=>s.completeness!=="COMPLETE"))return downgrade("NEEDS_REVIEW","SOURCE_INCOMPLETE","PARTIAL");
 if(rs.some(s=>s.quality!=="ACCEPTABLE"))return downgrade(rs.some(s=>s.quality==="INVALID")?"UNVERIFIED":"NEEDS_REVIEW","SOURCE_QUALITY_NOT_ACCEPTABLE","PARTIAL");
 if(metric.completeness!=="COMPLETE")return downgrade("NEEDS_REVIEW","METRIC_INCOMPLETE","PARTIAL");
 if(metric.quality!=="ACCEPTABLE")return downgrade(metric.quality==="INVALID"?"UNVERIFIED":"NEEDS_REVIEW","METRIC_QUALITY_NOT_ACCEPTABLE","PARTIAL");
 if(metric.value===null||!validTime(metric.asOf)||!metric.lineage.formulaId.trim()||!metric.lineage.formulaVersion.trim())
  return downgrade("NEEDS_REVIEW","METRIC_METADATA_INCOMPLETE","PARTIAL");
 // Domain engines own the comparison against their business snapshot. Keep the
 // shared passport responsible for timestamp syntax, not snapshot semantics.
 if(metric.unit==="CURRENCY"||metric.unit==="CURRENCY_PER_UNIT"){
  if(!metric.currency?.trim())return downgrade("NEEDS_REVIEW","CURRENCY_NOT_IDENTIFIED","PARTIAL");
  if(rs.some(s=>!s.currency?.trim()))return downgrade("NEEDS_REVIEW","SOURCE_CURRENCY_MISSING","PARTIAL");
  if(rs.some(s=>s.currency!==metric.currency))return downgrade("UNVERIFIED","SOURCE_CURRENCY_CONFLICT","PARTIAL");
 }
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
 if(!validTime(input.generatedAt)||!validTime(input.asOf))
  throw new Error("generatedAt and asOf must be valid timezone-qualified timestamps");
 if(timestampMicroseconds(input.asOf)!>timestampMicroseconds(input.generatedAt)!)
  throw new Error("asOf cannot be after generatedAt");
 const metrics=input.metrics.map(m=>normalize(m,records,duplicates,input.asOf,input.generatedAt));
 const warnings=unique([...input.evidenceRecords.flatMap(r=>r.warnings??[]),...metrics.flatMap(m=>m.warnings??[]),...(duplicates.size?["DUPLICATE_EVIDENCE_RECORD_ID"]:[])]);
 return {id:input.id,generatedAt:input.generatedAt,asOf:input.asOf,status:statusRollup(metrics.map(m=>m.status)),completeness:completenessRollup(metrics),evidenceRecords:input.evidenceRecords,metrics,warnings};
}
