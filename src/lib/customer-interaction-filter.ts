import type { CustomerInteraction, CustomerInteractionType } from "@/lib/types";

export type CustomerInteractionTypeFilter = "all" | CustomerInteractionType;
export type CustomerInteractionFollowUpFilter =
  | "all"
  | "open"
  | "completed"
  | "cancelled"
  | "not_scheduled";

export type CustomerInteractionFilterInput = {
  items: readonly CustomerInteraction[];
  search: string;
  type: CustomerInteractionTypeFilter;
  followUp: CustomerInteractionFollowUpFilter;
};

export type CustomerInteractionFilterResult = {
  items: CustomerInteraction[];
  active: boolean;
};

const TYPE_LABELS: Record<CustomerInteractionType, string> = {
  call: "اتصال هاتفي",
  visit: "زيارة",
  whatsapp: "واتساب",
  email: "بريد إلكتروني",
  meeting: "اجتماع",
  note: "ملاحظة داخلية",
  other: "أخرى",
};

const FOLLOW_UP_LABELS: Record<string, string> = {
  pending: "مفتوحة",
  in_progress: "قيد التنفيذ",
  completed: "مكتملة",
  cancelled: "ملغاة",
};

const ARABIC_MARKS = /[\u064B-\u065F\u0670\u0640]/g;

export function normalizeCustomerInteractionSearch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(ARABIC_MARKS, "")
    .replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (digit) => {
      const code = digit.charCodeAt(0);
      return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
    })
    .toLocaleLowerCase("ar-YE")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesFollowUp(
  item: CustomerInteraction,
  filter: CustomerInteractionFollowUpFilter,
): boolean {
  switch (filter) {
    case "all":
      return true;
    case "open":
      return item.follow_up_status === "pending" || item.follow_up_status === "in_progress";
    case "completed":
      return item.follow_up_status === "completed";
    case "cancelled":
      return item.follow_up_status === "cancelled";
    case "not_scheduled":
      return item.next_follow_up_at === null;
  }
}

export function filterCustomerInteractions(
  input: CustomerInteractionFilterInput,
): CustomerInteractionFilterResult {
  const term = normalizeCustomerInteractionSearch(input.search);
  const active = term.length > 0 || input.type !== "all" || input.followUp !== "all";

  const items = input.items.filter((item) => {
    if (input.type !== "all" && item.interaction_type !== input.type) return false;
    if (!matchesFollowUp(item, input.followUp)) return false;
    if (!term) return true;

    const searchable = [
      item.subject,
      item.details,
      item.recorded_by_name,
      item.interaction_type,
      TYPE_LABELS[item.interaction_type],
      item.interaction_at,
      item.interaction_at.slice(0, 10),
      item.created_at,
      item.created_at.slice(0, 10),
      item.next_follow_up_at ?? "",
      item.follow_up_due_at ?? "",
      item.follow_up_cancellation_reason ?? "",
      item.follow_up_status ? FOLLOW_UP_LABELS[item.follow_up_status] ?? item.follow_up_status : "",
    ].map(normalizeCustomerInteractionSearch);

    const searchTerms = term.split(" ").filter(Boolean);
    return searchTerms.every((searchTerm) =>
      searchable.some((value) => value.includes(searchTerm)),
    );
  });

  return { items, active };
}
