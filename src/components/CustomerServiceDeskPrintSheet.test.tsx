// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CustomerServiceDeskPrintSheet } from "./CustomerServiceDeskPrintSheet";
import type { CustomerServiceDeskPrintDocument } from "@/lib/customer-service-desk-print";

const report: CustomerServiceDeskPrintDocument = {
  generatedAt: "2026-11-13T09:00:00.000Z",
  filters: {
    status: "الحالات النشطة",
    priority: "كل الأولويات",
    assignment: "جميع الحالات",
    overdueOnly: false,
    search: "",
  },
  fullOpenSummary: {
    open_count: 12,
    response_overdue_count: 2,
    resolution_overdue_count: 1,
    unassigned_count: 3,
    urgent_count: 2,
    high_count: 4,
  },
  loadedCount: 1,
  hasMore: true,
  cases: [{
    caseCode: "CS-2026-001",
    customerName: "عميل اختبار",
    customerCode: "C-001",
    subject: "تأخر تسليم الطلب",
    caseType: "شكوى",
    priority: "عاجلة",
    status: "مفتوحة",
    createdAt: "2026-11-13T07:00:00.000Z",
    updatedAt: "2026-11-13T07:30:00.000Z",
    responseDueAt: "2026-11-13T08:00:00.000Z",
    firstResponseAt: null,
    responseOverdue: true,
    resolutionDueAt: "2026-11-13T08:30:00.000Z",
    resolutionOverdue: true,
    escalationLevel: 2,
    assignedToName: "مسؤول الخدمة",
    taskDueAt: "2026-11-13T10:00:00.000Z",
    hasLinkedTask: true,
  }],
};

describe("CustomerServiceDeskPrintSheet", () => {
  it("renders an Arabic RTL report and warns when more filtered rows are not loaded", () => {
    render(<CustomerServiceDeskPrintSheet document={report} />);
    const sheet = screen.getByTestId("customer-service-desk-print-document");
    expect(sheet.getAttribute("dir")).toBe("rtl");
    expect(sheet.getAttribute("lang")).toBe("ar");
    expect(screen.getByText("توجد صفحات أخرى غير محمّلة؛ لا يمثل هذا التقرير كامل نتائج الطابور."))
      .not.toBeNull();
    expect(screen.getByText("مؤشرات المؤسسة — جميع الحالات المفتوحة")).not.toBeNull();
    expect(screen.getByText("تفاصيل الحالات ضمن الصفحات المحمّلة")).not.toBeNull();
  });

  it("does not show the continuation warning after the loaded queue is complete", () => {
    render(<CustomerServiceDeskPrintSheet document={{ ...report, hasMore: false }} />);
    const sheet = screen.getByTestId("customer-service-desk-print-document");
    expect(sheet.textContent ?? "").not.toContain("توجد صفحات أخرى غير محمّلة؛ لا يمثل هذا التقرير كامل نتائج الطابور.");
  });
});
