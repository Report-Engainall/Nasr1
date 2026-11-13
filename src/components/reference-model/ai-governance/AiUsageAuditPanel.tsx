import { useEffect, useState } from "react";
import { Activity, AlertTriangle, Clock3, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { buildAiUsageQualityInsights } from "@/lib/reference-model/ai-governance/ai-usage-quality-insights";
import {
  listAiUsageAudit,
  type AiUsageAuditRecord,
  type AiUsageResultStatus,
} from "@/lib/reference-model/ai-governance/ai-usage-audit-client";

type StatusFilter = "all" | AiUsageResultStatus;

const resultLabels: Record<AiUsageResultStatus, string> = {
  completed: "اكتملت",
  failed: "فشلت",
  fallback: "اكتملت عبر الاحتياطي",
  rejected_quota: "رُفضت بسبب الحصة",
};
const measurementLabels = {
  measured: "استهلاك مقاس من المزود",
  partial: "قياس جزئي",
  unknown: "الاستهلاك غير معلوم",
  not_attempted: "لم يبدأ اتصال بمزود",
  legacy_unknown: "سجل قديم بلا قياس موثوق",
} as const;
const outcomeLabels: Record<string, string> = {
  ai_disabled: "الذكاء معطل في إعداد المؤسسة",
  provider_not_configured: "لا يوجد مزود مؤهل ومتحقق",
  gateway_configuration_failed: "تعذر قراءة إعداد البوابة",
  quota_reservation_disabled: "الحصة لا تسمح بإنشاء الحجز",
  quota_exceeded: "تجاوزت المحاولة حد الحصة",
};

function dateLabel(value: string): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString("ar-YE") : "تاريخ غير صالح";
}
function numberLabel(value: number | null): string {
  return value === null ? "غير متاح" : new Intl.NumberFormat("ar-YE").format(value);
}
function costLabel(value: number): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
}
function recordLabel(record: AiUsageAuditRecord): string {
  return record.providerAttempts.length ? record.providerAttempts.map((attempt) => attempt.provider + " / " + attempt.model).join(" ← ") : record.modelName;
}
function qualityStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    INSUFFICIENT_SAMPLE: "عينة غير كافية",
    NOT_MEASURABLE: "لا توجد قياسات قابلة للحساب",
    HEALTHY: "ضمن النطاق الإرشادي",
    WATCH: "يحتاج متابعة",
    DEGRADED: "تدهور ملحوظ",
  };
  return labels[status] ?? "غير متاح";
}
function qualityRateLabel(numerator: number, denominator: number, rate: number | null): string {
  if (rate === null) return "غير متاح";
  return new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 1 }).format(rate * 100) + "% (" +
    new Intl.NumberFormat("ar-YE").format(numerator) + " / " +
    new Intl.NumberFormat("ar-YE").format(denominator) + ")";
}

