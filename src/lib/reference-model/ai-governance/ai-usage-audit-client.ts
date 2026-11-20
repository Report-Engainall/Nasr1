import { supabase } from "@/lib/supabase";

export type AiUsageResultStatus = "completed" | "failed" | "fallback" | "rejected_quota";
export type AiUsageMeasurementStatus = "measured" | "partial" | "unknown" | "not_attempted" | "legacy_unknown";
export type AiUsageProvider = "openai_compatible" | "gemini";

export interface AiUsageProviderAttempt {
  provider: AiUsageProvider;
  model: string;
  fallback: boolean;
  status: "succeeded" | "failed";
  elapsedMs: number;
  observedInputTokens: number | null;
  observedOutputTokens: number | null;
  estimatedCost: number | null;
  errorCode: string | null;
}

export interface AiUsageAuditRecord {
  id: string;
  requestId: string;
  actorProfileId: string | null;
  modelName: string;
  estimatedCost: number;
  executionTimeMs: number;
  fallbackUsed: boolean;
  resultStatus: AiUsageResultStatus;
  measurementStatus: AiUsageMeasurementStatus;
  observedInputTokens: number | null;
  observedOutputTokens: number | null;
  providerAttemptCount: number;
  providerAttemptTelemetryAvailable: boolean;
  providerAttempts: AiUsageProviderAttempt[];
  outcomeReason: string | null;
  createdAt: string;
}

