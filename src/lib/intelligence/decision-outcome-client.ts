import { supabase } from "@/lib/supabase";
import type { CashflowMeasurementProof } from "./cashflow-schedule-client";
import { parseDecisionMemorySnapshot } from "./decision-memory-client";
import type { DecisionMemorySnapshot } from "./decision-memory";

export type DecisionOutcomeState =
  | "PROPOSED" | "IN_REVIEW" | "APPROVED" | "REJECTED" | "DEFERRED"
  | "ASSIGNED" | "EXECUTING" | "EXECUTED" | "MEASURED";
export type DecisionOutcomeEventType =
  | "SUBMIT_FOR_REVIEW" | "APPROVE" | "REJECT" | "DEFER" | "ASSIGN"
  | "START_EXECUTION" | "COMPLETE_EXECUTION" | "MEASURE" | "RESUBMIT_FOR_REVIEW";

export interface DecisionOutcomeEventView {
  id: string;
  type: string;
  version: number;
  at: string;
  actorRole: string;
  reason: string | null;
}
export interface DecisionOutcomeView {
  id: string;
  candidateId: string;
  ruleId: string;
  ruleVersion: string;
  state: DecisionOutcomeState;
  version: number;
  ownerProfileId: string | null;
  ownerLabel: string;
  expectedOutcome: string;
  reason: string | null;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  assignedAt: string | null;
  executedAt: string | null;
  measuredOutcome: { value: number; currency: string; asOf: string } | null;
  memorySnapshot: DecisionMemorySnapshot | null;
  eventCount: number;
  history: DecisionOutcomeEventView[];
}
export type DecisionOutcomeFailureStatus = "DENIED" | "UNAVAILABLE" | "CONFLICT" | "STALE" | "ERROR";
export type DecisionOutcomeCommandResult =
  | { ok: true; outcome: DecisionOutcomeView; duplicate: boolean }
  | { ok: false; status: DecisionOutcomeFailureStatus; message: string };
export type DecisionOutcomeListResult =
  | { ok: true; items: DecisionOutcomeView[]; total: number }
  | { ok: false; status: DecisionOutcomeFailureStatus; message: string };

