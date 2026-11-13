import type {
  CustomerServiceDeskCase,
  CustomerServiceDeskFilters,
  CustomerServiceDeskSummary,
} from "@/lib/customer-service-desk";

export type CustomerServiceDeskPrintDocument = {
  generatedAt: string;
  filters: {
    status: string;
    priority: string;
    assignment: string;
    overdueOnly: boolean;
    search: string;
  };
  fullOpenSummary: CustomerServiceDeskSummary;
  loadedCount: number;
  hasMore: boolean;
  cases: Array<{
    caseCode: string;
    customerName: string;
    customerCode: string;
    subject: string;
    caseType: string;
    priority: string;
    status: string;
    createdAt: string;
    updatedAt: string;
    responseDueAt: string;
    firstResponseAt: string | null;
    responseOverdue: boolean;
    resolutionDueAt: string;
    resolutionOverdue: boolean;
    escalationLevel: number;
    assignedToName: string;
    taskDueAt: string | null;
    hasLinkedTask: boolean;
  }>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = ["open", "in_progress", "waiting_customer", "resolved", "closed"] as const;
const priorities = ["low", "medium", "high", "urgent"] as const;
const types = ["complaint", "inquiry", "service_request", "delivery_issue", "other"] as const;
const assignments = ["all", "assigned", "unassigned"] as const;

const statusLabels: Record<CustomerServiceDeskCase["status"], string> = {
  open: "مفتوحة",
  in_progress: "قيد المعالجة",
  waiting_customer: "بانتظار العميل",
  resolved: "تم الحل",
  closed: "مغلقة",
};
const priorityLabels: Record<CustomerServiceDeskCase["priority"], string> = {
  low: "منخفضة",
  medium: "متوسطة",
  high: "عالية",
  urgent: "عاجلة",
};
const typeLabels: Record<CustomerServiceDeskCase["case_type"], string> = {
  complaint: "شكوى",
  inquiry: "استفسار",
  service_request: "طلب خدمة",
  delivery_issue: "مشكلة تسليم",
  other: "أخرى",
};

type Row = Record<string, unknown>;

function object(value: unknown, label: string): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("بيانات " + label + " غير صالحة في كشف خدمة العملاء.");
  }
  return value as Row;
}

function boundedText(value: unknown, label: string, max: number, allowEmpty = false): string {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) {
    throw new Error("حقل " + label + " غير صالح في كشف خدمة العملاء.");
  }
  return value.trim();
}

function requiredText(value: unknown, label: string, max = 500): string {
  return boundedText(value, label, max);
}

function date(value: unknown, label: string): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new Error("تاريخ " + label + " غير صالح في كشف خدمة العملاء.");
  }
  return new Date(value).toISOString();
}

function nullableDate(value: unknown, label: string): string | null {
  return value === null ? null : date(value, label);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], label: string): T {
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    throw new Error("قيمة " + label + " غير معروفة في كشف خدمة العملاء.");
  }
  return value as T;
}

function safeCount(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error("مؤشر " + label + " غير صالح في ملخص خدمة العملاء.");
  }
  return value;
}

function statusFilter(value: unknown): string {
  if (value === "active") return "الحالات النشطة";
  if (value === "all") return "كل الحالات";
  const status = enumValue(value, statuses, "مرشح الحالة");
  return statusLabels[status];
}

function priorityFilter(value: unknown): string {
  if (value === "all") return "كل الأولويات";
  const priority = enumValue(value, priorities, "مرشح الأولوية");
  return priorityLabels[priority];
}

/**
 * Builds a staff-only report from the exact queue pages loaded by the authorized
 * work-queue RPC. It is deliberately a projection: private narrative, actor IDs,
 * tenant IDs and internal task identifiers never enter the printable/exported DTO.
 */
