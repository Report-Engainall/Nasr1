import { useState } from "react";
import type {
  CustomerRetentionAction,
  CustomerRetentionActionKind,
  CustomerRetentionActionPriority,
  CustomerRetentionActionQueue,
} from "@/lib/intelligence/customer-retention";

const priorityLabels = {
  HIGH: "أولوية مرتفعة",
  MEDIUM: "أولوية متوسطة",
  REVIEW: "مراجعة البيانات",
} as const;

const actionLabels = {
  REACTIVATE: "إعادة تنشيط العميل",
  PREVENT_CHURN: "منع فقدان العميل",
  REENGAGE: "إعادة التفاعل",
  VERIFY_ORDER_HISTORY: "مراجعة سجل الطلبات",
} as const;

export type CustomerRetentionPriorityFilter = "ALL" | CustomerRetentionActionPriority;
export type CustomerRetentionKindFilter = "ALL" | CustomerRetentionActionKind;

export function normalizeCustomerRetentionSearch(value: string): string {
  return value.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLocaleLowerCase("ar")
    .trim()
    .replace(/\s+/g, " ");
}

export function filterCustomerRetentionActions(
  actions: CustomerRetentionAction[],
  query: string,
  priority: CustomerRetentionPriorityFilter,
  kind: CustomerRetentionKindFilter,
): CustomerRetentionAction[] {
  const normalizedQuery = normalizeCustomerRetentionSearch(query);
  const rank: Record<CustomerRetentionActionPriority, number> = { HIGH: 0, MEDIUM: 1, REVIEW: 2 };
  return actions
    .filter(item => priority === "ALL" || item.priority === priority)
    .filter(item => kind === "ALL" || item.action === kind)
    .filter(item => !normalizedQuery || normalizeCustomerRetentionSearch([
      item.customerRef,
      item.reason,
      item.activity,
      item.action,
      item.priority,
      item.lastOrderAt ?? "",
    ].join(" ")).includes(normalizedQuery))
    .sort((left, right) =>
      rank[left.priority] - rank[right.priority] ||
      (right.daysSinceLastOrder ?? -1) - (left.daysSinceLastOrder ?? -1) ||
      left.customerRef.localeCompare(right.customerRef),
    );
}

export function paginateCustomerRetentionActions(
  actions: CustomerRetentionAction[],
  requestedPage: number,
  pageSize = 10,
): { items: CustomerRetentionAction[]; page: number; pageCount: number } {
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 10;
  const pageCount = Math.max(1, Math.ceil(actions.length / safePageSize));
  const page = Math.min(
    Number.isFinite(requestedPage) ? Math.max(0, Math.floor(requestedPage)) : 0,
    pageCount - 1,
  );
  return {
    items: actions.slice(page * safePageSize, (page + 1) * safePageSize),
    page,
    pageCount,
  };
}

function dateLabel(value: string | null): string {
  if (!value) return "غير متاح";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime())
    ? parsed.toLocaleDateString("ar-YE", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" })
    : "غير متاح";
}

function customerReference(value: string): string {
  return value.length > 14 ? value.slice(0, 7) + "…" + value.slice(-4) : value;
}

export interface CustomerRetentionActionQueuePanelProps {
  queue: CustomerRetentionActionQueue | null;
  loading: boolean;
}

