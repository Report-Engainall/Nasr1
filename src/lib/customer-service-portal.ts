import { supabase } from "./supabase";
import {
  randomCaseRequestKey,
  type CustomerServiceCasePriority,
  type CustomerServiceCaseStatus,
  type CustomerServiceCaseType,
} from "./customer-service-cases";

export interface CustomerServicePortalContext {
  customerId: string;
  companyName: string;
  canRead: boolean;
  canReply: boolean;
  canCreate: boolean;
}
export interface CustomerServicePortalMessage {
  id: string;
  message: string;
  authorSide: "customer" | "staff";
  authorName: string;
  createdAt: string;
}
export interface CustomerServicePortalCase {
  id: string;
  caseCode: string;
  caseType: CustomerServiceCaseType;
  subject: string;
  description: string;
  priority: CustomerServiceCasePriority;
  status: CustomerServiceCaseStatus;
  createdAt: string;
  updatedAt: string;
  responseDueAt: string;
  resolutionDueAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  canReply: boolean;
  messages: CustomerServicePortalMessage[];
}

type Row = Record<string, unknown>;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const caseTypes = ["complaint", "inquiry", "service_request", "delivery_issue", "other"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const statuses = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;

function object(value: unknown, label: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("بيانات " + label + " غير صالحة.");
  }
  return value as Row;
}
function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error("حقل " + label + " مفقود.");
  return value;
}
function nullableDate(value: unknown, label: string): string | null {
  if (value === null) return null;
  const parsed = text(value, label);
  if (!Number.isFinite(Date.parse(parsed))) throw new Error("تاريخ " + label + " غير صالح.");
  return parsed;
}
function date(value: unknown, label: string): string {
  const parsed = nullableDate(value, label);
  if (!parsed) throw new Error("تاريخ " + label + " مفقود.");
  return parsed;
}
function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error("قيمة " + label + " غير معروفة.");
  }
  return value as T;
}
function parseMessage(value: unknown, index: number): CustomerServicePortalMessage {
  const row = object(value, "رسالة الحالة " + (index + 1));
  const id = text(row.id, "معرف الرسالة");
  if (!uuidPattern.test(id)) throw new Error("معرف رسالة حالة الخدمة غير صالح.");
  return {
    id,
    message: text(row.message, "نص الرسالة"),
    authorSide: enumValue(row.author_side, ["customer", "staff"] as const, "جهة الرسالة"),
    authorName: text(row.author_name, "اسم مرسل الرسالة"),
    createdAt: date(row.created_at, "تاريخ الرسالة"),
  };
}
function parsePortalCase(value: unknown, index: number): CustomerServicePortalCase {
  const row = object(value, "حالة الخدمة " + (index + 1));
  const id = text(row.id, "معرف الحالة");
  if (!uuidPattern.test(id) || typeof row.messages === "undefined" || !Array.isArray(row.messages)) {
    throw new Error("مرجع الحالة أو سجل رسائلها غير صالح.");
  }
  return {
    id,
    caseCode: text(row.case_code, "رقم الحالة"),
    caseType: enumValue(row.case_type, caseTypes, "نوع الحالة"),
    subject: text(row.subject, "موضوع الحالة"),
    description: text(row.description, "تفاصيل الحالة"),
    priority: enumValue(row.priority, priorities, "أولوية الحالة"),
    status: enumValue(row.status, statuses, "حالة الحالة"),
    createdAt: date(row.created_at, "تاريخ فتح الحالة"),
    updatedAt: date(row.updated_at, "آخر تحديث"),
    responseDueAt: date(row.response_due_at, "موعد الاستجابة"),
    resolutionDueAt: date(row.resolution_due_at, "موعد الحل"),
    firstResponseAt: nullableDate(row.first_response_at, "أول استجابة"),
    resolvedAt: nullableDate(row.resolved_at, "تاريخ الحل"),
    closedAt: nullableDate(row.closed_at, "تاريخ الإغلاق"),
    canReply: typeof row.can_reply === "boolean" ? row.can_reply :
      !["resolved", "closed"].includes(String(row.status)),
    messages: row.messages.map(parseMessage),
  };
}

