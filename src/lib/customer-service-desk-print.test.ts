import { describe, expect, it } from "vitest";
import type {
  CustomerServiceDeskCase,
  CustomerServiceDeskFilters,
  CustomerServiceDeskSummary,
} from "@/lib/customer-service-desk";
import {
  projectCustomerServiceDeskPrintDocument,
  type CustomerServiceDeskPrintDocument,
} from "./customer-service-desk-print";
import { buildCustomerServiceDeskWorkbookXlsx } from "./customer-service-desk-xlsx";

const AS_OF = "2026-11-13T09:00:00.000Z";
const CASE_ID = "a0000000-0000-4000-8000-000000000001";
const CUSTOMER_ID = "a0000000-0000-4000-8000-000000000002";
const TASK_ID = "a0000000-0000-4000-8000-000000000003";
const ASSIGNEE_ID = "a0000000-0000-4000-8000-000000000004";

const summary: CustomerServiceDeskSummary = {
  open_count: 12,
  response_overdue_count: 2,
  resolution_overdue_count: 1,
  unassigned_count: 3,
  urgent_count: 2,
  high_count: 4,
};

const filters: CustomerServiceDeskFilters = {
  status: "active",
  priority: "all",
  assignment: "all",
  overdueOnly: false,
  search: "",
};

function queueCase(overrides: Partial<CustomerServiceDeskCase> = {}): CustomerServiceDeskCase {
  return {
    case_id: CASE_ID,
    customer_id: CUSTOMER_ID,
    customer_name: "عميل اختبار",
    customer_code: "C-001",
    case_code: "CS-2026-001",
    case_type: "complaint",
    subject: "تأخر تسليم الطلب",
    description: "PRIVATE-DESCRIPTION-MUST-NOT-EXPORT",
    priority: "urgent",
    status: "open",
    created_at: "2026-11-13T07:00:00.000Z",
    updated_at: "2026-11-13T07:30:00.000Z",
    response_due_at: "2026-11-13T08:00:00.000Z",
    resolution_due_at: "2026-11-13T08:30:00.000Z",
    first_response_at: null,
    escalated_at: "2026-11-13T08:45:00.000Z",
    escalation_level: 2,
    created_by_name: "PRIVATE-CREATOR-NAME",
    task_id: TASK_ID,
    assigned_to_id: ASSIGNEE_ID,
    assigned_to_name: "مسؤول الخدمة",
    task_due_at: "2026-11-13T10:00:00.000Z",
    ...overrides,
  };
}

function project(input: {
  items?: CustomerServiceDeskCase[];
  summary?: CustomerServiceDeskSummary;
  filters?: CustomerServiceDeskFilters;
  hasMore?: boolean;
  generatedAt?: string;
} = {}): CustomerServiceDeskPrintDocument {
  return projectCustomerServiceDeskPrintDocument({
    items: input.items ?? [queueCase()],
    summary: input.summary ?? summary,
    filters: input.filters ?? filters,
    hasMore: input.hasMore ?? false,
    generatedAt: input.generatedAt ?? AS_OF,
  });
}