export function CustomerRetentionActionQueuePanel({
  queue,
  loading,
}: CustomerRetentionActionQueuePanelProps) {
  const [searchText, setSearchText] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<CustomerRetentionPriorityFilter>("ALL");
  const [actionFilter, setActionFilter] = useState<CustomerRetentionKindFilter>("ALL");
  const [page, setPage] = useState(0);

  if (loading) {
    return <section className="rounded-xl border p-4" aria-label="قائمة متابعة العملاء">
      <h3 className="font-semibold">إجراءات متابعة العملاء</h3>
      <p role="status" className="mt-2 text-sm text-muted-foreground">جارٍ تجهيز قائمة الإجراءات من لقطة العملاء...</p>
    </section>;
  }

  if (!queue) {
    return <section className="rounded-xl border p-4" aria-label="قائمة متابعة العملاء">
      <h3 className="font-semibold">إجراءات متابعة العملاء</h3>
      <p role="status" className="mt-2 text-sm text-muted-foreground">قائمة الإجراءات غير متاحة من المصدر الحالي.</p>
    </section>;
  }

  if (queue.status !== "VERIFIED") {
    return <section className="rounded-xl border p-4" aria-label="قائمة متابعة العملاء">
      <h3 className="font-semibold">إجراءات متابعة العملاء</h3>
      <p role="status" className="mt-2 text-sm">حُجبت الإجراءات لأن تغطية مجتمع العملاء أو أدلته تحتاج إلى مراجعة.</p>
      {queue.withheldCustomerCount > 0
        ? <p className="mt-1 text-xs text-muted-foreground">عملاء محجوبون عن التوصية: {queue.withheldCustomerCount}</p>
        : null}
      {queue.warnings.length > 0
        ? <p className="mt-1 text-xs text-muted-foreground">تنبيهات التغطية: {queue.warnings.join("، ")}</p>
        : null}
    </section>;
  }

  const high = queue.actions.filter(item => item.priority === "HIGH").length;
  const medium = queue.actions.filter(item => item.priority === "MEDIUM").length;
  const review = queue.actions.filter(item => item.priority === "REVIEW").length;

  const filteredActions = filterCustomerRetentionActions(
    queue.actions, searchText, priorityFilter, actionFilter,
  );
  const pageView = paginateCustomerRetentionActions(filteredActions, page);
  const priorityOptions: Array<{ value: CustomerRetentionPriorityFilter; label: string }> = [
    { value: "ALL", label: "كل الأولويات" },
    { value: "HIGH", label: "مرتفعة" },
    { value: "MEDIUM", label: "متوسطة" },
    { value: "REVIEW", label: "مراجعة البيانات" },
  ];
  const actionOptions: Array<{ value: CustomerRetentionKindFilter; label: string }> = [
    { value: "ALL", label: "كل الإجراءات" },
    { value: "REACTIVATE", label: actionLabels.REACTIVATE },
    { value: "PREVENT_CHURN", label: actionLabels.PREVENT_CHURN },
    { value: "REENGAGE", label: actionLabels.REENGAGE },
    { value: "VERIFY_ORDER_HISTORY", label: actionLabels.VERIFY_ORDER_HISTORY },
  ];

  return (
    <section dir="rtl" className="space-y-3 rounded-xl border p-4" aria-label="قائمة متابعة العملاء">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">إجراءات متابعة العملاء</h3>
          <p className="text-xs text-muted-foreground">توصيات مبنية على حداثة الطلبات وسجل الفترتين، وليست قياساً لقيمة العميل.</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs">تغطية موثقة</span>
      </header>

      <div className="grid grid-cols-3 gap-2 text-center">
        <article className="rounded-lg border p-2">
          <strong className="block text-lg tabular-nums">{high}</strong>
          <span className="text-xs text-muted-foreground">مرتفعة</span>
        </article>
        <article className="rounded-lg border p-2">
          <strong className="block text-lg tabular-nums">{medium}</strong>
          <span className="text-xs text-muted-foreground">متوسطة</span>
        </article>
        <article className="rounded-lg border p-2">
          <strong className="block text-lg tabular-nums">{review}</strong>
          <span className="text-xs text-muted-foreground">مراجعة</span>
        </article>
      </div>

      {queue.actions.length > 0 ? (
        <section className="space-y-3 rounded-lg border p-3" aria-label="تصفية إجراءات متابعة العملاء">
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="block">البحث في المرجع أو سبب التوصية</span>
              <input
                type="search"
                aria-label="البحث في إجراءات متابعة العملاء"
                value={searchText}
                onChange={event => { setSearchText(event.target.value); setPage(0); }}
                placeholder="اكتب مرجع العميل أو سبب الإجراء..."
                className="w-full rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">الأولوية</span>
              <select
                aria-label="تصفية أولوية متابعة العملاء"
                value={priorityFilter}
                onChange={event => { setPriorityFilter(event.target.value as CustomerRetentionPriorityFilter); setPage(0); }}
                className="w-full rounded-lg border bg-background px-3 py-2"
              >
                {priorityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">الإجراء المقترح</span>
              <select
                aria-label="تصفية نوع متابعة العملاء"
                value={actionFilter}
                onChange={event => { setActionFilter(event.target.value as CustomerRetentionKindFilter); setPage(0); }}
                className="w-full rounded-lg border bg-background px-3 py-2"
              >
                {actionOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>يعرض {filteredActions.length} من {queue.actions.length} إجراء محمّل · إجمالي الإجراءات المؤهلة: {queue.totalActionable}</span>
            <button
              type="button"
              className="rounded-lg border px-3 py-2"
              disabled={!searchText && priorityFilter === "ALL" && actionFilter === "ALL"}
              onClick={() => { setSearchText(""); setPriorityFilter("ALL"); setActionFilter("ALL"); setPage(0); }}
            >
              مسح التصفية
            </button>
          </div>
        </section>
      ) : null}

      {queue.actions.length === 0 ? (
        <p role="status" className="rounded-lg border p-3 text-sm">لا توجد إجراءات متابعة موصى بها في هذه اللقطة الموثقة.</p>
      ) : filteredActions.length === 0 ? (
        <p role="status" className="rounded-lg border p-3 text-sm">لا توجد إجراءات تطابق البحث والتصفية الحالية.</p>
      ) : (
        <div className="space-y-2">
          {pageView.items.map(action => (
            <article key={action.customerRef} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong className="text-sm">{actionLabels[action.action]}</strong>
                <span className="rounded-full border px-2 py-1 text-xs">{priorityLabels[action.priority]}</span>
              </div>
              <p className="mt-2 text-sm">{action.reason}</p>
              <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                <span>مرجع العميل: <bdi dir="ltr">{customerReference(action.customerRef)}</bdi></span>
                <span>آخر طلب: {dateLabel(action.lastOrderAt)}{action.daysSinceLastOrder === null ? "" : " · منذ " + action.daysSinceLastOrder + " يوماً"}</span>
                <span>طلبات الفترة الحالية: {action.orderCountCurrent}</span>
                <span>طلبات الفترة السابقة: {action.orderCountPrevious}</span>
                <span>أدلة مرتبطة: {action.evidenceIds.length}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {pageView.pageCount > 1 ? (
        <nav className="flex items-center justify-center gap-3 rounded-lg border p-3" aria-label="صفحات إجراءات متابعة العملاء">
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
            disabled={pageView.page === 0}
            onClick={() => setPage(Math.max(0, pageView.page - 1))}
          >
            السابق
          </button>
          <span className="text-xs text-muted-foreground">الصفحة {pageView.page + 1} من {pageView.pageCount}</span>
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
            disabled={pageView.page >= pageView.pageCount - 1}
            onClick={() => setPage(Math.min(pageView.pageCount - 1, pageView.page + 1))}
          >
            التالي
          </button>
        </nav>
      ) : null}
      {queue.omittedCount > 0
        ? <p className="text-xs text-muted-foreground">إجراءات أخرى خارج حد المصدر المحمّل: {queue.omittedCount}</p>
        : null}
      {queue.withheldCustomerCount > 0
        ? <p className="text-xs text-muted-foreground">سجلات لم تستوفِ شروط التوصية: {queue.withheldCustomerCount}</p>
        : null}
      <p className="text-xs text-muted-foreground">هذه توصيات للمراجعة والتنفيذ البشري؛ لا ترسل رسائل للعملاء ولا تنشئ خصومات أو مهاماً تلقائياً. لا يعرض هذا المركز أسماء العملاء أو هواتفهم أو أرصدتهم أو أسعار فئاتهم.</p>
    </section>
  );
}