type UnknownRecord = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states = new Set<DecisionOutcomeState>([
  "PROPOSED","IN_REVIEW","APPROVED","REJECTED","DEFERRED","ASSIGNED","EXECUTING","EXECUTED","MEASURED",
]);
function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord : null;
}
function str(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function iso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function nullableIso(value: unknown): string | null {
  return value === null ? null : iso(value) ? value : null;
}
function safeFailure(error: unknown): { status: DecisionOutcomeFailureStatus; message: string } {
  const raw = record(error);
  const code = typeof raw?.code === "string" ? raw.code : "";
  if (code === "42501") return { status: "DENIED", message: "تتطلب إدارة دورة القرارات صلاحية الإدارة المالية." };
  if (code === "40001") return { status: "STALE", message: "تغير إصدار القرار؛ حدّث السجل ثم أعد المحاولة." };
  if (code === "23505") return { status: "CONFLICT", message: "تعارض مفتاح التكرار أو وجود متابعة لهذا المؤشر؛ حدّث القائمة." };
  if (code === "22023") return { status: "ERROR", message: "رفض الخادم الانتقال لعدم استيفاء شروط القرار أو أدلته." };
  return { status: "UNAVAILABLE", message: "تعذر الوصول إلى خدمة القرارات؛ لم تُحفظ أي تغييرات محلية." };
}
function parseOutcome(value: unknown): DecisionOutcomeView | null {
  const raw = record(value);
  const owner = record(raw?.owner);
  const measured = record(raw?.measuredOutcome);
  const memorySnapshot = raw?.memorySnapshot === null || raw?.memorySnapshot === undefined
    ? null : parseDecisionMemorySnapshot(raw.memorySnapshot);
  if (raw?.memorySnapshot !== null && raw?.memorySnapshot !== undefined && !memorySnapshot) return null;
  if (
    !raw || !owner ||
    !str(raw.id, 80) || !UUID.test(raw.id) ||
    !str(raw.candidateId, 150) || !str(raw.ruleId, 150) || !str(raw.ruleVersion, 80) ||
    typeof raw.state !== "string" || !states.has(raw.state as DecisionOutcomeState) ||
    !Number.isInteger(raw.version) || (raw.version as number) < 1 ||
    !str(raw.expectedOutcome, 2000) ||
    !iso(raw.createdAt) || !iso(raw.updatedAt) ||
    !Number.isInteger(raw.eventCount) || (raw.eventCount as number) < 1 ||
    !Array.isArray(raw.history) || raw.history.length > 1000 ||
    (owner.id !== null && !str(owner.id, 80)) ||
    !str(owner.label, 150)
  ) return null;
  const history: DecisionOutcomeEventView[] = [];
  for (const item of raw.history) {
    const event = record(item);
    const actor = record(event?.actor);
    if (
      !event || !actor || !str(event.id, 100) || !str(event.type, 80) ||
      !Number.isInteger(event.version) || !iso(event.at) || !str(actor.role, 100)
    ) return null;
    history.push({
      id: event.id, type: event.type, version: event.version as number,
      at: event.at, actorRole: actor.role,
      reason: typeof event.reason === "string" ? event.reason : null,
    });
  }
  const measurement = measured &&
    typeof measured.value === "number" && Number.isFinite(measured.value) &&
    str(measured.currency, 3) && iso(measured.asOf)
      ? { value: measured.value, currency: measured.currency, asOf: measured.asOf } : null;
  return {
    id: raw.id, candidateId: raw.candidateId, ruleId: raw.ruleId, ruleVersion: raw.ruleVersion,
    state: raw.state as DecisionOutcomeState, version: raw.version as number,
    ownerProfileId: typeof owner.id === "string" ? owner.id : null,
    ownerLabel: owner.label, expectedOutcome: raw.expectedOutcome,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    createdAt: raw.createdAt, updatedAt: raw.updatedAt,
    approvedAt: nullableIso(raw.approvedAt),
    assignedAt: nullableIso(raw.assignedAt),
    executedAt: nullableIso(raw.executedAt),
    measuredOutcome: measurement,
    memorySnapshot,
    eventCount: raw.eventCount as number,
    history,
  };
}
function parseCommandResult(value: unknown): DecisionOutcomeCommandResult {
  const raw = record(value);
  const outcome = parseOutcome(raw?.outcome);
  if (!raw || raw.ok !== true || !outcome || typeof raw.duplicate !== "boolean") {
    return { ok: false, status: "ERROR", message: "أعادت خدمة القرارات استجابة غير مكتملة؛ لم يُعرض نجاح غير مثبت." };
  }
  return { ok: true, outcome, duplicate: raw.duplicate };
}
function validateProposal(input: {
  candidateId: string; ruleId: string; ruleVersion: string; ownerProfileId: string;
  expectedOutcome: string; reason: string;
}): string | null {
  if (!str(input.candidateId, 150) || !str(input.ruleId, 150) ||
      !str(input.ruleVersion, 80) || !UUID.test(input.ownerProfileId) ||
      !str(input.expectedOutcome, 2000) || input.reason.length > 2000) {
    return "أكمل وصف النتيجة المتوقعة، وتأكد من صلاحية مالك القرار.";
  }
  return null;
}

export async function fetchDecisionOutcomes(limit = 50, offset = 0): Promise<DecisionOutcomeListResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 5000) {
    return { ok: false, status: "ERROR", message: "نطاق صفحة القرارات غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("fetch_decision_outcomes", {
      p_limit: limit, p_offset: offset,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    const raw = record(data);
    if (!raw || !Array.isArray(raw.items) || raw.items.length > limit ||
        !Number.isInteger(raw.total) || (raw.total as number) < 0) {
      return { ok: false, status: "ERROR", message: "استجابة قائمة القرارات غير صالحة؛ أُوقف العرض." };
    }
    const items = raw.items.map(parseOutcome);
    if (items.some(item => item === null)) {
      return { ok: false, status: "ERROR", message: "تحتوي قائمة القرارات على سجل غير مكتمل؛ أُوقف العرض." };
    }
    return { ok: true, items: items as DecisionOutcomeView[], total: raw.total as number };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بخدمة القرارات." };
  }
}


