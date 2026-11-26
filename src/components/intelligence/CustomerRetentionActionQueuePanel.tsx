import type { CustomerRetentionActionQueue } from "@/lib/intelligence/customer-retention";

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

      {queue.actions.length === 0 ? (
        <p role="status" className="rounded-lg border p-3 text-sm">لا توجد إجراءات متابعة موصى بها في هذه اللقطة الموثقة.</p>
      ) : (
        <div className="space-y-2">
          {queue.actions.map(action => (
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

      {queue.omittedCount > 0
        ? <p className="text-xs text-muted-foreground">إجراءات أخرى خارج حد العرض: {queue.omittedCount}</p>
        : null}
      {queue.withheldCustomerCount > 0
        ? <p className="text-xs text-muted-foreground">سجلات لم تستوفِ شروط التوصية: {queue.withheldCustomerCount}</p>
        : null}
      <p className="text-xs text-muted-foreground">هذه توصيات للمراجعة والتنفيذ البشري؛ لا ترسل رسائل للعملاء ولا تنشئ خصومات أو مهاماً تلقائياً. لا يعرض هذا المركز أسماء العملاء أو هواتفهم أو أرصدتهم أو أسعار فئاتهم.</p>
    </section>
  );
}
