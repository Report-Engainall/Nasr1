import { supabase } from "@/lib/supabase";
import type { IntelligenceAggregateRequest } from "./aggregate-contract";
import type { EvidenceRecord, EvidenceSourceKind } from "./types";

export type IntelligenceEvidenceStatus = "VERIFIED" | "NEEDS_REVIEW" | "UNVERIFIED" | "UNAVAILABLE";
export type IntelligenceCompleteness = "COMPLETE" | "PARTIAL" | "UNKNOWN";
export type IntelligenceQuality = "ACCEPTABLE" | "WARNINGS" | "INVALID" | "UNKNOWN";

export interface CashflowScheduleAmount {
  id: string;
  key: string;
  value: number;
  currency: string;
  status: IntelligenceEvidenceStatus;
  completeness: IntelligenceCompleteness;
  quality: IntelligenceQuality;
  asOf: string;
  lineage: { evidenceIds: string[]; formulaId: string; formulaVersion: string };
}
export interface CashflowScheduleRow {
  id: string;
  direction: "INFLOW" | "OUTFLOW";
  dueDate: string;
  amount: CashflowScheduleAmount;
}
export interface CashflowScheduleSnapshot {
  status: "OK" | "PARTIAL";
  requestId: string;
  asOf: string;
  period: { from: string; to: string };
  currency: string | null;
  effectiveRole: string;
  completeness: IntelligenceCompleteness;
  quality: IntelligenceQuality;
  schedule: {
    status: IntelligenceEvidenceStatus;
    completeness: IntelligenceCompleteness;
    quality: IntelligenceQuality;
    entries: CashflowScheduleRow[];
    warnings: string[];
  };
  evidenceCount: number;
  evidenceRecords: EvidenceRecord[];
  measurementMetrics: CashflowMeasurementProof[];
  warnings: string[];
}
export interface CashflowMeasurementProof {
  metricKey: "cashflow.expected_collections";
  value: number;
  unit: "CURRENCY";
  currency: string;
  status: "VERIFIED";
  completeness: "COMPLETE";
  quality: "ACCEPTABLE";
  period: { from: string; to: string };
  asOf: string;
  formulaId: string;
  formulaVersion: string;
  evidenceIds: string[];
}

export type CashflowScheduleResult =
  | { ok: true; data: CashflowScheduleSnapshot }
  | { ok: false; status: "DENIED" | "UNAVAILABLE" | "ERROR"; message: string };