/**
 * Loads a bounded collection for decision-memory search.
 * Every page uses the existing authenticated RPC. Complete coverage requires
 * a stable total, exact page sizes, unique IDs and an unchanged first page.
 */
export interface DecisionOutcomeCollection {
  items: DecisionOutcomeView[];
  total: number;
  loaded: number;
  pageCount: number;
  complete: boolean;
  reason: "COMPLETE" | "SOURCE_TOTAL_CHANGED" | "PAGE_SIZE_MISMATCH" |
    "DUPLICATE_RECORD" | "FIRST_PAGE_CHANGED" | "MAXIMUM_WINDOW_REACHED";
}

const DECISION_MEMORY_PAGE_SIZE = 100;
const DECISION_MEMORY_MAX_OFFSET = 5000;

function decisionPageFingerprint(items: DecisionOutcomeView[]): string {
  return items.map(item => item.id + ":" + item.version + ":" + item.updatedAt).join("|");
}

export async function fetchDecisionOutcomeCollection(): Promise<
  | { ok: true; collection: DecisionOutcomeCollection }
  | { ok: false; status: DecisionOutcomeFailureStatus; message: string }
> {
  const first = await fetchDecisionOutcomes(DECISION_MEMORY_PAGE_SIZE, 0);
  if (!first.ok) return first;

  const total = first.total;
  const items = [...first.items];
  const seen = new Set(items.map(item => item.id));
  let pageCount = 1;
  let reason: DecisionOutcomeCollection["reason"] = "COMPLETE";

  if (items.length !== Math.min(DECISION_MEMORY_PAGE_SIZE, total)) {
    reason = "PAGE_SIZE_MISMATCH";
  }

  for (
    let offset = DECISION_MEMORY_PAGE_SIZE;
    reason === "COMPLETE" && offset <= DECISION_MEMORY_MAX_OFFSET && offset < total;
    offset += DECISION_MEMORY_PAGE_SIZE
  ) {
    const page = await fetchDecisionOutcomes(DECISION_MEMORY_PAGE_SIZE, offset);
    if (!page.ok) return page;
    pageCount += 1;

    if (page.total !== total) {
      reason = "SOURCE_TOTAL_CHANGED";
      break;
    }

    if (page.items.length !== Math.min(DECISION_MEMORY_PAGE_SIZE, total - offset)) {
      reason = "PAGE_SIZE_MISMATCH";
      break;
    }

    for (const item of page.items) {
      if (seen.has(item.id)) {
        reason = "DUPLICATE_RECORD";
        break;
      }
      seen.add(item.id);
      items.push(item);
    }
    if (reason !== "COMPLETE") break;
  }

  if (reason === "COMPLETE" && items.length < total) {
    reason = "MAXIMUM_WINDOW_REACHED";
  }

  if (reason === "COMPLETE") {
    const verification = await fetchDecisionOutcomes(DECISION_MEMORY_PAGE_SIZE, 0);
    if (!verification.ok) return verification;
    if (
      verification.total !== total ||
      decisionPageFingerprint(verification.items) !== decisionPageFingerprint(first.items)
    ) {
      reason = "FIRST_PAGE_CHANGED";
    }
  }

  const complete = reason === "COMPLETE" && items.length === total;
  return {
    ok: true,
    collection: {
      items,
      total,
      loaded: items.length,
      pageCount,
      complete,
      reason: complete ? "COMPLETE" : reason,
    },
  };
}

