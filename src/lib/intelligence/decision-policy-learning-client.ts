import { supabase } from "@/lib/supabase";

export type DecisionPolicyLearningCandidateState = "DRAFT" | "IN_REVIEW" | "APPROVED" | "REJECTED";
export type DecisionPolicyLearningEventType = "CREATE" | "SUBMIT_FOR_REVIEW" | "APPROVE" | "REJECT";

export interface DecisionPolicyLearningEvent {
  id: string;
  type: DecisionPolicyLearningEventType;
  version: number;
  at: string;
  actorProfileId: string;
  actorRole: "admin" | "manager";
  reason: string | null;
}

export interface DecisionPolicyLearningCandidate {
  id: string;
  ruleId: string;
  baseProfileVersion: string;
  candidateVersion: number;
  state: DecisionPolicyLearningCandidateState;
  version: number;
  createdByProfileId: string;
  createdByRole: "admin" | "manager";
  submittedByProfileId: string | null;
  submittedAt: string | null;
  reviewedByProfileId: string | null;
  reviewedAt: string | null;
  reviewReason: string | null;
  createdAt: string;
  updatedAt: string;
  candidateSnapshot: Record<string, unknown>;
  eventCount: number;
  history: DecisionPolicyLearningEvent[];
}

export type DecisionPolicyLearningFailureStatus = "DENIED" | "UNAVAILABLE" | "CONFLICT" | "STALE" | "ERROR";
export type DecisionPolicyLearningCommandResult =
  | { ok: true; candidate: DecisionPolicyLearningCandidate; duplicate: boolean }
  | { ok: false; status: DecisionPolicyLearningFailureStatus; message: string };
export type DecisionPolicyLearningListResult =
  | { ok: true; items: DecisionPolicyLearningCandidate[]; total: number }
  | { ok: false; status: DecisionPolicyLearningFailureStatus; message: string };

type UnknownRecord = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const states = new Set<DecisionPolicyLearningCandidateState>(["DRAFT", "IN_REVIEW", "APPROVED", "REJECTED"]);
const eventTypes = new Set<DecisionPolicyLearningEventType>(["CREATE", "SUBMIT_FOR_REVIEW", "APPROVE", "REJECT"]);

function record(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord : null;
}
function string(value: unknown, max = 500): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}
function nullableString(value: unknown, max = 500): value is string | null {
  return value === null || string(value, max);
}
function iso(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) && value.includes("T");
}
function nullableIso(value: unknown): value is string | null {
  return value === null || iso(value);
}

function parseEvent(value: unknown): DecisionPolicyLearningEvent | null {
  const raw = record(value);
  if (!raw || !string(raw.id, 100) || !eventTypes.has(raw.type as DecisionPolicyLearningEventType) ||
      !Number.isInteger(raw.version) || (raw.version as number) < 1 || !iso(raw.at) ||
      !UUID.test(String(raw.actorProfileId ?? "")) ||
      (raw.actorRole !== "admin" && raw.actorRole !== "manager") ||
      !nullableString(raw.reason, 2000)) return null;
  return {
    id: raw.id,
    type: raw.type as DecisionPolicyLearningEventType,
    version: raw.version as number,
    at: raw.at,
    actorProfileId: raw.actorProfileId as string,
    actorRole: raw.actorRole,
    reason: raw.reason,
  };
}

function validEvidenceIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 300 &&
    value.every(item => string(item, 300));
}
function safeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}
function validMetric(value: unknown): boolean {
  const metric = record(value);
  const period = record(metric?.period);
  return !!metric && string(metric.metricKey, 150) && safeNumber(metric.value) &&
    metric.status === "VERIFIED" && metric.completeness === "COMPLETE" && metric.quality === "ACCEPTABLE" &&
    string(metric.unit, 80) && nullableString(metric.currency, 8) &&
    nullableString(metric.unitOfMeasure, 80) &&
    !!period && string(period.from, 40) && string(period.to, 40) &&
    iso(metric.asOf) && string(metric.formulaId, 150) &&
    string(metric.formulaVersion, 80) && validEvidenceIds(metric.evidenceIds);
}
function validObservation(value: unknown, expectedDecisionId: string): boolean {
  const observation = record(value);
  const expected = record(observation?.expected);
  const actual = record(observation?.actual);
  const expectedPeriod = record(expected?.period);
  const actualPeriod = record(actual?.period);
  return !!observation && observation.decisionId === expectedDecisionId &&
    iso(observation.createdAt) && !!expected && !!actual &&
    validMetric(expected) && validMetric(actual) &&
    expected.metricKey === actual.metricKey &&
    expected.unit === actual.unit &&
    expected.currency === actual.currency &&
    expected.unitOfMeasure === actual.unitOfMeasure &&
    JSON.stringify(expectedPeriod) === JSON.stringify(actualPeriod) &&
    Date.parse(String(expected.asOf)) === Date.parse(String(actual.asOf)) &&
    expected.formulaId === actual.formulaId &&
    expected.formulaVersion === actual.formulaVersion &&
    safeNumber(observation.difference) &&
    (observation.differencePercent === null || safeNumber(observation.differencePercent)) &&
    Array.isArray(observation.lessons) && observation.lessons.length > 0 &&
    observation.lessons.length <= 100 && observation.lessons.every(item => string(item, 2000)) &&
    validEvidenceIds(observation.evidenceIds);
}
function validCalibration(value: unknown, sampleCount: number): boolean {
  const calibration = record(value);
  if (!calibration || calibration.sampleCount !== sampleCount ||
      !safeNumber(calibration.meanExpectedValue) || !safeNumber(calibration.meanActualValue) ||
      !safeNumber(calibration.meanSignedDifference) || !safeNumber(calibration.medianSignedDifference) ||
      !safeNumber(calibration.meanAbsoluteDifference) ||
      (calibration.meanAbsoluteDifferencePercent !== null && !safeNumber(calibration.meanAbsoluteDifferencePercent))) {
    return false;
  }
  const counts = [
    calibration.percentageSampleCount, calibration.zeroBaselineCount,
    calibration.aboveExpectedCount, calibration.belowExpectedCount, calibration.equalExpectedCount,
  ];
  if (counts.some(count => !Number.isInteger(count) || (count as number) < 0)) return false;
  return (calibration.percentageSampleCount as number) + (calibration.zeroBaselineCount as number) === sampleCount &&
    (calibration.aboveExpectedCount as number) + (calibration.belowExpectedCount as number) +
      (calibration.equalExpectedCount as number) === sampleCount;
}