export async function fetchMyCustomerServicePortalContext(): Promise<CustomerServicePortalContext> {
  const { data, error } = await supabase.rpc("get_my_customer_service_portal_context");
  if (error) throw error;
  const row = object(data, "صلاحيات بوابة خدمة العملاء");
  const customerId = text(row.customer_id, "معرف شركة العميل");
  if (!uuidPattern.test(customerId)) throw new Error("معرف شركة العميل غير صالح.");
  if (typeof row.can_read !== "boolean" || typeof row.can_reply !== "boolean" || typeof row.can_create !== "boolean") {
    throw new Error("صلاحيات بوابة خدمة العملاء غير مكتملة.");
  }
  return {
    customerId,
    companyName: text(row.company_name, "اسم الشركة"),
    canRead: row.can_read,
    canReply: row.can_reply,
    canCreate: row.can_create,
  };
}

export async function fetchMyCustomerServiceCases(limit = 50): Promise<CustomerServicePortalCase[]> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("حجم قائمة حالات العميل غير صالح.");
  }
  const { data, error } = await supabase.rpc("get_my_customer_service_cases", { p_limit: limit });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("قائمة حالات خدمة العملاء غير صالحة.");
  return data.map(parsePortalCase);
}

export function newCustomerServicePortalRequestKey(): string {
  return randomCaseRequestKey();
}

export async function createMyCustomerServiceCase(input: {
  idempotencyKey: string;
  caseType: CustomerServiceCaseType;
  subject: string;
  description: string;
  priority: CustomerServiceCasePriority;
}): Promise<{ id: string; caseCode: string }> {
  const subject = input.subject.trim();
  const description = input.description.trim();
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.idempotencyKey) ||
      !caseTypes.includes(input.caseType) || !priorities.includes(input.priority) ||
      !subject || subject.length > 200 || !description || description.length > 4000) {
    throw new Error("نوع الحالة أو الأولوية أو الموضوع أو التفاصيل غير صالحة.");
  }
  const { data, error } = await supabase.rpc("create_my_customer_service_case", {
    p_idempotency_key: input.idempotencyKey,
    p_case_type: input.caseType,
    p_subject: subject,
    p_description: description,
    p_priority: input.priority,
  });
  if (error) throw error;
  const row = object(data, "نتيجة فتح الحالة");
  const id = text(row.id, "معرف الحالة");
  if (!uuidPattern.test(id)) throw new Error("معرف الحالة الناتج غير صالح.");
  return { id, caseCode: text(row.case_code, "رقم الحالة") };
}

export async function addMyCustomerServiceCaseMessage(caseId: string, message: string): Promise<void> {
  const body = message.trim();
  if (!uuidPattern.test(caseId) || !body || body.length > 2000) {
    throw new Error("معرف الحالة أو نص الرد غير صالح.");
  }
  const { error } = await supabase.rpc("add_my_customer_service_case_message", {
    p_case_id: caseId,
    p_message: body,
  });
  if (error) throw error;
}

export async function fetchCustomerServiceCaseMessages(caseId: string): Promise<CustomerServicePortalMessage[]> {
  if (!uuidPattern.test(caseId)) throw new Error("معرف الحالة غير صالح.");
  const { data, error } = await supabase.rpc("get_customer_service_case_messages", { p_case_id: caseId });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error("سجل مراسلات الحالة غير صالح.");
  return data.map(parseMessage);
}

export async function addCustomerServiceCaseStaffMessage(caseId: string, message: string): Promise<void> {
  const body = message.trim();
  if (!uuidPattern.test(caseId) || !body || body.length > 2000) {
    throw new Error("معرف الحالة أو الرد المرسل للعميل غير صالح.");
  }
  const { error } = await supabase.rpc("add_customer_service_case_staff_message", {
    p_case_id: caseId,
    p_message: body,
  });
  if (error) throw error;
}
