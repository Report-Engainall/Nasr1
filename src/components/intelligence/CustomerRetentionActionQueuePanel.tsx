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
export type CustomerRetentionRecencyFilter =
  | "ALL" | "0_30" | "31_60" | "61_90" | "OVER_90" | "UNKNOWN";

export interface CustomerRetentionRecencySummary {
  within30Days: number;
  days31To60: number;
  days61To90: number;
  over90Days: number;
  unknownAge: number;
}

function validDaysSinceLastOrder(value: number | null): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function matchesCustomerRetentionRecency(
  action: CustomerRetentionAction,
  filter: CustomerRetentionRecencyFilter,
): boolean {
  if (filter === "ALL") return true;
  const days = validDaysSinceLastOrder(action.daysSinceLastOrder);
  if (filter === "UNKNOWN") return days === null;
  if (days === null) return false;
  if (filter === "0_30") return days <= 30;
  if (filter === "31_60") return days >= 31 && days <= 60;
  if (filter === "61_90") return days >= 61 && days <= 90;
  return days > 90;
}

export function summarizeCustomerRetentionRecency(
  actions: CustomerRetentionAction[],
): CustomerRetentionRecencySummary {
  const summary: CustomerRetentionRecencySummary = {
    within30Days: 0,
    days31To60: 0,
    days61To90: 0,
    over90Days: 0,
    unknownAge: 0,
  };
  for (const action of actions) {
    const days = validDaysSinceLastOrder(action.daysSinceLastOrder);
    if (days === null) summary.unknownAge += 1;
    else if (days <= 30) summary.within30Days += 1;
    else if (days <= 60) summary.days31To60 += 1;
    else if (days <= 90) summary.days61To90 += 1;
    else summary.over90Days += 1;
  }
  return summary;
}

