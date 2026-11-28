import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import {
  fetchAdminRuntimeErrorEvents,
  transitionAdminRuntimeErrorEvent,
  type RuntimeErrorEvent,
  type RuntimeErrorStatus,
} from "@/lib/runtime-error-events";

const PAGE_SIZE = 50;
const statusLabels: Record<RuntimeErrorStatus, string> = {
  open: "مفتوح",
  acknowledged: "تم الإقرار",
  resolved: "تم الحل",
};
const kindLabels: Record<RuntimeErrorEvent["error_kind"], string> = {
  error: "خطأ عام",
  type_error: "خطأ نوع",
  reference_error: "مرجع غير معروف",
  syntax_error: "خطأ صياغة",
  range_error: "خارج النطاق",
  response_error: "استجابة HTTP",
  unknown_error: "خطأ غير مصنف",
};
const boundaryLabels: Record<RuntimeErrorEvent["boundary"], string> = {
  tanstack_root_error_component: "حدّ الصفحة الرئيسي",
  window_error: "خطأ نافذة المتصفح",
  unhandled_rejection: "رفض غير معالج",
  unknown: "مصدر غير محدد",
};

function dateText(value: string | null): string {
  if (!value) return "غير متاح";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("ar-YE", { dateStyle: "medium", timeStyle: "short" })
    : "تاريخ غير صالح";
}
function nextAction(status: RuntimeErrorStatus): "acknowledged" | "resolved" | null {
  if (status === "open") return "acknowledged";
  if (status === "acknowledged") return "resolved";
  return null;
}

