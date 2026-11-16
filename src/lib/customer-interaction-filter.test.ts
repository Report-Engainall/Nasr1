import { describe, expect, it } from "vitest";
import type { CustomerInteraction } from "@/lib/types";
import { filterCustomerInteractions } from "./customer-interaction-filter";

function makeInteraction(
  overrides: Partial<CustomerInteraction> = {},
): CustomerInteraction {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    interaction_type: "call",
    subject: "متابعة طلب التوريد",
    details: "تم الاتصال بالعميل بخصوص الكمية 123 وتاريخ التسليم.",
    interaction_at: "2026-11-10T10:00:00.000Z",
    next_follow_up_at: "2026-11-18T10:00:00.000Z",
    created_at: "2026-11-10T10:05:00.000Z",
    recorded_by_name: "نصر الأغبري",
    follow_up_task_id: "22222222-2222-4222-8222-222222222222",
    follow_up_due_at: "2026-11-18T10:00:00.000Z",
    follow_up_status: "pending",
    follow_up_cancellation_reason: null,
    follow_up_updated_at: null,
    ...overrides,
  };
}

const items = [
  makeInteraction(),
  makeInteraction({
    id: "33333333-3333-4333-8333-333333333333",
    interaction_type: "whatsapp",
    subject: "تأكيد موعد التسليم",
    details: "أرسل العميل تأكيداً عبر واتساب.",
    interaction_at: "2026-11-11T12:00:00.000Z",
    created_at: "2026-11-11T12:01:00.000Z",
    recorded_by_name: "مريم",
    follow_up_status: "in_progress",
  }),
  makeInteraction({
    id: "44444444-4444-4444-8444-444444444444",
    interaction_type: "note",
    subject: "مراجعة داخلية",
    details: "تم إغلاق المتابعة بعد توثيق النتيجة.",
    interaction_at: "2026-11-12T08:00:00.000Z",
    created_at: "2026-11-12T08:01:00.000Z",
    recorded_by_name: "مدير المبيعات",
    next_follow_up_at: null,
    follow_up_task_id: null,
    follow_up_due_at: null,
    follow_up_status: "completed",
  }),
  makeInteraction({
    id: "55555555-5555-4555-8555-555555555555",
    interaction_type: "email",
    subject: "إلغاء مهمة متابعة",
    details: "ألغيت المهمة مع تسجيل السبب.",
    interaction_at: "2026-11-13T09:00:00.000Z",
    created_at: "2026-11-13T09:01:00.000Z",
    recorded_by_name: "مريم",
    follow_up_status: "cancelled",
    follow_up_cancellation_reason: "تغيير موعد التوريد",
  }),
];

describe("filterCustomerInteractions", () => {
  it("searches subject, details and recorder with Arabic harakat and localized digits normalized", () => {
    expect(filterCustomerInteractions({
      items,
      search: "مُتابَعة ١٢٣",
      type: "all",
      followUp: "all",
    }).items).toEqual([items[0]]);

    expect(filterCustomerInteractions({
      items,
      search: "مدير المبيعات",
      type: "all",
      followUp: "all",
    }).items).toEqual([items[2]]);
  });

  it("matches exact interaction type and combines it with open follow-up states", () => {
    const result = filterCustomerInteractions({
      items,
      search: "",
      type: "whatsapp",
      followUp: "open",
    });
    expect(result.items).toEqual([items[1]]);
    expect(result.active).toBe(true);
  });

  it("filters completed, cancelled and unscheduled interactions independently", () => {
    expect(filterCustomerInteractions({
      items, search: "", type: "all", followUp: "completed",
    }).items).toEqual([items[2]]);
    expect(filterCustomerInteractions({
      items, search: "", type: "all", followUp: "cancelled",
    }).items).toEqual([items[3]]);
    expect(filterCustomerInteractions({
      items, search: "", type: "all", followUp: "not_scheduled",
    }).items).toEqual([items[2]]);
  });

  it("searches the recorded cancellation reason and follow-up status labels", () => {
    expect(filterCustomerInteractions({
      items, search: "تغيير موعد التوريد", type: "all", followUp: "all",
    }).items).toEqual([items[3]]);
    expect(filterCustomerInteractions({
      items, search: "قيد التنفيذ", type: "all", followUp: "all",
    }).items).toEqual([items[1]]);
  });

  it("distinguishes no active filters from an active filter with no matches", () => {
    const all = filterCustomerInteractions({ items, search: " ", type: "all", followUp: "all" });
    const none = filterCustomerInteractions({ items, search: "غير موجود", type: "all", followUp: "all" });
    expect(all.items).toEqual(items);
    expect(all.active).toBe(false);
    expect(none.items).toEqual([]);
    expect(none.active).toBe(true);
  });

  it("preserves the source rows and their order for print/export projections", () => {
    const snapshot = structuredClone(items);
    const filtered = filterCustomerInteractions({
      items, search: "طلب", type: "all", followUp: "all",
    });
    expect(filtered.items).toEqual([items[0]]);
    expect(items).toEqual(snapshot);
  });
});