export interface AiUsageAuditPage {
  items: AiUsageAuditRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface AiUsageAuditQuery {
  status?: AiUsageResultStatus | null;
  limit?: number;
  offset?: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESULT_STATUSES = new Set<AiUsageResultStatus>(["completed", "failed", "fallback", "rejected_quota"]);
const MEASUREMENT_STATUSES = new Set<AiUsageMeasurementStatus>(["measured", "partial", "unknown", "not_attempted", "legacy_unknown"]);
const PROVIDERS = new Set<AiUsageProvider>(["openai_compatible", "gemini"]);
const OUTCOME_REASONS = new Set(["ai_disabled", "provider_not_configured", "gateway_configuration_failed", "quota_reservation_disabled", "quota_exceeded"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function text(value: unknown, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new Error("ai_audit_response_invalid");
  return value;
}
function nullableText(value: unknown, max: number): string | null {
  if (value === null || value === undefined) return null;
  return text(value, max);
}
function numeric(value: unknown, maximum: number, allowNull = false): number | null {
  if (value === null || value === undefined) {
    if (allowNull) return null;
    throw new Error("ai_audit_response_invalid");
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) throw new Error("ai_audit_response_invalid");
  return parsed;
}
function integer(value: unknown, maximum: number, allowNull = false): number | null {
  const parsed = numeric(value, maximum, allowNull);
  if (parsed !== null && !Number.isSafeInteger(parsed)) throw new Error("ai_audit_response_invalid");
  return parsed;
}
function parseAttempt(value: unknown): AiUsageProviderAttempt {
  if (!isRecord(value)) throw new Error("ai_audit_response_invalid");
  if (typeof value.provider !== "string" || !PROVIDERS.has(value.provider as AiUsageProvider)) {
    throw new Error("ai_audit_response_invalid");
  }
  if (typeof value.fallback !== "boolean" || (value.status !== "succeeded" && value.status !== "failed")) {
    throw new Error("ai_audit_response_invalid");
  }
  const elapsedMs = integer(value.elapsed_ms, 600000);
  const observedInputTokens = integer(value.observed_input_tokens, 2000000, true);
  const observedOutputTokens = integer(value.observed_output_tokens, 100000, true);
  const estimatedCost = numeric(value.estimated_cost, 10000, true);
  const errorCode = nullableText(value.error_code, 80);
  if (
    (elapsedMs as number) < 0 ||
    (errorCode !== null && !/^[a-z0-9_]{1,80}$/.test(errorCode)) ||
    (value.status === "succeeded" && errorCode !== null) ||
    (value.status === "failed" && (observedInputTokens !== null || observedOutputTokens !== null || estimatedCost !== null))
  ) {
    throw new Error("ai_audit_response_invalid");
  }
  return {
    provider: value.provider as AiUsageProvider,
    model: text(value.model, 160),
    fallback: value.fallback,
    status: value.status,
    elapsedMs: elapsedMs as number,
    observedInputTokens,
    observedOutputTokens,
    estimatedCost,
    errorCode,
  };
}
function parseRecord(value: unknown): AiUsageAuditRecord {
  if (!isRecord(value)) throw new Error("ai_audit_response_invalid");
  const id = text(value.id, 64);
  const requestId = text(value.request_id, 120);
  const actorProfileId = nullableText(value.actor_profile_id, 64);
  const modelName = text(value.model_name, 180);
  const estimatedCost = numeric(value.estimated_cost, 10000);
  const executionTimeMs = integer(value.execution_time_ms, 600000);
  const observedInputTokens = integer(value.observed_input_tokens, 2000000, true);
  const observedOutputTokens = integer(value.observed_output_tokens, 100000, true);
  const providerAttemptCount = integer(value.provider_attempt_count, 2);
  const providerAttemptTelemetryAvailable = value.provider_attempts_integrity;
  if (typeof providerAttemptTelemetryAvailable !== "boolean") throw new Error("ai_audit_response_invalid");
  if (!UUID.test(id) || (actorProfileId !== null && !UUID.test(actorProfileId)) ||
      typeof value.fallback_used !== "boolean" ||
      typeof value.result_status !== "string" || !RESULT_STATUSES.has(value.result_status as AiUsageResultStatus) ||
      typeof value.usage_measurement_status !== "string" || !MEASUREMENT_STATUSES.has(value.usage_measurement_status as AiUsageMeasurementStatus) ||
      !Array.isArray(value.provider_attempts) || value.provider_attempts.length > 2 ||
      (providerAttemptTelemetryAvailable && (providerAttemptCount as number) !== value.provider_attempts.length) ||
      (!providerAttemptTelemetryAvailable && value.provider_attempts.length !== 0)) {
    throw new Error("ai_audit_response_invalid");
  }
  if (value.usage_measurement_status === "measured" && (observedInputTokens === null || observedOutputTokens === null)) {
    throw new Error("ai_audit_response_invalid");
  }
  if (value.usage_measurement_status === "unknown" || value.usage_measurement_status === "not_attempted" ||
      value.usage_measurement_status === "legacy_unknown") {
    if (observedInputTokens !== null || observedOutputTokens !== null) throw new Error("ai_audit_response_invalid");
  }
  const outcomeReason = nullableText(value.outcome_reason, 80);
  if (outcomeReason !== null && !OUTCOME_REASONS.has(outcomeReason)) throw new Error("ai_audit_response_invalid");
  const createdAt = text(value.created_at, 64);
  if (!Number.isFinite(Date.parse(createdAt))) throw new Error("ai_audit_response_invalid");
  return {
    id,
    requestId,
    actorProfileId,
    modelName,
    estimatedCost: estimatedCost as number,
    executionTimeMs: executionTimeMs as number,
    fallbackUsed: value.fallback_used,
    resultStatus: value.result_status as AiUsageResultStatus,
    measurementStatus: value.usage_measurement_status as AiUsageMeasurementStatus,
    observedInputTokens,
    observedOutputTokens,
    providerAttemptCount: providerAttemptCount as number,
    providerAttemptTelemetryAvailable,
    providerAttempts: value.provider_attempts.map(parseAttempt),
    outcomeReason,
    createdAt,
  };
}

export async function listAiUsageAudit(query: AiUsageAuditQuery = {}): Promise<AiUsageAuditPage> {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    throw new Error("ai_audit_query_invalid");
  }
  const { data, error } = await supabase.rpc("list_ai_gateway_audit", {
    p_result_status: query.status ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    if (error.code === "42501") throw new Error("لا تملك صلاحية عرض تدقيق محاولات الذكاء في هذه المؤسسة.");
    if (error.code === "22023") throw new Error("مرشح أو نطاق سجل المحاولات غير صالح.");
    throw new Error("تعذر تحميل سجل محاولات الذكاء من الخادم.");
  }
  if (!isRecord(data) || !Array.isArray(data.items)) throw new Error("ai_audit_response_invalid");
  const total = integer(data.total, 100000000);
  const resultLimit = integer(data.limit, 100);
  const resultOffset = integer(data.offset, 10000);
  if (total === null || resultLimit === null || resultOffset === null ||
      resultLimit !== limit || resultOffset !== offset || data.items.length > limit) {
    throw new Error("ai_audit_response_invalid");
  }
  return {
    items: data.items.map(parseRecord),
    total,
    limit: resultLimit,
    offset: resultOffset,
  };
}