export function projectCustomerServiceDeskPrintDocument(input: {
  items: CustomerServiceDeskCase[];
  summary: CustomerServiceDeskSummary;
  filters: CustomerServiceDeskFilters;
  hasMore: boolean;
  generatedAt?: string;
}): CustomerServiceDeskPrintDocument {
  const source = object(input, "لقطة الطابور");
  if (!Array.isArray(source.items) || typeof source.hasMore !== "boolean") {
    throw new Error("لقطة طابور خدمة العملاء غير مكتملة؛ أوقف إنشاء التقرير.");
  }

  const generatedAt = date(
    source.generatedAt === undefined ? new Date().toISOString() : source.generatedAt,
    "وقت استخراج التقرير",
  );
  const summaryRow = object(source.summary, "ملخص المؤسسة");
  const summary: CustomerServiceDeskSummary = {
    open_count: safeCount(summaryRow.open_count, "الحالات المفتوحة"),
    response_overdue_count: safeCount(summaryRow.response_overdue_count, "تأخر الاستجابة"),
    resolution_overdue_count: safeCount(summaryRow.resolution_overdue_count, "تأخر الحل"),
    unassigned_count: safeCount(summaryRow.unassigned_count, "الحالات غير المسندة"),
    urgent_count: safeCount(summaryRow.urgent_count, "الحالات العاجلة"),
    high_count: safeCount(summaryRow.high_count, "الحالات عالية الأولوية"),
  };

  const filterRow = object(source.filters, "مرشحات التقرير");
  const assignment = enumValue(filterRow.assignment, assignments, "مرشح الإسناد");
  if (typeof filterRow.overdueOnly !== "boolean") {
    throw new Error("مرشح التأخير غير صالح في كشف خدمة العملاء.");
  }
  const filters = {
    status: statusFilter(filterRow.status),
    priority: priorityFilter(filterRow.priority),
    assignment: assignment === "all"
      ? "جميع الحالات"
      : assignment === "assigned" ? "المسندة فقط" : "غير المسندة فقط",
    overdueOnly: filterRow.overdueOnly,
    search: boundedText(filterRow.search, "البحث", 160, true),
  };

  const seenIds = new Set<string>();
  const seenCodes = new Set<string>();
  const now = Date.parse(generatedAt);
  const cases = source.items.map((value, index) => {
    const row = object(value, "الحالة " + (index + 1));
    const caseId = requiredText(row.case_id, "معرف الحالة", 80);
    if (!UUID.test(caseId)) {
      throw new Error("معرف الحالة غير صالح في كشف خدمة العملاء.");
    }
    const normalizedId = caseId.toLowerCase();
    if (seenIds.has(normalizedId)) {
      throw new Error("تكررت هوية الحالة في لقطة التقرير؛ أوقف التصدير.");
    }
    seenIds.add(normalizedId);

    const caseCode = requiredText(row.case_code, "رقم الحالة", 80);
    const normalizedCode = caseCode.toLocaleLowerCase("en-US");
    if (seenCodes.has(normalizedCode)) {
      throw new Error("تكرر رقم الحالة في لقطة التقرير؛ أوقف التصدير.");
    }
    seenCodes.add(normalizedCode);

    const customerId = requiredText(row.customer_id, "معرف العميل", 80);
    if (!UUID.test(customerId)) {
      throw new Error("مرجع العميل غير صالح في كشف خدمة العملاء.");
    }
    const taskId = row.task_id === null ? null : requiredText(row.task_id, "مرجع المهمة", 80);
    const assigneeId = row.assigned_to_id === null ? null : requiredText(row.assigned_to_id, "مرجع المسؤول", 80);
    if ((taskId !== null && !UUID.test(taskId)) || (assigneeId !== null && !UUID.test(assigneeId))) {
      throw new Error("مرجع المهمة أو المسؤول غير صالح في كشف خدمة العملاء.");
    }

    const status = enumValue(row.status, statuses, "حالة الحالة");
    const priority = enumValue(row.priority, priorities, "أولوية الحالة");
    const caseType = enumValue(row.case_type, types, "نوع الحالة");
    const escalationLevel = row.escalation_level;
    if (typeof escalationLevel !== "number" || !Number.isSafeInteger(escalationLevel) ||
        escalationLevel < 0 || escalationLevel > 10) {
      throw new Error("مستوى تصعيد الحالة غير صالح في كشف خدمة العملاء.");
    }

    const createdAt = date(row.created_at, "فتح الحالة");
    const updatedAt = date(row.updated_at, "آخر تحديث");
    const responseDueAt = date(row.response_due_at, "موعد الاستجابة");
    const firstResponseAt = nullableDate(row.first_response_at, "أول استجابة");
    const resolutionDueAt = date(row.resolution_due_at, "موعد الحل");
    const active = status !== "resolved" && status !== "closed";

    return {
      caseCode,
      customerName: requiredText(row.customer_name, "اسم العميل", 240),
      customerCode: boundedText(row.customer_code, "كود العميل", 80, true),
      subject: requiredText(row.subject, "موضوع الحالة", 200),
      caseType: typeLabels[caseType],
      priority: priorityLabels[priority],
      status: statusLabels[status],
      createdAt,
      updatedAt,
      responseDueAt,
      firstResponseAt,
      responseOverdue: active && firstResponseAt === null && Date.parse(responseDueAt) < now,
      resolutionDueAt,
      resolutionOverdue: active && Date.parse(resolutionDueAt) < now,
      escalationLevel,
      assignedToName: requiredText(row.assigned_to_name, "المسؤول", 240),
      taskDueAt: nullableDate(row.task_due_at, "استحقاق المهمة"),
      hasLinkedTask: taskId !== null,
    };
  });

  return {
    generatedAt,
    filters,
    fullOpenSummary: summary,
    loadedCount: cases.length,
    hasMore: source.hasMore,
    cases,
  };
}