export async function createDecisionOutcomeProposal(input: {
  candidateId: string;
  ruleId: string;
  ruleVersion: string;
  ownerProfileId: string;
  expectedOutcome: string;
  reason: string;
}): Promise<DecisionOutcomeCommandResult> {
  const invalid = validateProposal(input);
  if (invalid) return { ok: false, status: "ERROR", message: invalid };
  try {
    const { data, error } = await supabase.rpc("create_decision_outcome_proposal", {
      p_candidate_id: input.candidateId,
      p_rule_id: input.ruleId,
      p_rule_version: input.ruleVersion,
      p_owner_profile_id: input.ownerProfileId,
      p_expected_outcome: input.expectedOutcome.trim(),
      p_reason: input.reason.trim() || null,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر إرسال مقترح القرار إلى الخادم." };
  }
}

export async function commandDecisionOutcome(input: {
  outcomeId: string;
  expectedVersion: number;
  eventType: Exclude<DecisionOutcomeEventType, "DEFER" | "RESUBMIT_FOR_REVIEW">;
  reason?: string;
  ownerProfileId?: string;
  eventId?: string;
  idempotencyKey?: string;
  measuredOutcome?: CashflowMeasurementProof & { measuredAt: string };
}): Promise<DecisionOutcomeCommandResult> {
  if (!UUID.test(input.outcomeId) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 ||
      (input.reason?.length ?? 0) > 2000 ||
      (input.eventId !== undefined && !UUID.test(input.eventId)) ||
      (input.idempotencyKey !== undefined && !UUID.test(input.idempotencyKey)) ||
      (input.eventType === "ASSIGN" && (!input.ownerProfileId || !UUID.test(input.ownerProfileId))) ||
      (input.eventType === "MEASURE" && !input.measuredOutcome)) {
    return { ok: false, status: "ERROR", message: "أمر القرار لا يستوفي الحقول المطلوبة." };
  }
  try {
    const measured = input.measuredOutcome;
    const { data, error } = await supabase.rpc("command_decision_outcome", {
      p_outcome_id: input.outcomeId,
      p_event_id: input.eventId ?? crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      p_expected_version: input.expectedVersion,
      p_event_type: input.eventType,
      p_reason: input.reason?.trim() || null,
      p_owner_profile_id: input.ownerProfileId ?? null,
      p_measured_outcome: measured ? {
        metricKey: measured.metricKey, value: measured.value, unit: measured.unit,
        currency: measured.currency, status: measured.status, completeness: measured.completeness,
        quality: measured.quality, period: measured.period, asOf: measured.asOf,
        formulaId: measured.formulaId, formulaVersion: measured.formulaVersion,
        measuredAt: measured.measuredAt, evidenceIds: measured.evidenceIds,
      } : null,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر إرسال أمر القرار إلى الخادم." };
  }
}

/** Persists a reasoned deferral through its dedicated manager-only RPC. */
export async function deferDecisionOutcome(input: {
  outcomeId: string;
  expectedVersion: number;
  reason: string;
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DecisionOutcomeCommandResult> {
  const reason = input.reason.trim();
  if (!UUID.test(input.outcomeId) ||
      !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 ||
      reason.length < 3 || reason.length > 2000 ||
      (input.eventId !== undefined && !UUID.test(input.eventId)) ||
      (input.idempotencyKey !== undefined && !UUID.test(input.idempotencyKey))) {
    return { ok: false, status: "ERROR", message: "أدخل سبب التأجيل وتحقق من إصدار القرار." };
  }
  try {
    const { data, error } = await supabase.rpc("defer_decision_outcome", {
      p_outcome_id: input.outcomeId,
      p_event_id: input.eventId ?? crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      p_expected_version: input.expectedVersion,
      p_reason: reason,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر إرسال تأجيل القرار إلى الخادم." };
  }
}

/** Returns a deferred decision to review through a separate, auditable command. */
export async function resumeDeferredDecisionOutcome(input: {
  outcomeId: string;
  expectedVersion: number;
  reason: string;
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DecisionOutcomeCommandResult> {
  const reason = input.reason.trim();
  if (!UUID.test(input.outcomeId) ||
      !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 ||
      reason.length < 3 || reason.length > 2000 ||
      (input.eventId !== undefined && !UUID.test(input.eventId)) ||
      (input.idempotencyKey !== undefined && !UUID.test(input.idempotencyKey))) {
    return { ok: false, status: "ERROR", message: "أدخل سبب إعادة القرار للمراجعة وتحقق من إصداره." };
  }
  try {
    const { data, error } = await supabase.rpc("resume_deferred_decision_outcome", {
      p_outcome_id: input.outcomeId,
      p_event_id: input.eventId ?? crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      p_expected_version: input.expectedVersion,
      p_reason: reason,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر إعادة القرار المؤجل إلى المراجعة." };
  }
}