describe("customer service desk report projection", () => {
  it("normalizes report time and calculates SLA flags from the same point-in-time snapshot", () => {
    const document = project({ generatedAt: "2026-11-13T12:00:00+03:00" });
    expect(document.generatedAt).toBe(AS_OF);
    expect(document.cases[0]).toMatchObject({
      caseType: "شكوى",
      priority: "عاجلة",
      status: "مفتوحة",
      responseOverdue: true,
      resolutionOverdue: true,
      hasLinkedTask: true,
      escalationLevel: 2,
    });
  });

  it("does not mark a first-response SLA as overdue after a response was recorded", () => {
    const document = project({
      items: [queueCase({ first_response_at: "2026-11-13T08:30:00.000Z" })],
    });
    expect(document.cases[0].responseOverdue).toBe(false);
    expect(document.cases[0].resolutionOverdue).toBe(true);
  });

  it("preserves the server-wide summary separately from filtered loaded case rows", () => {
    const document = project({
      items: [queueCase(), queueCase({
        case_id: "a0000000-0000-4000-8000-000000000005",
        case_code: "CS-2026-002",
        status: "resolved",
      })],
      filters: { ...filters, status: "open", priority: "urgent" },
      hasMore: true,
    });
    expect(document.fullOpenSummary).toEqual(summary);
    expect(document.loadedCount).toBe(2);
    expect(document.hasMore).toBe(true);
    expect(document.filters.status).toBe("مفتوحة");
    expect(document.filters.priority).toBe("عاجلة");
  });

  it("projects only approved report fields and excludes private narrative and internal identifiers", () => {
    const document = project();
    const serialized = JSON.stringify(document);
    for (const privateValue of [
      CASE_ID, CUSTOMER_ID, TASK_ID, ASSIGNEE_ID,
      "PRIVATE-DESCRIPTION-MUST-NOT-EXPORT", "PRIVATE-CREATOR-NAME",
    ]) {
      expect(serialized).not.toContain(privateValue);
    }
    expect(document.cases[0]).not.toHaveProperty("description");
    expect(document.cases[0]).not.toHaveProperty("assigned_to_id");
    expect(document.cases[0]).not.toHaveProperty("task_id");
    expect(document.cases[0].hasLinkedTask).toBe(true);
  });

  it("treats an absent task reference as invalid instead of claiming a linked task", () => {
    expect(() => project({
      items: [{ ...queueCase(), task_id: undefined as unknown as null }],
    })).toThrow(/مرجع المهمة/);
  });

  it("rejects malformed task and assignee UUID references", () => {
    expect(() => project({ items: [queueCase({ task_id: "task-1" })] })).toThrow(/مرجع المهمة أو المسؤول/);
    expect(() => project({ items: [queueCase({ assigned_to_id: "staff-1" })] })).toThrow(/مرجع المهمة أو المسؤول/);
  });

  it("rejects invalid case and customer identities", () => {
    expect(() => project({ items: [queueCase({ case_id: "not-a-uuid" })] })).toThrow(/معرف الحالة/);
    expect(() => project({ items: [queueCase({ customer_id: "not-a-uuid" })] })).toThrow(/مرجع العميل/);
  });

  it("rejects duplicate case UUIDs irrespective of letter casing and duplicate case codes", () => {
    expect(() => project({
      items: [
        queueCase({ case_id: CASE_ID }),
        queueCase({ case_id: CASE_ID.toUpperCase(), case_code: "CS-2026-002" }),
      ],
    })).toThrow(/تكررت هوية الحالة/);
    expect(() => project({
      items: [
        queueCase({ case_code: "CS-2026-001" }),
        queueCase({ case_id: "a0000000-0000-4000-8000-000000000005", case_code: "cs-2026-001" }),
      ],
    })).toThrow(/تكرر رقم الحالة/);
  });

  it("rejects unknown workflow, priority and case-type values", () => {
    expect(() => project({ items: [queueCase({ status: "unknown" as CustomerServiceDeskCase["status"] })] }))
      .toThrow(/حالة الحالة/);
    expect(() => project({ items: [queueCase({ priority: "critical" as CustomerServiceDeskCase["priority"] })] }))
      .toThrow(/أولوية الحالة/);
    expect(() => project({ items: [queueCase({ case_type: "refund" as CustomerServiceDeskCase["case_type"] })] }))
      .toThrow(/نوع الحالة/);
  });

  it("rejects an out-of-range or fractional escalation level", () => {
    expect(() => project({ items: [queueCase({ escalation_level: 11 })] })).toThrow(/مستوى تصعيد/);
    expect(() => project({ items: [queueCase({ escalation_level: 1.5 })] })).toThrow(/مستوى تصعيد/);
  });

  it("rejects malformed filters, dates and unsafe server summary counters", () => {
    expect(() => project({
      filters: { ...filters, assignment: "unknown" as CustomerServiceDeskFilters["assignment"] },
    })).toThrow(/مرشح الإسناد/);
    expect(() => project({
      filters: { ...filters, search: "x".repeat(161) },
    })).toThrow(/البحث/);
    expect(() => project({ generatedAt: "not-a-date" })).toThrow(/وقت استخراج التقرير/);
    expect(() => project({
      summary: { ...summary, open_count: Number.MAX_SAFE_INTEGER + 1 },
    })).toThrow(/الحالات المفتوحة/);
    expect(() => project({
      summary: { ...summary, urgent_count: -1 },
    })).toThrow(/الحالات العاجلة/);
  });


  it("writes formula-looking customer text as inline text, not an Excel formula", () => {
    const document = project({
      items: [queueCase({ subject: '=HYPERLINK("https://invalid.example","open")' })],
    });
    const bytes = buildCustomerServiceDeskWorkbookXlsx(document);
    const workbook = new TextDecoder().decode(bytes);
    expect(workbook).toContain('t="inlineStr"');
    expect(workbook).toContain('=HYPERLINK("https://invalid.example","open")');
    expect(workbook).not.toMatch(/<f(?:\s|>)/);
    expect(workbook).toContain("نطاق التقرير");
    expect(workbook).toContain("مؤشرات المؤسسة");
    expect(workbook).toContain("حالات الصفحة المحملة");
    expect(workbook).not.toContain("PRIVATE-DESCRIPTION-MUST-NOT-EXPORT");
    expect(workbook).not.toContain(CASE_ID);
    expect(workbook).toContain("توجد صفحات أخرى غير محمّلة");
  });
});