export function AiUsageAuditPanel() {
  const { user, sessionRevision, loading: authLoading, ready } = useAuth();
  const canRead = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const [status, setStatus] = useState<StatusFilter>("all");
  const [items, setItems] = useState<AiUsageAuditRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setItems([]);
    setTotal(0);
    setError(null);
    if (!ready || authLoading) {
      setLoading(true);
      return () => { active = false; };
    }
    if (!user || !canRead) {
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    void listAiUsageAudit({ status: status === "all" ? null : status, limit: 25, offset })
      .then((page) => {
        if (!active) return;
        setItems(page.items);
        setTotal(page.total);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setItems([]);
        setTotal(0);
        setError(cause instanceof Error ? cause.message : "تعذر تحميل سجل المحاولات.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [user?.profileId, sessionRevision, ready, authLoading, user, canRead, status, offset, refreshKey]);

  if (!ready || authLoading) {
    return <section dir="rtl" role="status" aria-busy="true" className="rounded-xl border p-4 text-sm">جارٍ التحقق من جلسة الإدارة…</section>;
  }
  if (!user) {
    return <section dir="rtl" role="alert" className="rounded-xl border p-4 text-sm">يلزم تسجيل الدخول للوصول إلى تدقيق الذكاء.</section>;
  }
  if (!canRead) {
    return (
      <section dir="rtl" role="alert" aria-label="صلاحية تدقيق الذكاء" className="rounded-xl border p-4 text-sm">
        <h2 className="font-semibold">تدقيق محاولات الذكاء</h2>
        <p className="mt-2">هذه المساحة مخصصة لمدير النظام ومدير المؤسسة. يفرض الخادم الصلاحية نفسها ولا يعتمد على إخفاء الواجهة.</p>
      </section>
    );
  }

  const hasMore = offset + items.length < total;
  const quality = buildAiUsageQualityInsights(items);
  return (
    <section dir="rtl" aria-label="تدقيق محاولات الذكاء" className="space-y-4 rounded-xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <ShieldCheck size={19} aria-hidden="true" className="text-emerald-700" />
            <h2 className="text-lg font-semibold">تدقيق محاولات الذكاء</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            سجل مؤسستك من الخادم؛ يعرض بيانات المحاولة والمزود والقياس فقط، ولا يعرض السؤال أو الإجابة أو بيانات الاعتماد.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={15} aria-hidden="true" />
          تحديث
        </button>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex min-w-48 flex-col gap-1 text-sm">
          <span className="font-medium">حالة النتيجة</span>
          <select
            className="rounded-md border bg-background px-3 py-2"
            value={status}
            onChange={(event) => { setStatus(event.target.value as StatusFilter); setOffset(0); }}
          >
            <option value="all">جميع الحالات</option>
            <option value="completed">اكتملت</option>
            <option value="failed">فشلت</option>
            <option value="fallback">الاحتياطي</option>
            <option value="rejected_quota">رُفضت بسبب الحصة</option>
          </select>
        </label>
        <p className="text-xs tabular-nums text-muted-foreground">{total} محاولة في النطاق المتاح</p>
      </div>

      {error ? <p role="alert" className="rounded-md border border-destructive/50 p-3 text-sm">{error}</p> : null}
      {loading ? (
        <p role="status" aria-busy="true" className="rounded-lg border p-4 text-sm text-muted-foreground">جارٍ تحميل سجل المؤسسة…</p>
      ) : items.length === 0 ? (
        <div className="rounded-lg border p-5 text-center">
          <Activity size={24} aria-hidden="true" className="mx-auto text-muted-foreground" />
          <p className="mt-2 font-semibold">لا توجد محاولات تطابق المرشح</p>
          <p className="mt-1 text-sm text-muted-foreground">لم تُنشأ سجلات تجريبية لإظهار الشاشة؛ ستظهر المحاولات الفعلية بعد أن يسجلها خادم البوابة.</p>
        </div>
      ) : (
        <ol className="space-y-3">
          {items.map((record) => (
            <li key={record.id} className="min-w-0 rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong>{resultLabels[record.resultStatus]}</strong>
                    <span className="rounded-full border px-2 py-0.5 text-xs">{measurementLabels[record.measurementStatus]}</span>
                    {record.fallbackUsed ? <span className="rounded-full border px-2 py-0.5 text-xs">استخدام احتياطي</span> : null}
                  </div>
                  <code className="mt-2 block break-all text-xs text-muted-foreground" dir="ltr">{record.requestId}</code>
                  <p className="mt-1 text-xs text-muted-foreground">{dateLabel(record.createdAt)}</p>
                </div>
                <div className="text-left text-xs text-muted-foreground">
                  <p>المدة: {numberLabel(record.executionTimeMs)} مللي ثانية</p>
                  <p className="mt-1">التكلفة المقدّرة: {costLabel(record.estimatedCost)}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-xs text-muted-foreground">النموذج / السجل</p>
                  <p className="mt-1 break-all text-sm" dir="ltr">{recordLabel(record)}</p>
                </div>
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-xs text-muted-foreground">الرموز المرصودة من المزود</p>
                  <p className="mt-1 text-sm tabular-nums">{numberLabel(record.observedInputTokens)} / {numberLabel(record.observedOutputTokens)}</p>
                </div>
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-xs text-muted-foreground">عدد محاولات المزود</p>
                  <p className="mt-1 text-sm tabular-nums">{numberLabel(record.providerAttemptCount)}</p>
                  {record.providerAttemptTelemetryAvailable === false ? <p role="note" className="mt-1 text-xs text-muted-foreground">تفاصيل المحاولات التاريخية غير متاحة بسبب صيغة مصدر غير معروفة؛ لم تُحتسب نجاحاً أو فشلاً.</p> : null}
                </div>
                <div className="rounded-md bg-muted/30 p-2">
                  <p className="text-xs text-muted-foreground">الفاعل</p>
                  <p className="mt-1 break-all text-xs" dir="ltr">{record.actorProfileId ?? "غير متاح"}</p>
                </div>
              </div>

              {record.providerAttempts.length ? (
                <div className="mt-3 space-y-2">
                  <h3 className="text-sm font-semibold">تفاصيل محاولات المزود</h3>
                  {record.providerAttempts.map((attempt, index) => (
                    <div key={record.id + ":" + index} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
                      <div className="min-w-0">
                        <p className="font-semibold" dir="ltr">{attempt.provider} / {attempt.model}</p>
                        <p className="mt-1 text-muted-foreground">
                          {attempt.status === "succeeded" ? "نجحت المحاولة" : "فشلت المحاولة"}
                          {attempt.fallback ? " · احتياطية" : ""}
                          {attempt.errorCode ? " · رمز الخطأ: " + attempt.errorCode : ""}
                        </p>
                      </div>
                      <div className="text-left text-muted-foreground">
                        <p>{numberLabel(attempt.elapsedMs)} مللي ثانية</p>
                        <p>رموز مرصودة: {numberLabel(attempt.observedInputTokens)} / {numberLabel(attempt.observedOutputTokens)}</p>
                        {attempt.estimatedCost !== null ? <p>تكلفة مقدّرة للمحاولة: {costLabel(attempt.estimatedCost)}</p> : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : record.outcomeReason ? (
                <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle size={15} aria-hidden="true" className="mt-1 shrink-0" />
                  {outcomeLabels[record.outcomeReason] ?? "لم تُسجل محاولة مزود."}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      )}


      {!loading && !error && status === "all" ? (
        <section role="region" aria-label="مؤشرات جودة تشغيل الذكاء" className="space-y-3 rounded-lg border p-3">
          <header>
            <h3 className="font-semibold">مؤشرات جودة التشغيل — العينة المعروضة</h3>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              تحليل حتمي للصفحة الحالية فقط ({items.length} سجلاً بحد أقصى 25)، ولا يمثل كامل المؤسسة أو اتفاقية مستوى خدمة.
              الحد الأدنى لكل معدل هو 5 مشاهدات؛ العينة الأصغر لا تُصنّف سليمة.
            </p>
          </header>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">فشل محاولات المزود</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{qualityRateLabel(quality.providerFailures.numerator, quality.providerFailures.denominator, quality.providerFailures.rate)}</p>
              <p className="mt-1 text-xs">{qualityStatusLabel(quality.providerFailures.status)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">متابعة عند 15%، وتدهور عند 30% بعد اكتمال العينة</p>
            </div>
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">الاعتماد على الاحتياطي</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{qualityRateLabel(quality.fallbackReliance.numerator, quality.fallbackReliance.denominator, quality.fallbackReliance.rate)}</p>
              <p className="mt-1 text-xs">{qualityStatusLabel(quality.fallbackReliance.status)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">متابعة عند 25%، وتدهور عند 40%</p>
            </div>
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">زمن الاستجابة P95</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{quality.p95Latency.p95Ms === null ? "غير متاح" : numberLabel(quality.p95Latency.p95Ms) + " مللي ثانية"}</p>
              <p className="mt-1 text-xs">{qualityStatusLabel(quality.p95Latency.status)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">متابعة من 5 ثوانٍ، وتدهور من 10 ثوانٍ؛ عينة المحاولات: {numberLabel(quality.p95Latency.sampleCount)}</p>
            </div>
            <div className="rounded-md bg-muted/30 p-3">
              <p className="text-xs text-muted-foreground">نقص قياس الاستهلاك</p>
              <p className="mt-1 text-sm font-semibold tabular-nums">{qualityRateLabel(quality.measurementGaps.numerator, quality.measurementGaps.denominator, quality.measurementGaps.rate)}</p>
              <p className="mt-1 text-xs">{qualityStatusLabel(quality.measurementGaps.status)}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">متابعة عند 20%، وتدهور عند 40% من المحاولات</p>
            </div>
          </div>
          {quality.unclassifiedAttemptRecords > 0 ? (
            <p role="note" className="text-xs leading-6 text-muted-foreground">
              توجد {numberLabel(quality.unclassifiedAttemptRecords)} سجلات ذات تفاصيل محاولات غير صالحة؛ استُبعدت من معدل فشل المزود ولم تُحسب نجاحاً.
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            هذه حدود تشغيلية إرشادية ثابتة، وليست تنبيهات آلية أو إثبات اتصال بمزود خارجي.
          </p>
        </section>
      ) : !loading && !error && status !== "all" ? (
        <p role="note" className="rounded-lg border p-3 text-xs leading-6 text-muted-foreground">
          أُخفيت مؤشرات الجودة لأن مرشح حالة النتيجة يغيّر تركيب العينة وقد يحرّف معدلات الفشل والاحتياطي.
        </p>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground">
          <Clock3 size={14} aria-hidden="true" className="mt-1 shrink-0" />
          التكلفة تقديرية بحسب أسعار البوابة المسجلة وليست فاتورة مزود. الرموز المرصودة تظهر فقط عند وجود قياس فعلي؛ وإلا تبقى غير متاحة.
        </p>
        <div className="flex gap-2">
          <button type="button" className="rounded-md border px-3 py-2 text-xs disabled:opacity-40" onClick={() => setOffset((value) => Math.max(0, value - 25))} disabled={offset === 0 || loading}>السابق</button>
          <button type="button" className="rounded-md border px-3 py-2 text-xs disabled:opacity-40" onClick={() => setOffset((value) => value + 25)} disabled={!hasMore || loading}>التالي</button>
        </div>
      </footer>
    </section>
  );
}
