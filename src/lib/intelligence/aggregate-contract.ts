import type {DataCompleteness,DataQuality,EvidenceRecord,EvidenceStatus,MetricSnapshot} from "./types";
/** Tenant identity is deliberately absent from the client request. */
export interface IntelligenceAggregateRequest {requestId:string;metricKeys:string[];period:{from:string;to:string};asOf:string;currency?:string|null}
export interface IntelligenceAggregateAuthorization {tenantScope:"SERVER_RESOLVED_AUTHENTICATED_TENANT";effectiveRole:string;capabilities:string[]}
export interface IntelligenceAggregateError {code:string;message:string;sqlState?:string}
export interface CashflowScheduleEntry {id:string;direction:"INFLOW"|"OUTFLOW";dueDate:string;amount:MetricSnapshot}
export interface CashflowScheduleAggregate {status:EvidenceStatus;completeness:DataCompleteness;quality:DataQuality;entries:CashflowScheduleEntry[];warnings:string[]}
export interface IntelligenceAggregateBase {
 requestId:string;asOf:string;period:{from:string;to:string};currency:string|null;
 authorization:IntelligenceAggregateAuthorization;sourceTables:string[];evidenceRecords:EvidenceRecord[];metrics:MetricSnapshot[];
 formulaVersions:string[];completeness:DataCompleteness;quality:DataQuality;warnings:string[];
 errors:IntelligenceAggregateError[];sqlState:string|null;sideEffects:"NONE";cashflowSchedule?:CashflowScheduleAggregate;
}
export type IntelligenceAggregateResponse=
 |(IntelligenceAggregateBase&{status:"OK"|"PARTIAL"})
 |(Omit<IntelligenceAggregateBase,"metrics"|"evidenceRecords"|"cashflowSchedule">&{status:"UNAVAILABLE"|"DENIED"|"ERROR";metrics:[];evidenceRecords:[];cashflowSchedule?:undefined});
