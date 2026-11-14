import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, XCircle } from "lucide-react";
import { fetchAiGatewayBudget, type AiGatewayBudgetResult } from "@/lib/intelligence/ai-gateway-operations-client";
import { buildSystemHealthSnapshot, type SystemHealthProbe } from "@/lib/intelligence/system-health";

type ProbeState = {
  result: AiGatewayBudgetResult;
  probe: SystemHealthProbe;
  attemptedAt: string;
  completedAt: string;
};

function healthLabel(status: ReturnType<typeof buildSystemHealthSnapshot>["status"]): string {
  switch (status) {
    case "HEALTHY": return "سليم";
    case "DEGRADED": return "متدهور";
    case "UNAVAILABLE": return "غير متاح";
    default: return "غير مثبت";
  }
}

function sourceLabel(result: AiGatewayBudgetResult | null): string {
  if (!result) return "لم يكتمل الفحص";
  if (result.ok) return "استجابة المصدر مؤكدة";
  if (result.status === "DENIED") return "محجوب بالصلاحية";
  if (result.status === "ERROR") return "استجابة غير صالحة";
  return "المصدر غير متاح";
}

function safeSourceFailureReason(result: AiGatewayBudgetResult): string {
  if (result.ok) return "";
  if (result.status === "DENIED") {
    return "رفضت صلاحيات الجلسة الحالية قراءة ملخص ميزانية بوابة الذكاء.";
  }
  if (result.status === "ERROR") {
    return "استجابة مصدر ميزانية بوابة الذكاء غير مطابقة للعقد؛ لم تُقبل كدليل.";
  }
  return "تعذرت قراءة المصدر المعتمد حالياً.";
}

export function SystemHealthScreen() {
  const [probeState, setProbeState] = useState<ProbeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    const attemptedAt = new Date().toISOString();
    const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
    setLoading(true);
    setProbeState(null);

    const finish = (result: AiGatewayBudgetResult) => {
      if (!active) return;
      const completedAt = new Date().toISOString();
      const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      const latencyMs = Math.max(0, Math.round(endedAt - startedAt));
      const probe: SystemHealthProbe = {
        component: "AI_GATEWAY_BUDGET_READ",
        status: result.ok ? "HEALTHY" : result.status === "UNAVAILABLE" ? "UNAVAILABLE" : "UNKNOWN",
        checkedAt: completedAt,
        latencyMs,
        sourceEvidenceId: null,
        errorCode: result.ok ? null : result.status,
        owner: null,
        freshForSeconds: 120,
      };
      setProbeState({ result, probe, attemptedAt, completedAt });
    };

    void fetchAiGatewayBudget()
      .then(finish)
      .catch(() => finish({
        ok: false,
        status: "UNAVAILABLE",
        message: "تعذر قراءة ملخص ميزانية بوابة الذكاء من المصدر المعتمد.",
      }))
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [refreshKey]);

  const health = useMemo(() => buildSystemHealthSnapshot({
    asOf: probeState?.completedAt ?? new Date().toISOString(),
    requiredComponents: ["AI_GATEWAY_BUDGET_READ"],
    probes: probeState ? [probeState.probe] : [],
    // No persistent, VERIFIED EvidenceRecord is returned by this RPC today.
    // The aggregate health model therefore correctly refuses to mark the system HEALTHY.
    evidenceRecords: [],
  }), [probeState]);

  const result = probeState?.result ?? null;
  const SourceIcon = result?.ok ? CheckCircle2
    : result?.status === "DENIED" ? ShieldAlert
      : result ? XCircle : Activity;

  return (
    <section dir="rtl" aria-label="صحة النظام" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">صحة النظام</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            فحوص مصادر حقيقية مع فصل قابلية قراءة المصدر عن إثبات سلامة النظام بالكامل.
          </p>
        </div>
        <button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50">
          <RefreshCw size={15} aria-hidden="true" />
          {loading ? "جارٍ الفحص…" : "إعادة الفحص"}
        </button>
      </header>

      <article className="rounded-xl border p-4" aria-live="polite" aria-busy={loading}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">حالة النظام المجمّعة</p>
            <strong className="mt-1 block text-xl">{healthLabel(health.status)} · {health.status}</strong>
          </div>
          <span className="rounded-md border px-3 py-1 text-xs">فحص مطلوب: 1 · أدلة موثقة: 0</span>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          {health.status === "UNKNOWN"
            ? "لا توجد سجلات Evidence موثقة ومكتملة مرتبطة بالفحص؛ لذلك لا تُرفع الحالة العامة إلى سليم، حتى عند نجاح قراءة RPC."
            : "تعكس الحالة نتيجة الفحص المطلوب ضمن حدود المصدر المسجل."}
        </p>
        {health.warnings.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">رموز الإثبات: {health.warnings.join("، ")}</p>
        )}
      </article>

      <article className="rounded-xl border p-4" aria-live="polite" aria-busy={loading}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 text-muted-foreground"><SourceIcon size={20} aria-hidden="true" /></span>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold">قراءة ملخص ميزانية بوابة الذكاء</h3>
            <code dir="ltr" className="mt-1 block break-all text-xs text-muted-foreground">public.get_ai_gateway_budget</code>
            <p className="mt-2 text-sm font-semibold">{loading ? "جارٍ طلب المصدر الحالي…" : sourceLabel(result)}</p>
            {!loading && result && (
              <p className="mt-1 text-sm text-muted-foreground">
                {result.ok
                  ? "استجاب RPC الإداري. هذا يؤكد قراءة الملخص فقط، ولا يثبت اتصال مزود خارجي أو نجاح طلب نموذج."
                  : safeSourceFailureReason(result)}
              </p>
            )}
            {probeState && (
              <dl className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                <div><dt>بدء الفحص</dt><dd><time dateTime={probeState.attemptedAt}>{new Date(probeState.attemptedAt).toLocaleString("ar-YE")}</time></dd></div>
                <div><dt>اكتمال الفحص</dt><dd><time dateTime={probeState.completedAt}>{new Date(probeState.completedAt).toLocaleString("ar-YE")}</time></dd></div>
                <div><dt>زمن الطلب من المتصفح</dt><dd>{probeState.probe.latencyMs === null ? "غير متاح" : probeState.probe.latencyMs + " مللي ثانية"}</dd></div>
                <div><dt>دليل المصدر</dt><dd>{result?.ok ? "قراءة RPC ناجحة" : "لا يوجد إثبات نجاح"}</dd></div>
              </dl>
            )}
          </div>
        </div>
      </article>

      <p className="text-xs leading-6 text-muted-foreground">
        النطاق الحالي: فحص واحد لقراءة ملخص الميزانية. لم تُجرَ probes مستقلة لـAuth أو Storage أو Edge Functions أو قاعدة البيانات العامة أو Onyx. قياس الكمون هو زمن دورة الطلب من المتصفح، وليس زمن تنفيذ الخادم وحده.
      </p>
    </section>
  );
}
