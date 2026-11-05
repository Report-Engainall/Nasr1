import { supabase } from "./supabase";

export type CustomerServiceCaseType =
  | "complaint" | "inquiry" | "service_request" | "delivery_issue" | "other";
export type CustomerServiceCasePriority = "low" | "medium" | "high" | "urgent";
export type CustomerServiceCaseStatus =
  | "open" | "in_progress" | "waiting_customer" | "resolved" | "closed";

export interface CustomerServiceCaseEvent {
  id: string;
  event_type: string;
  note: string | null;
  actor_name: string;
  created_at: string;
}
export interface CustomerServiceCase {
  id: string;
  case_code: string;
  case_type: CustomerServiceCaseType;
  subject: string;
  description: string;
  priority: CustomerServiceCasePriority;
  status: CustomerServiceCaseStatus;
  created_at: string;
  updated_at: string;
  created_by_name: string;
  resolution_note: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  task_id: string | null;
  assigned_to_name: string;
  events: CustomerServiceCaseEvent[];
}
export interface CustomerServiceCaseInput {
  customerId: string;
  idempotencyKey: string;
  caseType: CustomerServiceCaseType;
  subject: string;
  description: string;
  priority: CustomerServiceCasePriority;
}

type Row = Record<string, unknown>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function object(value: unknown, label: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("بيانات " + label + " غير صالحة.");
  return value as Row;
}
function string(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("حقل " + label + " مفقود.");
  return value;
}
function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return string(value, label);
}
function date(value: unknown, label: string): string {
  const result = string(value, label);
  if (!Number.isFinite(Date.parse(result))) throw new Error("تاريخ " + label + " غير صالح.");
  return result;
}
function nullableDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  return date(value, label);
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) throw new Error("قيمة " + label + " غير معروفة.");
  return value as T;
}
const CASE_TYPES = ["complaint","inquiry","service_request","delivery_issue","other"] as const;
const CASE_PRIORITIES = ["low","medium","high","urgent"] as const;
const CASE_STATUSES = ["open","in_progress","waiting_customer","resolved","closed"] as const;

function parseCaseEvent(value: unknown, index: number): CustomerServiceCaseEvent {
  const row = object(value, "حدث الحالة " + (index + 1));
  return {
    id: string(row.id, "معرف الحدث"),
    event_type: string(row.event_type, "نوع الحدث"),
    note: nullableString(row.note, "ملاحظة الحدث"),
    actor_name: string(row.actor_name, "منفذ الحدث"),
    created_at: date(row.created_at, "وقت الحدث"),
  };
}
function parseCase(value: unknown, index: number): CustomerServiceCase {
  const row = object(value, "الحالة " + (index + 1));
  const events = row.events;
  if (!Array.isArray(events)) throw new Error("سجل أحداث الحالة غير صالح.");
  const taskId = nullableString(row.task_id, "مهمة الحالة");
  if (taskId !== null && !uuid.test(taskId)) throw new Error("مرجع مهمة الحالة غير صالح.");
  return {
    id: string(row.id, "معرف الحالة"),
    case_code: string(row.case_code, "رقم الحالة"),
    case_type: enumValue(row.case_type, CASE_TYPES, "نوع الحالة"),
    subject: string(row.subject, "موضوع الحالة"),
    description: string(row.description, "وصف الحالة"),
    priority: enumValue(row.priority, CASE_PRIORITIES, "أولوية الحالة"),
    status: enumValue(row.status, CASE_STATUSES, "حالة سير العمل"),
    created_at: date(row.created_at, "تاريخ إنشاء الحالة"),
    updated_at: date(row.updated_at, "آخر تحديث للحالة"),
    created_by_name: string(row.created_by_name, "منشئ الحالة"),
    resolution_note: nullableString(row.resolution_note, "ملخص الحل"),
    resolved_at: nullableDate(row.resolved_at, "تاريخ الحل"),
    closed_at: nullableDate(row.closed_at, "تاريخ الإغلاق"),
    task_id: taskId,
    assigned_to_name: string(row.assigned_to_name, "الموظف المسند إليه"),
    events: events.map(parseCaseEvent),
  };
}