function daysSinceLastOrderLabel(value: number | null): string {
  const days = validDaysSinceLastOrder(value);
  return days === null ? "مدة الانقطاع غير موثقة" : "منذ " + days + " يوماً";
}

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
  recency: CustomerRetentionRecencyFilter = "ALL",
): CustomerRetentionAction[] {
  const normalizedQuery = normalizeCustomerRetentionSearch(query);
  const rank: Record<CustomerRetentionActionPriority, number> = { HIGH: 0, MEDIUM: 1, REVIEW: 2 };
  return actions
    .filter(item => priority === "ALL" || item.priority === priority)
    .filter(item => kind === "ALL" || item.action === kind)
    .filter(item => matchesCustomerRetentionRecency(item, recency))
    .filter(item => !normalizedQuery || normalizeCustomerRetentionSearch([
      item.customerRef,
      item.reason,
      item.activity,
      item.action,
      item.priority,
      item.lastOrderAt ?? "",
      validDaysSinceLastOrder(item.daysSinceLastOrder) ?? "",
    ].join(" ")).includes(normalizedQuery))
    .sort((left, right) =>
      rank[left.priority] - rank[right.priority] ||
      (validDaysSinceLastOrder(right.daysSinceLastOrder) ?? -1) -
        (validDaysSinceLastOrder(left.daysSinceLastOrder) ?? -1) ||
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

function customerRetentionCsvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  const protectedText = /^[\s\u0000-\u001F]*[=+\-@]/.test(text) ? "'" + text : text;
  return "\"" + protectedText.replace(/"/g, '""') + "\"";
}

/** Exports only the supplied filtered queue and keeps customer references masked. */
export function buildCustomerRetentionActionsCsv(input: {
  actions: CustomerRetentionAction[];
  loadedCount: number;
  totalActionable: number;
  omittedCount: number;
  withheldCustomerCount: number;
}): string {
  if (!input || !Array.isArray(input.actions) ||
      ![input.loadedCount, input.totalActionable, input.omittedCount, input.withheldCustomerCount]
        .every(value => Number.isSafeInteger(value) && value >= 0) ||
      input.totalActionable < input.loadedCount) {
    throw new Error("customer_retention_export_invalid");
  }
  const coverageNotice =
    "تصدير " + input.actions.length + " إجراء بعد التصفية؛ " +
    input.loadedCount + " إجراء محمّل من " + input.totalActionable +
    " إجمالي مؤهل؛ خارج حد المصدر " + input.omittedCount +
    "؛ سجلات محجوبة عن التوصية " + input.withheldCustomerCount +
    ". لا يعني التصدير اكتمال مجتمع العملاء.";
  const headers = [
    "customer_reference_masked", "priority", "action", "activity", "reason",
    "last_order_at", "days_since_last_order", "order_count_current",
    "order_count_previous", "evidence_count", "evidence_ids", "metric_ids",
    "metric_keys", "formula_versions", "coverage_notice",
  ];
  const rows = input.actions.map(action => [
    customerReference(action.customerRef),
    action.priority,
    action.action,
    action.activity,
    action.reason,
    action.lastOrderAt,
    action.daysSinceLastOrder,
    action.orderCountCurrent,
    action.orderCountPrevious,
    action.evidenceIds.length,
    action.evidenceIds.join(";"),
    action.metricIds.join(";"),
    action.metricKeys.join(";"),
    action.formulaVersions.join(";"),
    coverageNotice,
  ].map(customerRetentionCsvCell).join(","));
  return "\uFEFF" + [headers.map(customerRetentionCsvCell).join(","), ...rows].join("\r\n");
}

export interface CustomerRetentionActionQueuePanelProps {
  queue: CustomerRetentionActionQueue | null;
  loading: boolean;
  canCreateDecision?: boolean;
  onCreateDecisionProposal?: (action: CustomerRetentionAction) => Promise<boolean>;
}

export function CustomerRetentionActionQueuePanel({
  queue,
  loading,
  canCreateDecision = false,
  onCreateDecisionProposal,
}: CustomerRetentionActionQueuePanelProps) {
  const [busyCustomerRef, setBusyCustomerRef] = useState<string | null>(null);
  const [decisionMessages, setDecisionMessages] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<CustomerRetentionPriorityFilter>("ALL");
  const [actionFilter, setActionFilter] = useState<CustomerRetentionKindFilter>("ALL");
  const [recencyFilter, setRecencyFilter] = useState<CustomerRetentionRecencyFilter>("ALL");
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
  const recencySummary = summarizeCustomerRetentionRecency(queue.actions);

  const filteredActions = filterCustomerRetentionActions(
    queue.actions, searchText, priorityFilter, actionFilter, recencyFilter,
  );
  const pageView = paginateCustomerRetentionActions(filteredActions, page);
  async function createCustomerDecision(action: CustomerRetentionAction) {
    if (!queue || queue.status !== "VERIFIED" || queue.withheldCustomerCount !== 0 ||
        !canCreateDecision || !onCreateDecisionProposal || busyCustomerRef !== null) return;
    setBusyCustomerRef(action.customerRef);
    setDecisionMessages(current => ({ ...current, [action.customerRef]: "" }));
    try {
      const saved = await onCreateDecisionProposal(action);
      setDecisionMessages(current => ({
        ...current,
        [action.customerRef]: saved
          ? "حُفظ قرار متابعة العميل بالخادم مع أدلته وأولويته؛ لم يُعتمد أو يُنفذ تلقائياً."
          : "لم يتم تأكيد حفظ القرار؛ راجع نتيجة دورة القرارات قبل إعادة المحاولة.",
      }));
    } catch {
      setDecisionMessages(current => ({
        ...current,
        [action.customerRef]: "تعذر تأكيد حفظ القرار؛ راجع سجل دورة القرارات قبل إعادة المحاولة.",
      }));
    } finally {
      setBusyCustomerRef(null);
    }
  }
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
  const recencyOptions: Array<{ value: CustomerRetentionRecencyFilter; label: string }> = [
    { value: "ALL", label: "كل مدد الانقطاع" },
    { value: "0_30", label: "0–30 يوماً" },
    { value: "31_60", label: "31–60 يوماً" },
    { value: "61_90", label: "61–90 يوماً" },
    { value: "OVER_90", label: "أكثر من 90 يوماً" },
    { value: "UNKNOWN", label: "مدة غير موثقة" },
  ];
  function exportFilteredActions(){
    if (!filteredActions.length) return;
    const csv = buildCustomerRetentionActionsCsv({
      actions: filteredActions,
      loadedCount: queue.actions.length,
      totalActionable: queue.totalActionable,
      omittedCount: queue.omittedCount,
      withheldCustomerCount: queue.withheldCustomerCount,
    });
    const url = window.URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "customer-retention-actions.csv";
    anchor.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  }


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
        <section className="space-y-2" aria-label="شرائح مدة الانقطاع عن الشراء">
          <p className="text-xs text-muted-foreground">التقسيم حسب عدد الأيام منذ آخر طلب؛ هذه شرائح تشغيلية وليست توقعاً مؤكداً لفقدان العميل.</p>
          <p className="text-xs text-muted-foreground" role="status">
            العدّادات محسوبة من {queue.actions.length} إجراء محمّل من أصل {queue.totalActionable} إجراء مؤهل.
            {queue.omittedCount > 0 ? " ما زال " + queue.omittedCount + " إجراء خارج الجزء المحمّل؛ لا تمثل الأعداد كامل القائمة." : " لا توجد إجراءات مؤهلة محذوفة من هذه اللقطة."}
            {queue.withheldCustomerCount > 0 ? " عدد العملاء المحجوبين عن التوصية: " + queue.withheldCustomerCount + "." : ""}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            <button type="button" aria-label="عرض العملاء الذين طلبوا خلال 30 يوماً" aria-pressed={recencyFilter === "0_30"}
              onClick={() => { setSearchText(""); setPriorityFilter("ALL"); setActionFilter("ALL"); setRecencyFilter(recencyFilter === "0_30" ? "ALL" : "0_30"); setPage(0); }}
              className="rounded-lg border p-2 text-start hover:bg-muted/50"><span className="block text-xs text-muted-foreground">0–30 يوماً</span><strong className="text-lg tabular-nums">{recencySummary.within30Days}</strong></button>
            <button type="button" aria-label="عرض العملاء المنقطعين من 31 إلى 60 يوماً" aria-pressed={recencyFilter === "31_60"}
              onClick={() => { setSearchText(""); setPriorityFilter("ALL"); setActionFilter("ALL"); setRecencyFilter(recencyFilter === "31_60" ? "ALL" : "31_60"); setPage(0); }}
              className="rounded-lg border p-2 text-start hover:bg-muted/50"><span className="block text-xs text-muted-foreground">31–60 يوماً</span><strong className="text-lg tabular-nums">{recencySummary.days31To60}</strong></button>
            <button type="button" aria-label="عرض العملاء المنقطعين من 61 إلى 90 يوماً" aria-pressed={recencyFilter === "61_90"}
              onClick={() => { setSearchText(""); setPriorityFilter("ALL"); setActionFilter("ALL"); setRecencyFilter(recencyFilter === "61_90" ? "ALL" : "61_90"); setPage(0); }}
              className="rounded-lg border p-2 text-start hover:bg-muted/50"><span className="block text-xs text-muted-foreground">61–90 يوماً</span><strong className="text-lg tabular-nums">{recencySummary.days61To90}</strong></button>
            <button type="button" aria-label="عرض العملاء المنقطعين لأكثر من 90 يوماً" aria-pressed={recencyFilter === "OVER_90"}
              onClick={() => { setSearchText(""); setPriorityFilter("ALL"); setActionFilter("ALL"); setRecencyFilter(recencyFilter === "OVER_90" ? "ALL" : "OVER_90"); setPage(0); }}
              className="rounded-lg border p-2 text-start hover:bg-muted/50"><span className="block text-xs text-muted-foreground">أكثر من 90 يوماً</span><strong className="text-lg tabular-nums">{recencySummary.over90Days}</strong></button>
            <button type="button" aria-label="عرض العملاء بمدة انقطاع غير موثقة" aria-pressed={recencyFilter === "UNKNOWN"}
              onClick={() => { setSearchText(""); setPriorityFilter("ALL"); setActionFilter("ALL"); setRecencyFilter(recencyFilter === "UNKNOWN" ? "ALL" : "UNKNOWN"); setPage(0); }}
              className="rounded-lg border p-2 text-start hover:bg-muted/50"><span className="block text-xs text-muted-foreground">مدة غير موثقة</span><strong className="text-lg tabular-nums">{recencySummary.unknownAge}</strong></button>
          </div>
        </section>
      ) : null}

      {queue.actions.length > 0 ? (
        <section className="space-y-3 rounded-lg border p-3" aria-label="تصفية إجراءات متابعة العملاء">
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
            <label className="space-y-1 text-sm">
              <span className="block">مدة الانقطاع عن الشراء</span>
              <select
                aria-label="تصفية مدة الانقطاع عن الشراء"
                value={recencyFilter}
                onChange={event => { setRecencyFilter(event.target.value as CustomerRetentionRecencyFilter); setPage(0); }}
                className="w-full rounded-lg border bg-background px-3 py-2"
              >
                {recencyOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>يعرض {filteredActions.length} من {queue.actions.length} إجراء محمّل · إجمالي الإجراءات المؤهلة: {queue.totalActionable}</span>
            <button
              type="button"
              className="rounded-lg border px-3 py-2"
              disabled={!searchText && priorityFilter === "ALL" && actionFilter === "ALL" && recencyFilter === "ALL"}
              onClick={() => { setSearchText(""); setPriorityFilter("ALL"); setActionFilter("ALL"); setRecencyFilter("ALL"); setPage(0); }}
            >
              مسح التصفية
            </button>
            {filteredActions.length > 0 ? (
              <button type="button" className="rounded-lg border px-3 py-2" onClick={exportFilteredActions}>
                تصدير الإجراءات المفلترة CSV ({filteredActions.length})
              </button>
            ) : null}
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
                <span>آخر طلب: {dateLabel(action.lastOrderAt)} · {daysSinceLastOrderLabel(action.daysSinceLastOrder)}</span>
                <span>طلبات الفترة الحالية: {action.orderCountCurrent}</span>
                <span>طلبات الفترة السابقة: {action.orderCountPrevious}</span>
                <span>أدلة مرتبطة: {action.evidenceIds.length}</span>
              </div>
              {canCreateDecision && onCreateDecisionProposal ? (
                <div className="mt-3 border-t pt-3">
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40"
                    disabled={busyCustomerRef !== null || queue.status !== "VERIFIED" || !queue.asOf}
                    onClick={() => void createCustomerDecision(action)}
                  >
                    {busyCustomerRef === action.customerRef ? "جارٍ حفظ قرار المتابعة…" : "حفظ كقرار إداري للمتابعة"}
                  </button>
                  {decisionMessages[action.customerRef] ? (
                    <p role="status" className="mt-2 text-xs text-muted-foreground">{decisionMessages[action.customerRef]}</p>
                  ) : null}
                </div>
              ) : null}
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