export function ErrorLogScreen() {
  const [statusFilter, setStatusFilter] = useState<"all" | RuntimeErrorStatus>("open");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<RuntimeErrorEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState(false);
  const [refreshRevision, setRefreshRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError(false);
    setItems([]);
    void fetchAdminRuntimeErrorEvents({
      status: statusFilter === "all" ? null : statusFilter,
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }).then((snapshot) => {
      if (!active) return;
      setItems(snapshot.items);
      setTotal(snapshot.total);
      setReadAt(snapshot.read_at);
    }).catch(() => {
      if (!active) return;
      setItems([]);
      setTotal(0);
      setReadAt(null);
      setLoadError(true);
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [statusFilter, page, refreshRevision]);

  async function handleTransition(event: RuntimeErrorEvent) {
    const target = nextAction(event.status);
    if (!target || busyId) return;
    setBusyId(event.id);
    setActionError(false);
    try {
      await transitionAdminRuntimeErrorEvent(event.id, target);
      setRefreshRevision((value) => value + 1);
    } catch {
      setActionError(true);
    } finally {
      setBusyId(null);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canGoBack = page > 0;
  const canGoForward = page + 1 < pageCount;

  return (
    <section dir="rtl" aria-label="سجل الأخطاء" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <AlertTriangle size={22} className="mt-1 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold">سجل الأخطاء</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
              أحداث أخطاء المتصفح المسجلة للمؤسسة الحالية، مع إقرار المعالجة وتتبع الانتقال إلى الحل. الوصول للقراءة والمعالجة محصور بالمشرف والمدير.
            </p>
          </div>
        </div>
        <button type="button" onClick={() => setRefreshRevision((value) => value + 1)} disabled={loading || Boolean(busyId)}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "جارٍ التحديث…" : "تحديث السجل"}
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="runtime-error-status" className="text-sm font-medium">حالة المعالجة</label>
        <select id="runtime-error-status" value={statusFilter}
          onChange={(event) => { setPage(0); setStatusFilter(event.target.value as typeof statusFilter); }}
          className="min-h-10 rounded-lg border bg-background px-3 text-sm">
          <option value="open">المفتوحة</option>
          <option value="acknowledged">قيد المعالجة</option>
          <option value="resolved">المحلولة</option>
          <option value="all">كل الحالات</option>
        </select>
        <span className="text-xs text-muted-foreground">عدد النتائج من المصدر: {total}</span>
        {readAt && <span className="text-xs text-muted-foreground">آخر قراءة: {dateText(readAt)}</span>}
      </div>

      {actionError && (
        <p role="alert" className="rounded-lg border border-amber-300 p-3 text-sm">
          تعذر حفظ إجراء المعالجة. لم تُغيّر الواجهة الحالة محلياً؛ حدّث السجل للتحقق من الحالة المحفوظة.
        </p>
      )}
      {loading && <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">جارٍ تحميل سجل الأخطاء من الخادم…</p>}
      {loadError && !loading && (
        <div role="alert" className="rounded-lg border p-4">
          <p className="text-sm">تعذر قراءة سجل الأخطاء. قد تكون الصلاحية أو خدمة البيانات غير متاحة.</p>
          <button type="button" className="mt-3 rounded-lg border px-3 py-2 text-sm" onClick={() => setRefreshRevision((value) => value + 1)}>
            إعادة المحاولة
          </button>
        </div>
      )}
      {!loading && !loadError && items.length === 0 && (
        <div role="status" className="rounded-xl border border-dashed p-6 text-center">
          <CheckCircle2 className="mx-auto mb-2 text-muted-foreground" size={22} aria-hidden="true" />
          <p className="font-medium">لا توجد سجلات ضمن الحالة المحددة</p>
          <p className="mt-1 text-sm text-muted-foreground">تعرض الشاشة السجلات الفعلية فقط؛ لا تُنشأ أخطاء أو أوقات افتراضية.</p>
        </div>
      )}

      {!loading && !loadError && items.length > 0 && (
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[780px] text-sm">
            <thead className="bg-muted/50 text-right">
              <tr>
                <th scope="col" className="p-3">الحدث</th>
                <th scope="col" className="p-3">المصدر</th>
                <th scope="col" className="p-3">أول ظهور / آخر ظهور</th>
                <th scope="col" className="p-3">التكرار</th>
                <th scope="col" className="p-3">الحالة</th>
                <th scope="col" className="p-3">الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {items.map((event) => {
                const action = nextAction(event.status);
                return (
                  <tr key={event.id} className="border-t align-top">
                    <td className="p-3">
                      <div className="font-semibold">{kindLabels[event.error_kind]}</div>
                      <code dir="ltr" className="mt-1 block text-xs text-muted-foreground" title={event.id}>{event.id.slice(0, 8)}…</code>
                      {event.http_status !== null && <div className="mt-1 text-xs text-muted-foreground">HTTP {event.http_status}</div>}
                    </td>
                    <td className="p-3">
                      <div>{boundaryLabels[event.boundary]}</div>
                      <span className="mt-1 block text-xs text-muted-foreground">المتصفح</span>
                    </td>
                    <td className="p-3">
                      <div>{dateText(event.created_at)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">آخر تكرار: {dateText(event.last_seen_at)}</div>
                    </td>
                    <td className="p-3 tabular-nums">{event.occurrence_count}</td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs">
                        {event.status === "resolved" ? <ShieldCheck size={13} aria-hidden="true" /> : <Clock3 size={13} aria-hidden="true" />}
                        {statusLabels[event.status]}
                      </span>
                      {event.acknowledged_at && <div className="mt-1 text-xs text-muted-foreground">أُقرّ: {dateText(event.acknowledged_at)}</div>}
                      {event.resolved_at && <div className="mt-1 text-xs text-muted-foreground">حُلّ: {dateText(event.resolved_at)}</div>}
                    </td>
                    <td className="p-3">
                      {action ? (
                        <button type="button" disabled={Boolean(busyId)}
                          aria-label={(action === "acknowledged" ? "إقرار الخطأ " : "حل الخطأ ") + event.id}
                          onClick={() => void handleTransition(event)}
                          className="whitespace-nowrap rounded-lg border px-3 py-2 text-xs font-medium disabled:opacity-50">
                          {busyId === event.id ? "جارٍ الحفظ…" : action === "acknowledged" ? "إقرار المعالجة" : "تأكيد الحل"}
                        </button>
                      ) : <span className="text-xs text-muted-foreground">مغلق</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !loadError && total > PAGE_SIZE && (
        <nav aria-label="صفحات سجل الأخطاء" className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">الصفحة {page + 1} من {pageCount}</span>
          <div className="flex gap-2">
            <button type="button" disabled={!canGoBack} onClick={() => setPage((value) => Math.max(0, value - 1))}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">السابق</button>
            <button type="button" disabled={!canGoForward} onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40">التالي</button>
          </div>
        </nav>
      )}

      <p className="text-xs leading-6 text-muted-foreground">
        الخصوصية: يُحفظ اسم نوع الخطأ وحالة HTTP وحدّث الالتقاط فقط. لا تُخزّن الرسالة الخام أو stack trace أو URL أو headers أو token أو طلبات أو بيانات العملاء. أحداث المتصفح تتطلب جلسة مصادقاً عليها؛ لا يُعرض هذا السجل كبديل لسجلات الخادم السرية أو كإثبات لصحة جميع الخدمات.
      </p>
    </section>
  );
}
