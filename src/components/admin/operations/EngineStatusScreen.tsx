import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import {
  readAdminEngineObservations,
  type AdminEngineObservation,
  type AdminEngineObservationSnapshot,
} from "@/lib/admin-operation-engine-observations";

function sourceStatusLabel(status: AdminEngineObservation["sourceStatus"]): string {
  switch (status) {
    case "READABLE": return "المصدر مقروء";
    case "READABLE_EMPTY": return "المصدر مقروء بلا سجلات";
    case "DENIED": return "محجوب بالصلاحية";
    case "INVALID": return "استجابة غير صالحة";
    default: return "المصدر غير متاح";
  }
}

function SourceStatusIcon({ status }: { status: AdminEngineObservation["sourceStatus"] }) {
  if (status === "READABLE") return <CheckCircle2 size={18} aria-hidden="true" />;
  if (status === "READABLE_EMPTY") return <Activity size={18} aria-hidden="true" />;
  if (status === "DENIED") return <ShieldAlert size={18} aria-hidden="true" />;
  if (status === "INVALID") return <AlertTriangle size={18} aria-hidden="true" />;
  return <XCircle size={18} aria-hidden="true" />;
}

function formatTimestamp(value: string | null): string {
  return value ? new Date(value).toLocaleString("ar-YE") : "لا يوجد سجل زمني من المصدر";
}

export function EngineStatusScreen() {
  const [snapshot, setSnapshot] = useState<AdminEngineObservationSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void readAdminEngineObservations()
      .then((value) => { if (active) setSnapshot(value); })
      .catch(() => { if (active) { setSnapshot(null); setError(true); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey]);

  return (
    <section dir="rtl" aria-label="حالة المحركات" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">لوحة حالة المحركات</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            قراءة مصادر التشغيل المحفوظة لكل محرك، مع إبقاء حالة تنفيذ المحرك مستقلة وغير مثبتة دون probe مخصص.
          </p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "جارٍ التحقق…" : "إعادة التحقق"}
        </button>
      </header>

      {loading && <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">جارٍ قراءة مصادر الحالة الفعلية…</p>}
      {error && <p role="alert" className="rounded-lg border p-4 text-sm">تعذر إكمال قراءة لوحة المحركات. لم تُعرض حالة بديلة أو بيانات سابقة.</p>}
      {!loading && !error && snapshot?.items.length === 0 && (
        <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">لم تُرجع مصادر الحالة أي عناصر.</p>
      )}

      {snapshot && (
        <>
          <p className="text-xs text-muted-foreground">
            آخر دورة قراءة: <time dateTime={snapshot.checkedAt}>{new Date(snapshot.checkedAt).toLocaleString("ar-YE")}</time>
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {snapshot.items.map((item) => (
              <article key={item.id} className="min-w-0 rounded-xl border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2">
                    <span className="mt-0.5 text-muted-foreground"><SourceStatusIcon status={item.sourceStatus} /></span>
                    <div className="min-w-0">
                      <h3 className="font-semibold">{item.title}</h3>
                      <code dir="ltr" className="mt-1 block break-all text-xs text-muted-foreground">{item.source}</code>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md border px-2 py-1 text-xs">{sourceStatusLabel(item.sourceStatus)}</span>
                </div>
                <p className="mt-3 text-sm leading-6">{item.summary}</p>
                <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  <div><dt>حالة تنفيذ المحرك</dt><dd className="font-semibold text-foreground">UNKNOWN — غير مثبتة</dd></div>
                  <div><dt>زمن قراءة المصدر</dt><dd>{item.latencyMs === null ? "غير متاح" : item.latencyMs + " مللي ثانية"}</dd></div>
                  <div><dt>عدد السجلات</dt><dd>{item.recordCount === null ? "غير منطبق" : String(item.recordCount)}</dd></div>
                  <div><dt>آخر سجل محفوظ</dt><dd>{formatTimestamp(item.latestRecordAt)}</dd></div>
                  <div className="sm:col-span-2"><dt>آخر تحقق</dt><dd><time dateTime={item.checkedAt}>{new Date(item.checkedAt).toLocaleString("ar-YE")}</time></dd></div>
                </dl>
                <p className="mt-3 border-t pt-3 text-xs leading-6 text-muted-foreground">{item.boundary}</p>
              </article>
            ))}
          </div>
        </>
      )}

      <p className="text-xs leading-6 text-muted-foreground">
        هذه اللوحة لا تشغّل عمليات استيراد أو تسعير أو تصدير، ولا تتصل بنظام Onyx أو مزود الذكاء مباشرة. نجاح قراءة سجل أو إعداد لا يساوي نجاح تشغيل المحرك.
      </p>
    </section>
  );
}
