import { supabase } from "@/lib/supabase";

export type RuntimeErrorKind =
  | "error"
  | "type_error"
  | "reference_error"
  | "syntax_error"
  | "range_error"
  | "response_error"
  | "unknown_error";
export type RuntimeErrorBoundary =
  | "tanstack_root_error_component"
  | "window_error"
  | "unhandled_rejection"
  | "unknown";
export type RuntimeErrorStatus = "open" | "acknowledged" | "resolved";

export interface RuntimeErrorEvent {
  id: string;
  error_kind: RuntimeErrorKind;
  http_status: number | null;
  boundary: RuntimeErrorBoundary;
  source: "browser";
  status: RuntimeErrorStatus;
  occurrence_count: number;
  created_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface RuntimeErrorEventPage {
  items: RuntimeErrorEvent[];
  total: number;
  limit: number;
  offset: number;
  read_at: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = new Set<RuntimeErrorKind>([
  "error", "type_error", "reference_error", "syntax_error",
  "range_error", "response_error", "unknown_error",
]);
const boundaries = new Set<RuntimeErrorBoundary>([
  "tanstack_root_error_component", "window_error", "unhandled_rejection", "unknown",
]);
const statuses = new Set<RuntimeErrorStatus>(["open", "acknowledged", "resolved"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}
function isNullableTimestamp(value: unknown): value is string | null {
  return value === null || isTimestamp(value);
}
function parseEvent(value: unknown): RuntimeErrorEvent {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" || !UUID.test(value.id) ||
    typeof value.error_kind !== "string" || !kinds.has(value.error_kind as RuntimeErrorKind) ||
    !(value.http_status === null || (Number.isInteger(value.http_status) && Number(value.http_status) >= 400 && Number(value.http_status) <= 599)) ||
    typeof value.boundary !== "string" || !boundaries.has(value.boundary as RuntimeErrorBoundary) ||
    value.source !== "browser" ||
    typeof value.status !== "string" || !statuses.has(value.status as RuntimeErrorStatus) ||
    !Number.isInteger(value.occurrence_count) || Number(value.occurrence_count) < 1 ||
    !isTimestamp(value.created_at) || !isTimestamp(value.last_seen_at) ||
    !isNullableTimestamp(value.acknowledged_at) || !isNullableTimestamp(value.resolved_at)
  ) {
    throw new Error("أعاد الخادم سجلاً غير صالح؛ تم إخفاء النتائج لحماية البيانات.");
  }
  return {
    id: value.id,
    error_kind: value.error_kind as RuntimeErrorKind,
    http_status: value.http_status as number | null,
    boundary: value.boundary as RuntimeErrorBoundary,
    source: "browser",
    status: value.status as RuntimeErrorStatus,
    occurrence_count: Number(value.occurrence_count),
    created_at: value.created_at,
    last_seen_at: value.last_seen_at,
    acknowledged_at: value.acknowledged_at,
    resolved_at: value.resolved_at,
  };
}

export async function fetchAdminRuntimeErrorEvents(input: {
  status?: RuntimeErrorStatus | null;
  limit?: number;
  offset?: number;
} = {}): Promise<RuntimeErrorEventPage> {
  const limit = input.limit ?? 50;
  const offset = input.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 10000) {
    throw new Error("حدود قراءة سجل الأخطاء غير صالحة.");
  }
  if (input.status != null && !statuses.has(input.status)) {
    throw new Error("مرشح حالة سجل الأخطاء غير صالح.");
  }
  const { data, error } = await supabase.rpc("list_runtime_error_events", {
    p_status: input.status ?? null,
    p_limit: limit,
    p_offset: offset,
  });
  if (error || !isRecord(data) || !Array.isArray(data.items) ||
      !Number.isInteger(data.total) || Number(data.total) < 0 ||
      data.limit !== limit || data.offset !== offset || !isTimestamp(data.read_at)) {
    throw new Error("تعذر تحميل سجل الأخطاء من المصدر المصرح به.");
  }
  return {
    items: data.items.map(parseEvent),
    total: Number(data.total),
    limit,
    offset,
    read_at: data.read_at,
  };
}

export async function transitionAdminRuntimeErrorEvent(
  eventId: string,
  status: Extract<RuntimeErrorStatus, "acknowledged" | "resolved">,
): Promise<{ event_id: string; status: RuntimeErrorStatus; changed: boolean }> {
  if (!UUID.test(eventId) || (status !== "acknowledged" && status !== "resolved")) {
    throw new Error("بيانات إجراء سجل الأخطاء غير صالحة.");
  }
  const { data, error } = await supabase.rpc("transition_runtime_error_event", {
    p_event_id: eventId,
    p_status: status,
  });
  if (!isRecord(data) || error || data.event_id !== eventId ||
      data.status !== status || typeof data.changed !== "boolean") {
    throw new Error("تعذر حفظ إجراء معالجة الخطأ؛ أعد تحميل السجل للتحقق من حالته.");
  }
  return { event_id: eventId, status, changed: data.changed };
}