function parseCandidate(value: unknown): DecisionPolicyLearningCandidate | null {
  const raw = record(value);
  const snapshot = record(raw?.candidateSnapshot);
  const history = Array.isArray(raw?.history) ? raw.history.map(parseEvent) : null;
  if (!raw || !snapshot || !UUID.test(String(raw.id ?? "")) ||
      !string(raw.ruleId, 150) || !string(raw.baseProfileVersion, 80) ||
      !Number.isInteger(raw.candidateVersion) || (raw.candidateVersion as number) < 2 ||
      !states.has(raw.state as DecisionPolicyLearningCandidateState) ||
      !Number.isInteger(raw.version) || (raw.version as number) < 1 ||
      !UUID.test(String(raw.createdByProfileId ?? "")) ||
      (raw.createdByRole !== "admin" && raw.createdByRole !== "manager") ||
      !nullableString(raw.submittedByProfileId, 80) ||
      (raw.submittedByProfileId !== null && !UUID.test(raw.submittedByProfileId as string)) ||
      !nullableIso(raw.submittedAt) ||
      !nullableString(raw.reviewedByProfileId, 80) ||
      (raw.reviewedByProfileId !== null && !UUID.test(raw.reviewedByProfileId as string)) ||
      !nullableIso(raw.reviewedAt) || !nullableString(raw.reviewReason, 2000) ||
      !iso(raw.createdAt) || !iso(raw.updatedAt) ||
      !Number.isInteger(raw.eventCount) || (raw.eventCount as number) < 1 ||
      !history || history.some(item => item === null) || history.length !== raw.eventCount ||
      snapshot.schemaVersion !== "1.0.0" ||
      snapshot.purpose !== "CALIBRATION_REVIEW_ONLY_NOT_ACTIVE" ||
      snapshot.activeProfileChanged !== false ||
      snapshot.activationInstruction !== "NOT_ACTIVE_UNTIL_A_SEPARATE_EXPLICIT_PROFILE_RELEASE" ||
      snapshot.ruleId !== raw.ruleId ||
      snapshot.baseProfileVersion !== raw.baseProfileVersion ||
      snapshot.candidateVersion !== raw.candidateVersion ||
      !Array.isArray(snapshot.sourceDecisionIds) || snapshot.sourceDecisionIds.length < 1 ||
      snapshot.sourceDecisionIds.length > 100 ||
      snapshot.sourceDecisionIds.some(id => typeof id !== "string" || !UUID.test(id)) ||
      !Array.isArray(snapshot.sourceMemorySnapshots) ||
      snapshot.sourceMemorySnapshots.length !== snapshot.sourceDecisionIds.length ||
      snapshot.sourceMemorySnapshots.some((item, index) => {
        const source = record(item);
        return !source || !UUID.test(String(source.decisionId ?? "")) ||
          source.decisionId !== snapshot.sourceDecisionIds[index] ||
          !UUID.test(String(source.snapshotId ?? "")) ||
          !Number.isInteger(source.version) || (source.version as number) < 1 ||
          !iso(source.capturedAt);
      }) ||
      new Set(snapshot.sourceDecisionIds).size !== snapshot.sourceDecisionIds.length ||
      !Array.isArray(snapshot.observations) || snapshot.observations.length !== snapshot.sourceDecisionIds.length ||
      snapshot.observations.some((item,index)=>!validObservation(item,snapshot.sourceDecisionIds[index])) ||
      !record(snapshot.metricContext) ||
      !validCalibration(snapshot.calibration,snapshot.sourceDecisionIds.length) ||
      !validEvidenceIds(snapshot.evidenceIds) ||
      new Set(snapshot.evidenceIds).size !== snapshot.evidenceIds.length ||
      !Array.isArray(snapshot.lessons) || snapshot.lessons.length < 1 ||
      !snapshot.lessons.every(item=>string(item,2000))) return null;

  const candidateState = raw.state as DecisionPolicyLearningCandidateState;
  if ((candidateState === "DRAFT" && (raw.submittedAt !== null || raw.reviewedAt !== null)) ||
      (candidateState === "IN_REVIEW" && (!iso(raw.submittedAt) || raw.reviewedAt !== null)) ||
      ((candidateState === "APPROVED" || candidateState === "REJECTED") &&
        (!iso(raw.submittedAt) || !iso(raw.reviewedAt) || !UUID.test(String(raw.reviewedByProfileId ?? "")) ||
         !string(raw.reviewReason, 2000)))) return null;

  return {
    id: raw.id as string,
    ruleId: raw.ruleId,
    baseProfileVersion: raw.baseProfileVersion,
    candidateVersion: raw.candidateVersion as number,
    state: candidateState,
    version: raw.version as number,
    createdByProfileId: raw.createdByProfileId as string,
    createdByRole: raw.createdByRole,
    submittedByProfileId: raw.submittedByProfileId as string | null,
    submittedAt: raw.submittedAt as string | null,
    reviewedByProfileId: raw.reviewedByProfileId as string | null,
    reviewedAt: raw.reviewedAt as string | null,
    reviewReason: raw.reviewReason as string | null,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    candidateSnapshot: snapshot,
    eventCount: raw.eventCount as number,
    history: history as DecisionPolicyLearningEvent[],
  };
}

function safeFailure(error: unknown): { status: DecisionPolicyLearningFailureStatus; message: string } {
  const raw = record(error);
  const code = typeof raw?.code === "string" ? raw.code : "";
  if (code === "42501") return {
    status: "DENIED",
    message: "رفض الخادم العملية: تحتاج صلاحية الإدارة المالية، كما لا يجوز لمن أنشأ المرشح اعتماد المرشح نفسه.",
  };
  if (code === "40001") return { status: "STALE", message: "تغير إصدار المرشح؛ أعد تحميل القائمة قبل المتابعة." };
  if (code === "23505") return { status: "CONFLICT", message: "هذا المصدر سبق تحويله إلى مرشح، أو تعارض مفتاح منع التكرار." };
  if (code === "22023") return { status: "ERROR", message: "رفض الخادم المرشح لعدم اكتمال الأدلة أو اختلاف سياق القياس أو صلاحية الانتقال." };
  return { status: "UNAVAILABLE", message: "خدمة تعلّم النتائج غير متاحة؛ لم يُحفظ نجاح محلي." };
}

