import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { fetchAiGatewayBudget } from "@/lib/intelligence/ai-gateway-operations-client";
import {
  projectAiGatewayBudgetProbe,
  type AiGatewayBudgetProbe,
} from "@/lib/reference-model/observability/system-health-probe";

function statusPresentation(status: AiGatewayBudgetProbe["status"]) {
  switch (status) {
    case "READABLE":
      return { label: "استجابة المصدر مؤكدة", icon: CheckCircle2 };
    case "DENIED":
      return { label: "محجوب بالصلاحية", icon: ShieldAlert };
    case "UNAVAILABLE":
      return { label: "المصدر غير متاح", icon: XCircle };
    case "INVALID":
      return { label: "دليل غير صالح", icon: AlertTriangle };
  }
}

export function SystemHealthPanel() {
  const { sessionRevision } = useAuth();
  const [probe, setProbe] = useState<AiGatewayBudgetProbe | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const attemptedAt = new Date().toISOString();
    setProbe(null);
    setLoading(true);

    void fetchAiGatewayBudget()
      .then((result) => {
        if (active) setProbe(projectAiGatewayBudgetProbe(result, attemptedAt));
      })
      .catch(() => {
        if (active) {
          setProbe(projectAiGatewayBudgetProbe({
            ok: false,
            status: "UNAVAILABLE",
            message: "budget_source_unavailable",
          }, attemptedAt));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [sessionRevision, refreshKey]);

  const presentation = probe ? statusPresentation(probe.status) : null;
  const StatusIcon = presentation?.icon ?? Activity;

  return (
    <section dir="rtl" aria-label="فحوص صحة النظام" className="space-y-4 rounded-xl border p-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">صحة النظام ومصادر التشغيل</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            فحوص مثبتة فقط؛ لا تُستنتج صحة المكونات من وجود ملفات أو نجاح البناء.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => setRefreshKey((value) => value + 1)}
          disabled={loading}
        >
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "جارٍ الفحص…" : "إعادة الفحص"}
        </button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <article className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">الحالة العامة</p>
          <strong className="mt-1 block text-lg">UNKNOWN — غير مثبتة</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            لا توجد حتى الآن مجموعة probes مكتملة وموثقة لكل خدمات التطبيق.
          </p>
        </article>
        <article className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">اتصال مزود الذكاء</p>
          <strong className="mt-1 block text-lg">UNKNOWN — لم يُختبر</strong>
          <p className="mt-1 text-xs text-muted-foreground">
            قراءة إعدادات الميزانية لا تستدعي المزود ولا تثبت اتصالاً خارجياً.
          </p>
        </article>
      </div>

      <article className="rounded-lg border p-3" aria-live="polite" aria-busy={loading}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-muted-foreground"><StatusIcon size={20} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">قراءة ملخص ميزانية بوابة الذكاء</h3>
            <code dir="ltr" className="mt-1 block break-all text-xs">public.get_ai_gateway_budget</code>
            {loading ? (
              <p className="mt-2 text-sm text-muted-foreground">جارٍ طلب المصدر الحالي من الخادم…</p>
            ) : probe && presentation ? (
              <>
                <p className="mt-2 text-sm font-semibold">{presentation.label}</p>
                <p className="mt-1 text-sm text-muted-foreground">{probe.detail}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  وقت محاولة القراءة محلياً: <time dateTime={probe.attemptedAt}>{new Date(probe.attemptedAt).toLocaleString("ar-YE")}</time>
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">لم تنتج محاولة القراءة دليلاً صالحاً.</p>
            )}
          </div>
        </div>
      </article>

      <p className="text-xs leading-6 text-muted-foreground">
        حدود الإثبات: هذا الفحص يقرأ ملخصاً إدارياً من قاعدة البيانات فقط. لا يثبت سلامة Auth أو Storage أو Edge Functions أو Onyx أو مزود النموذج، ولا يحل محل سجل Evidence موثق أو فحوص PostgreSQL وRLS.
      </p>
    </section>
  );
}