type UnknownRecord = Record<string, unknown>;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}
function nonEmptyString(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function isoDay(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DAY.test(value)) return false;
  const parsed = new Date(value + "T00:00:00.000Z");
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
function isoTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && value.includes("T");
}
function stringList(value: unknown, max = 200): string[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  if (value.some((item) => !nonEmptyString(item, 500))) return null;
  return value as string[];
}
function addDays(day: string, days: number): string {
  const value = new Date(day + "T00:00:00.000Z");
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
function validRequest(request: IntelligenceAggregateRequest): void {
  const candidate = record(request);
  if (!candidate) throw new Error("طلب التحليل غير صالح.");
  const allowed = new Set(["requestId", "metricKeys", "period", "asOf", "currency"]);
  if (Object.keys(candidate).some((key) => !allowed.has(key))) {
    throw new Error("لا يسمح بتحديد المؤسسة أو المستخدم أو الصلاحيات من المتصفح.");
  }
  const period = record(candidate.period);
  if (
    !nonEmptyString(candidate.requestId, 100) ||
    !Array.isArray(candidate.metricKeys) ||
    candidate.metricKeys.length < 1 ||
    candidate.metricKeys.length > 20 ||
    candidate.metricKeys.some((key) => !nonEmptyString(key, 100)) ||
    new Set(candidate.metricKeys as string[]).size !== candidate.metricKeys.length ||
    !(candidate.metricKeys as string[]).includes("cashflow.schedule") ||
    !period ||
    Object.keys(period).some((key) => key !== "from" && key !== "to") ||
    !isoDay(period.from) ||
    !isoDay(period.to) ||
    period.from > period.to ||
    !isoTimestamp(candidate.asOf)
  ) {
    throw new Error("بيانات فترة التحليل أو مفاتيح المقاييس غير صالحة.");
  }
  const asOfDay = (candidate.asOf as string).slice(0, 10);
  if (!isoDay(asOfDay) || period.from < asOfDay || period.to > addDays(asOfDay, 90)) {
    throw new Error("فترة التحليل يجب أن تقع ضمن التسعين يومًا التالية لتاريخ الاحتساب.");
  }
  if (candidate.currency !== undefined && candidate.currency !== null &&
      (typeof candidate.currency !== "string" || !ISO_CURRENCY.test(candidate.currency))) {
    throw new Error("رمز العملة غير صالح.");
  }
}

export function createCashflowScheduleRequest(options: {
  horizonDays: 7 | 30 | 90;
  currency?: string | null;
  now?: Date;
  requestId?: string;
}): IntelligenceAggregateRequest {
  const now = options.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("وقت الاحتساب غير صالح.");
  const asOf = now.toISOString();
  const from = asOf.slice(0, 10);
  const request: IntelligenceAggregateRequest = {
    requestId: options.requestId ?? crypto.randomUUID(),
    metricKeys: ["cashflow.schedule"],
    period: { from, to: addDays(from, options.horizonDays) },
    asOf,
    ...(options.currency ? { currency: options.currency.toUpperCase() } : {}),
  };
  validRequest(request);
  return request;
}

function evidenceStatus(value: unknown): value is IntelligenceEvidenceStatus {
  return value === "VERIFIED" || value === "NEEDS_REVIEW" || value === "UNVERIFIED" || value === "UNAVAILABLE";
}
function completeness(value: unknown): value is IntelligenceCompleteness {
  return value === "COMPLETE" || value === "PARTIAL" || value === "UNKNOWN";
}
function quality(value: unknown): value is IntelligenceQuality {
  return value === "ACCEPTABLE" || value === "WARNINGS" || value === "INVALID" || value === "UNKNOWN";
}
function warnings(value: unknown): string[] | null {
  const list = stringList(value, 100);
  return list?.map((item) => item.slice(0, 300)) ?? null;
}
const evidenceSourceKinds = new Set<EvidenceSourceKind>([
  "TABLE", "RPC", "IMPORT_SNAPSHOT", "LEDGER", "MOVEMENT", "SYSTEM_PROBE", "MANUAL",
]);
function parseEvidenceRecord(value: unknown, expectedAsOf: string): EvidenceRecord | null {
  const raw = record(value);
  const source = record(raw?.source);
  const period = raw?.period === null ? null : record(raw?.period);
  const currency = raw?.currency;
  if (
    !raw || !source ||
    !nonEmptyString(raw.id, 500) ||
    !nonEmptyString(source.name, 150) ||
    typeof source.kind !== "string" || !evidenceSourceKinds.has(source.kind as EvidenceSourceKind) ||
    !isoTimestamp(raw.sourceTimestamp) || Date.parse(raw.sourceTimestamp) > Date.parse(expectedAsOf) ||
    raw.asOf !== expectedAsOf ||
    (raw.period !== null && (
      !period || !isoDay(period.from) || !isoDay(period.to) || period.from > period.to
    )) ||
    !nonEmptyString(currency, 3) || !ISO_CURRENCY.test(currency) ||
    !evidenceStatus(raw.status) ||
    !completeness(raw.completeness) ||
    !quality(raw.quality)
  ) return null;
  const recordWarnings = warnings(raw.warnings);
  if (!recordWarnings) return null;
  return {
    id: raw.id,
    source: {
      kind: source.kind as EvidenceSourceKind,
      name: source.name,
      ...(nonEmptyString(source.recordId, 200) ? { recordId: source.recordId } : {}),
      ...(nonEmptyString(source.version, 80) ? { version: source.version } : {}),
    },
    sourceTimestamp: raw.sourceTimestamp,
    asOf: expectedAsOf,
    period: raw.period === null ? null : { from: period!.from as string, to: period!.to as string },
    currency,
    status: raw.status,
    completeness: raw.completeness,
    quality: raw.quality,
    warnings: recordWarnings,
  };
}

function parseAmount(value: unknown, asOf: string, sourceEvidenceIds: Set<string>): CashflowScheduleAmount | null {
  const raw = record(value);
  const lineage = record(raw?.lineage);
  const evidenceIds = stringList(lineage?.evidenceIds, 100);
  const amount = typeof raw?.value === "number" ? raw.value
    : typeof raw?.value === "string" && raw.value.trim() ? Number(raw.value) : Number.NaN;
  if (
    !raw || !lineage ||
    !nonEmptyString(raw.id, 150) ||
    !nonEmptyString(raw.key, 150) ||
    !Number.isFinite(amount) || amount < 0 ||
    raw.unit !== "CURRENCY" ||
    !nonEmptyString(raw.currency, 3) || !ISO_CURRENCY.test(raw.currency) ||
    !evidenceStatus(raw.status) ||
    !completeness(raw.completeness) ||
    !quality(raw.quality) ||
    raw.asOf !== asOf ||
    !evidenceIds || evidenceIds.length === 0 ||
    new Set(evidenceIds).size !== evidenceIds.length ||
    evidenceIds.some((id) => !sourceEvidenceIds.has(id)) ||
    !nonEmptyString(lineage.formulaId, 150) ||
    !nonEmptyString(lineage.formulaVersion, 80)
  ) return null;
  return {
    id: raw.id,
    key: raw.key,
    value: amount,
    currency: raw.currency,
    status: raw.status,
    completeness: raw.completeness,
    quality: raw.quality,
    asOf,
    lineage: { evidenceIds, formulaId: lineage.formulaId, formulaVersion: lineage.formulaVersion },
  };
}

function parseMeasurementMetrics(value: unknown, request: IntelligenceAggregateRequest, sourceEvidenceIds: Set<string>): {
  metrics: CashflowMeasurementProof[];
  withheld: boolean;
} {
  if (!Array.isArray(value) || value.length > 100) return { metrics: [], withheld: true };
  const metrics: CashflowMeasurementProof[] = [];
  let withheld = false;
  const seen = new Set<string>();
  for (const item of value) {
    const raw = record(item);
    if (raw?.key !== "cashflow.expected_collections") continue;
    const lineage = record(raw.lineage);
    const period = record(raw.period);
    const evidenceIds = stringList(lineage?.evidenceIds, 500);
    const amount = typeof raw.value === "number" ? raw.value
      : typeof raw.value === "string" && raw.value.trim() ? Number(raw.value) : Number.NaN;
    const currency = raw.currency;
    if (
      !raw || !lineage || !period ||
      raw.unit !== "CURRENCY" ||
      !nonEmptyString(currency, 3) || !ISO_CURRENCY.test(currency) ||
      !Number.isFinite(amount) || amount < 0 ||
      raw.status !== "VERIFIED" || raw.completeness !== "COMPLETE" || raw.quality !== "ACCEPTABLE" ||
      raw.asOf !== request.asOf ||
      !isoDay(period.from) || !isoDay(period.to) ||
      period.from !== request.period.from || period.to !== request.period.to ||
      lineage.formulaId !== "nasr1.receivables-outstanding" ||
      lineage.formulaVersion !== "1" ||
      !evidenceIds || evidenceIds.length === 0 ||
      new Set(evidenceIds).size !== evidenceIds.length ||
      evidenceIds.some((id) => !sourceEvidenceIds.has(id)) ||
      seen.has(currency)
    ) {
      withheld = true;
      continue;
    }
    seen.add(currency);
    metrics.push({
      metricKey: "cashflow.expected_collections",
      value: amount,
      unit: "CURRENCY",
      currency,
      status: "VERIFIED",
      completeness: "COMPLETE",
      quality: "ACCEPTABLE",
      period: { from: period.from, to: period.to },
      asOf: request.asOf,
      formulaId: lineage.formulaId,
      formulaVersion: lineage.formulaVersion,
      evidenceIds,
    });
  }
  return { metrics, withheld };
}

export function parseCashflowScheduleResponse(
  value: unknown,
  request: IntelligenceAggregateRequest,
): CashflowScheduleResult {
  const raw = record(value);
  const authorization = record(raw?.authorization);
  const period = record(raw?.period);
  const schedule = record(raw?.cashflowSchedule);
  const scheduleWarnings = warnings(schedule?.warnings);
  const topWarnings = warnings(raw?.warnings);
  const evidenceRecords = raw?.evidenceRecords;
  if (
    !raw ||
    (raw.status !== "OK" && raw.status !== "PARTIAL") ||
    raw.requestId !== request.requestId ||
    raw.asOf !== request.asOf ||
    raw.sideEffects !== "NONE" ||
    authorization?.tenantScope !== "SERVER_RESOLVED_AUTHENTICATED_TENANT" ||
    !nonEmptyString(authorization.effectiveRole, 100) ||
    !period || !isoDay(period.from) || !isoDay(period.to) ||
    period.from !== request.period.from || period.to !== request.period.to ||
    (raw.currency !== null && raw.currency !== request.currency && raw.currency !== undefined) ||
    !schedule ||
    !evidenceStatus(schedule.status) ||
    !completeness(schedule.completeness) ||
    !quality(schedule.quality) ||
    !Array.isArray(schedule.entries) ||
    schedule.entries.length > 10000 ||
    !scheduleWarnings ||
    !topWarnings ||
    !Array.isArray(evidenceRecords) ||
    evidenceRecords.length > 20000
  ) {
    return { ok: false, status: "ERROR", message: "لم تُرجع قاعدة البيانات حزمة تدفق نقدي مكتملة وآمنة؛ أُوقف العرض." };
  }
  const parsedEvidenceRecords = evidenceRecords.map((item) => parseEvidenceRecord(item, request.asOf));
  if (parsedEvidenceRecords.some((item) => item === null)) {
    return { ok: false, status: "ERROR", message: "تحتوي أدلة التحصيل على مصدر أو تاريخ أو عملة غير موثقة؛ أُوقف العرض." };
  }
  const safeEvidenceRecords = parsedEvidenceRecords as EvidenceRecord[];
  const sourceEvidenceIds = new Set<string>();
  for (const evidence of safeEvidenceRecords) {
    if (sourceEvidenceIds.has(evidence.id)) {
      return { ok: false, status: "ERROR", message: "يحتوي سجل المصدر على مرجع دليل مكرر؛ أُوقف العرض." };
    }
    sourceEvidenceIds.add(evidence.id);
  }
  const measurement = parseMeasurementMetrics(raw.metrics, request, sourceEvidenceIds);
  const entries: CashflowScheduleRow[] = [];
  const ids = new Set<string>();
  for (const item of schedule.entries) {
    const row = record(item);
    const amount = parseAmount(row?.amount, request.asOf, sourceEvidenceIds);
    if (
      !row ||
      !nonEmptyString(row.id, 150) ||
      ids.has(row.id) ||
      (row.direction !== "INFLOW" && row.direction !== "OUTFLOW") ||
      !isoDay(row.dueDate) ||
      !amount
    ) {
      return { ok: false, status: "ERROR", message: "تحتوي حزمة التدفق النقدي على سجل غير موثق؛ أُوقف العرض." };
    }
    ids.add(row.id);
    // Explicit projection drops any unexpected PII or internal fields from the response.
    entries.push({ id: row.id, direction: row.direction, dueDate: row.dueDate, amount });
  }
  return {
    ok: true,
    data: {
      status: raw.status,
      requestId: raw.requestId,
      asOf: raw.asOf,
      period: { from: period.from, to: period.to },
      currency: typeof raw.currency === "string" ? raw.currency : null,
      effectiveRole: authorization.effectiveRole,
      completeness: raw.completeness === "COMPLETE" || raw.completeness === "PARTIAL" || raw.completeness === "UNKNOWN"
        ? raw.completeness : "UNKNOWN",
      quality: quality(raw.quality) ? raw.quality : "UNKNOWN",
      schedule: {
        status: schedule.status,
        completeness: schedule.completeness,
        quality: schedule.quality,
        entries,
        warnings: scheduleWarnings,
      },
      evidenceCount: evidenceRecords.length,
      evidenceRecords: safeEvidenceRecords,
      measurementMetrics: measurement.metrics,
      warnings: measurement.withheld ? [...topWarnings, "MEASUREMENT_METRIC_WITHHELD"] : topWarnings,
    },
  };
}

export async function fetchCashflowSchedule(
  request: IntelligenceAggregateRequest,
): Promise<CashflowScheduleResult> {
  validRequest(request);
  try {
    const { data, error } = await supabase.rpc("get_intelligence_aggregate", { p_request: request });
    if (error) {
      const code = record(error)?.code;
      if (code === "42501") {
        return { ok: false, status: "DENIED", message: "تتطلب قراءة التدفق النقدي صلاحية الإدارة المالية للمؤسسة." };
      }
      return { ok: false, status: "UNAVAILABLE", message: "تعذر تحميل التدفق النقدي من قاعدة البيانات؛ لم تُعرض أرقام بديلة." };
    }
    return parseCashflowScheduleResponse(data, request);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بخدمة التدفق النقدي؛ لم تُعرض أرقام تقديرية." };
  }
}