function parseCommandResult(value: unknown): DecisionPolicyLearningCommandResult {
  const raw = record(value);
  const candidate = parseCandidate(raw?.candidate);
  if (!raw || raw.ok !== true || typeof raw.duplicate !== "boolean" || !candidate) {
    return { ok: false, status: "ERROR", message: "استجابة خدمة تعلّم النتائج غير مكتملة؛ أُوقف العرض." };
  }
  return { ok: true, candidate, duplicate: raw.duplicate };
}

/** Server derives tenant, rule version, metrics, evidence and calibration from these IDs. */
export async function createDecisionPolicyLearningCandidate(input: {
  decisionIds: string[];
  idempotencyKey?: string;
}): Promise<DecisionPolicyLearningCommandResult> {
  if (!Array.isArray(input.decisionIds) || input.decisionIds.length < 1 ||
      input.decisionIds.length > 100 || input.decisionIds.some(id => !UUID.test(id)) ||
      new Set(input.decisionIds).size !== input.decisionIds.length ||
      (input.idempotencyKey !== undefined && !UUID.test(input.idempotencyKey))) {
    return { ok: false, status: "ERROR", message: "اختر بين قرار واحد و100 قرار مقاس دون تكرار." };
  }
  try {
    const { data, error } = await supabase.rpc("create_decision_policy_learning_candidate", {
      p_decision_ids: input.decisionIds,
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بخدمة إنشاء مرشح التعلم." };
  }
}

export async function commandDecisionPolicyLearningCandidate(input: {
  candidateId: string;
  expectedVersion: number;
  eventType: Exclude<DecisionPolicyLearningEventType, "CREATE">;
  reason: string;
  eventId?: string;
  idempotencyKey?: string;
}): Promise<DecisionPolicyLearningCommandResult> {
  const reason = input.reason.trim();
  if (!UUID.test(input.candidateId) || !Number.isInteger(input.expectedVersion) ||
      input.expectedVersion < 1 || reason.length < 3 || reason.length > 2000 ||
      (input.eventId !== undefined && !UUID.test(input.eventId)) ||
      (input.idempotencyKey !== undefined && !UUID.test(input.idempotencyKey)) ||
      !eventTypes.has(input.eventType)) {
    return { ok: false, status: "ERROR", message: "أدخل سبباً من 3 إلى 2000 حرف وتحقق من إصدار المرشح." };
  }
  try {
    const { data, error } = await supabase.rpc("command_decision_policy_learning_candidate", {
      p_candidate_id: input.candidateId,
      p_event_id: input.eventId ?? crypto.randomUUID(),
      p_idempotency_key: input.idempotencyKey ?? crypto.randomUUID(),
      p_expected_version: input.expectedVersion,
      p_event_type: input.eventType,
      p_reason: reason,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    return parseCommandResult(data);
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر الاتصال بخدمة اعتماد مرشح التعلم." };
  }
}

export async function fetchDecisionPolicyLearningCandidates(
  limit = 50,
  offset = 0,
): Promise<DecisionPolicyLearningListResult> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isInteger(offset) || offset < 0 || offset > 5000) {
    return { ok: false, status: "ERROR", message: "نطاق صفحة مرشحات التعلم غير صالح." };
  }
  try {
    const { data, error } = await supabase.rpc("fetch_decision_policy_learning_candidates", {
      p_limit: limit,
      p_offset: offset,
    });
    if (error) return { ok: false, ...safeFailure(error) };
    const raw = record(data);
    if (!raw || !Array.isArray(raw.items) || raw.items.length > limit ||
        !Number.isInteger(raw.total) || (raw.total as number) < 0) {
      return { ok: false, status: "ERROR", message: "استجابة مرشحات التعلم غير صالحة؛ أُوقف العرض." };
    }
    const items = raw.items.map(parseCandidate);
    if (items.some(item => item === null)) {
      return { ok: false, status: "ERROR", message: "تتضمن قائمة مرشحات التعلم سجلاً غير مكتمل؛ أُوقف العرض." };
    }
    return { ok: true, items: items as DecisionPolicyLearningCandidate[], total: raw.total as number };
  } catch {
    return { ok: false, status: "UNAVAILABLE", message: "تعذر تحميل مرشحات التعلم." };
  }
}