function randomCaseRequestKey(): string {
  const randomPart = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID().replace(/-/g, "")
    : Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  return "customer_case_" + randomPart;
}

export async function fetchCustomerServiceCases(customerId: string, limit = 50): Promise<CustomerServiceCase[]> {
  if (!uuid.test(customerId)) throw new Error("معرّف العميل غير صالح.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("حد عرض حالات العميل غير صالح.");
  const { data, error } = await supabase.rpc("get_customer_service_cases", {
    p_customer_id: customerId,
    p_limit: limit,
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("أعاد الخادم قائمة حالات غير صالحة.");
  return data.map(parseCase);
}

export async function createCustomerServiceCase(input: CustomerServiceCaseInput): Promise<{
  id: string; caseCode: string; taskId: string | null; replayed: boolean;
}> {
  if (!uuid.test(input.customerId)) throw new Error("معرّف العميل غير صالح.");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey)) throw new Error("مفتاح طلب الحالة غير صالح.");
  const subject = input.subject.trim();
  const description = input.description.trim();
  if (!CASE_TYPES.includes(input.caseType) || !CASE_PRIORITIES.includes(input.priority) ||
      !subject || subject.length > 200 || !description || description.length > 4000) {
    throw new Error("نوع الحالة أو الأولوية أو الموضوع أو الوصف غير صالح.");
  }
  const { data, error } = await supabase.rpc("create_customer_service_case", {
    p_customer_id: input.customerId,
    p_idempotency_key: input.idempotencyKey,
    p_case_type: input.caseType,
    p_subject: subject,
    p_description: description,
    p_priority: input.priority,
  });
  if (error) throw error;
  const row = object(data, "نتيجة إنشاء الحالة");
  const id = string(row.id, "معرف الحالة");
  const caseCode = string(row.case_code, "رقم الحالة");
  const taskId = nullableString(row.task_id, "مهمة الحالة");
  if (!uuid.test(id) || (taskId !== null && !uuid.test(taskId)) || typeof row.replayed !== "boolean") {
    throw new Error("استجابة إنشاء الحالة غير مكتملة.");
  }
  return { id, caseCode, taskId, replayed: row.replayed };
}

export async function updateCustomerServiceCase(input: {
  caseId: string;
  status?: CustomerServiceCaseStatus | null;
  priority?: CustomerServiceCasePriority | null;
  note?: string | null;
}): Promise<{ id: string; caseCode: string; status: CustomerServiceCaseStatus; priority: CustomerServiceCasePriority; taskId: string | null }> {
  if (!uuid.test(input.caseId)) throw new Error("معرّف الحالة غير صالح.");
  if (input.status != null && !CASE_STATUSES.includes(input.status)) throw new Error("حالة سير العمل غير صالحة.");
  if (input.priority != null && !CASE_PRIORITIES.includes(input.priority)) throw new Error("أولوية الحالة غير صالحة.");
  const note = input.note?.trim() || null;
  if (note && note.length > 1000) throw new Error("ملاحظة الحالة تتجاوز 1,000 حرف.");
  const { data, error } = await supabase.rpc("update_customer_service_case", {
    p_case_id: input.caseId,
    p_status: input.status ?? null,
    p_priority: input.priority ?? null,
    p_note: note,
  });
  if (error) throw error;
  const row = object(data, "نتيجة تحديث الحالة");
  const id = string(row.id, "معرف الحالة");
  const caseCode = string(row.case_code, "رقم الحالة");
  const taskId = nullableString(row.task_id, "مهمة الحالة");
  if (!uuid.test(id) || id !== input.caseId || (taskId !== null && !uuid.test(taskId))) {
    throw new Error("استجابة تحديث الحالة غير مكتملة.");
  }
  return {
    id,
    caseCode,
    status: enumValue(row.status, CASE_STATUSES, "حالة الحالة"),
    priority: enumValue(row.priority, CASE_PRIORITIES, "أولوية الحالة"),
    taskId,
  };
}

export { randomCaseRequestKey };
