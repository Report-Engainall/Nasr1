import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BrainCircuit, CalendarClock, RefreshCw, ShieldCheck, Workflow } from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  createCashflowScheduleRequest,
  fetchCashflowSchedule,
  type CashflowMeasurementProof,
  type CashflowScheduleResult,
} from "@/lib/intelligence/cashflow-schedule-client";
import {
  commandDecisionOutcome,
  createDecisionOutcomeProposal,
  fetchDecisionOutcomes,
  type DecisionOutcomeEventType,
  type DecisionOutcomeView,
  type DecisionOutcomeListResult,
} from "@/lib/intelligence/decision-outcome-client";
import {
  ActionCard,
  CashflowForecastCard,
  DeadStockCard,
  EvidencePassport,
  LiquiditySummary,
  ReplenishmentCard,
} from "@/components/intelligence";

type Horizon = 7 | 30 | 90;
const formatDay = (value: string) => new Date(value + "T00:00:00.000Z").toLocaleDateString("ar-YE", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const formatMoney = (value: number, currency: string) => new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value) + " " + currency;
const stateLabels: Record<DecisionOutcomeView["state"], string> = {
  PROPOSED: "مقترح", IN_REVIEW: "قيد المراجعة", APPROVED: "معتمد", REJECTED: "مرفوض",
  ASSIGNED: "مُعيّن", EXECUTING: "قيد التنفيذ", EXECUTED: "بانتظار القياس", MEASURED: "مقاس",
};
function currencyFromCandidate(candidateId: string): string | null {
  const parts = candidateId.split(":");
  return parts[0] === "cashflow.expected_collections" && /^[A-Z]{3}$/.test(parts[1] ?? "") ? parts[1] : null;
}
function candidateIdFor(currency: string, period: { from: string; to: string }): string {
  return "cashflow.expected_collections:" + currency + ":" + period.from + ":" + period.to;
}

export function IntelligenceWorkspace() {
  const { user } = useAuth();
  const canManage = Boolean(user?.roles.some((role) => role === "admin" || role === "manager"));
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<CashflowScheduleResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [outcomeResult, setOutcomeResult] = useState<DecisionOutcomeListResult | null>(null);
  const [outcomesLoading, setOutcomesLoading] = useState(true);
  const [outcomeBusyId, setOutcomeBusyId] = useState<string | null>(null);
  const [outcomeMessage, setOutcomeMessage] = useState<string | null>(null);
  const [outcomeReasons, setOutcomeReasons] = useState<Record<string, string>>({});
  const [proposalCurrency, setProposalCurrency] = useState("");
  const [proposalExpected, setProposalExpected] = useState("متابعة التحصيل وفق الفواتير المثبتة في الفترة المحددة");
  const [proposalReason, setProposalReason] = useState("");

  const loadCashflow = useCallback(async (active: () => boolean) => {
    if (!canManage) {
      setResult({ ok: false, status: "DENIED", message: "تتطلب هذه الشاشة صلاحية المدير أو مدير المؤسسة المالية." });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const request = createCashflowScheduleRequest({ horizonDays: horizon });
      const response = await fetchCashflowSchedule(request);
      if (!active()) return;
      setResult(response);
    } catch {
      if (!active()) return;
      setResult({ ok: false, status: "ERROR", message: "تعذر إنشاء طلب التحليل؛ لم تُعرض أرقام بديلة." });
    } finally {
      if (active()) setLoading(false);
    }
  }, [canManage, horizon]);

  const loadOutcomes = useCallback(async () => {
    if (!canManage) {
      setOutcomeResult({ ok: false, status: "DENIED", message: "إدارة القرارات متاحة للمدير ومدير المؤسسة المالية فقط." });
      setOutcomesLoading(false);
      return;
    }
    setOutcomesLoading(true);
    const response = await fetchDecisionOutcomes(50, 0);
    setOutcomeResult(response);
    setOutcomesLoading(false);
  }, [canManage]);

  useEffect(() => {
    let mounted = true;
    void loadCashflow(() => mounted);
    return () => { mounted = false; };
  }, [loadCashflow, refreshKey]);

  useEffect(() => {
    void loadOutcomes();
  }, [loadOutcomes, refreshKey]);

  const data = result?.ok ? result.data : null;
  const verified = Boolean(
    data &&
    data.status === "OK" &&
    data.schedule.status === "VERIFIED" &&
    data.schedule.completeness === "COMPLETE" &&
    data.schedule.quality === "ACCEPTABLE",
  );
  const totals = useMemo(() => {
    const grouped = new Map<string, number>();
    if (!verified || !data) return grouped;
    for (const entry of data.schedule.entries) {
      const currency = entry.amount.currency;
      grouped.set(currency, (grouped.get(currency) ?? 0) + (entry.direction === "INFLOW" ? entry.amount.value : -entry.amount.value));
    }
    return grouped;
  }, [verified, data]);

  useEffect(() => {
    const metrics = data?.measurementMetrics ?? [];
    if (metrics.length && !metrics.some((metric) => metric.currency === proposalCurrency)) {
      setProposalCurrency(metrics[0].currency);
    }
  }, [data, proposalCurrency]);

  const createProposal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!data || !user?.profileId || !proposalCurrency || !proposalExpected.trim()) return;
    const proof = data.measurementMetrics.find((item) => item.currency === proposalCurrency);
    if (!proof) {
      setOutcomeMessage("لا يمكن إنشاء متابعة مالية دون مؤشر تحصيل موثق للعملة والفترة المختارتين.");
      return;
    }
    setOutcomeBusyId("new");
    setOutcomeMessage(null);
    const created = await createDecisionOutcomeProposal({
      candidateId: candidateIdFor(proof.currency, proof.period),
      ruleId: "cashflow.collection.followup",
      ruleVersion: "1.0.0",
      ownerProfileId: user.profileId,
      expectedOutcome: proposalExpected.trim(),
      reason: proposalReason.trim(),
    });
    setOutcomeBusyId(null);
    if (!created.ok) {
      setOutcomeMessage(created.message);
      return;
    }
    setProposalReason("");
    setOutcomeMessage(created.duplicate ? "هذا المقترح محفوظ مسبقاً؛ تم استرجاع نسخته الحالية." : "تم حفظ المقترح وسجل حدثه على الخادم.");
    await loadOutcomes();
  };

  const runTransition = async (
    outcome: DecisionOutcomeView,
    eventType: DecisionOutcomeEventType,
    options: { reason?: string; ownerProfileId?: string; proof?: CashflowMeasurementProof } = {},
  ) => {
    if (outcomeBusyId) return;
    if ((eventType === "APPROVE" || eventType === "REJECT") && !options.reason?.trim()) {
      setOutcomeMessage("أدخل سبب الاعتماد أو الرفض قبل إرسال الأمر.");
      return;
    }
    setOutcomeBusyId(outcome.id);
    setOutcomeMessage(null);
    const measuredOutcome = options.proof
      ? { ...options.proof, measuredAt: new Date().toISOString() }
      : undefined;
    const updated = await commandDecisionOutcome({
      outcomeId: outcome.id,
      expectedVersion: outcome.version,
      eventType,
      ...(options.reason ? { reason: options.reason.trim() } : {}),
      ...(options.ownerProfileId ? { ownerProfileId: options.ownerProfileId } : {}),
      ...(measuredOutcome ? { measuredOutcome } : {}),
    });
    setOutcomeBusyId(null);
    if (!updated.ok) {
      setOutcomeMessage(updated.message);
      if (updated.status === "STALE" || updated.status === "CONFLICT") await loadOutcomes();
      return;
    }
    setOutcomeMessage(updated.duplicate ? "تم التعرف على إعادة إرسال الأمر دون إنشاء حدث مكرر." : "تم تسجيل انتقال القرار وإثباته في سجل التدقيق.");
    setOutcomeReasons((current) => ({ ...current, [outcome.id]: "" }));
    await loadOutcomes();
  };

  return (
    <section dir="rtl" className="space-y-4">
      {!canManage ? (
        <section className="panel" role="alert">
          <h1>صلاحية غير متاحة</h1>
          <p>تقتصر شاشة ذكاء الأعمال ودورة القرارات على المدير ومدير المؤسسة المالية. لم يُرسل طلب بيانات إلى الخادم.</p>
        </section>
      ) : (
        <>
          <header className="panel">
            <div className="panel-head">
              <div>
                <div className="flex items-center gap-2"><BrainCircuit size={22} /><h1>ذكاء الأعمال والتحصيلات والقرارات</h1></div>
                <p className="report-note">يعرض الاستحقاقات من سجلات المؤسسة، ويحفظ دورة القرار وأحداثها في قاعدة البيانات.</p>
              </div>
              <button type="button" className="btn secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading || outcomesLoading}>
                <RefreshCw size={16} /> تحديث
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm"><CalendarClock size={16} /> أفق الاستحقاقات</label>
              <div className="flex flex-wrap gap-2" role="group" aria-label="فترة جدول التدفق النقدي">
                {([7, 30, 90] as const).map((value) => (
                  <button key={value} type="button" className={horizon === value ? "btn primary" : "btn secondary"} aria-pressed={horizon === value} onClick={() => setHorizon(value)} disabled={loading}>
                    {value} يومًا
                  </button>
                ))}
              </div>
            </div>
          </header>

          {loading ? <div className="panel" role="status">جارٍ تحميل بيانات التحصيل من قاعدة البيانات...</div> : null}
          {!loading && result && !result.ok ? <div className="panel" role="alert"><p>{result.message}</p></div> : null}

          {!loading && data ? (
            <>
              <div className="report-grid">
                <article className="report-metric"><span>عدد الاستحقاقات المعروضة</span><strong>{data.schedule.entries.length}</strong><small>من {formatDay(data.period.from)} إلى {formatDay(data.period.to)}</small></article>
                <article className="report-metric"><span>أدلة المصدر</span><strong>{data.evidenceCount}</strong><small>فواتير ومدفوعات من نفس المؤسسة</small></article>
                <article className="report-metric"><span>حالة التغطية</span><strong>{data.schedule.completeness === "COMPLETE" ? "مكتملة" : data.schedule.completeness === "PARTIAL" ? "جزئية" : "غير معروفة"}</strong><small>{data.schedule.status === "VERIFIED" ? "موثقة" : "تحتاج مراجعة"}</small></article>
              </div>

              {verified ? (
                <section className="panel">
                  <h2>صافي التحصيلات المجدولة بحسب العملة</h2>
                  {totals.size === 0 ? <p className="report-note">لا توجد فواتير مستحقة ضمن الفترة المحددة.</p> : (
                    <div className="report-grid">
                      {[...totals.entries()].map(([currency, amount]) => (
                        <article className="report-metric" key={currency}><span>{currency}</span><strong>{formatMoney(amount, currency)}</strong><small>الاستحقاقات الداخلة المسجلة دون افتراض نسبة تحصيل</small></article>
                      ))}
                    </div>
                  )}
                </section>
              ) : (
                <div className="panel" role="status"><strong>تم حجب الإجمالي والتوقع.</strong><p className="report-note">توجد فاتورة مستحقة بلا تاريخ استحقاق صالح أو تغطية غير مكتملة؛ لم تُحوّل البيانات المجهولة إلى صفر.</p></div>
              )}

              <section className="panel">
                <h2>سجل الاستحقاقات</h2>
                {data.schedule.entries.length === 0 ? <p className="report-note">لا توجد سجلات قابلة للعرض؛ راجع حالة التغطية والتنبيهات.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr><th className="text-right">تاريخ الاستحقاق</th><th className="text-right">الاتجاه</th><th className="text-right">المبلغ</th><th className="text-right">مرجع الإثبات</th></tr></thead>
                      <tbody>
                        {data.schedule.entries.map((entry) => (
                          <tr key={entry.id} className="border-t">
                            <td className="p-2">{formatDay(entry.dueDate)}</td>
                            <td className="p-2">{entry.direction === "INFLOW" ? "تحصيل مستحق" : "التزام مجدول"}</td>
                            <td className="p-2 font-semibold">{formatMoney(entry.amount.value, entry.amount.currency)}</td>
                            <td className="p-2 text-muted-foreground">{entry.amount.lineage.evidenceIds.length} دليل · {entry.amount.lineage.formulaId}@{entry.amount.lineage.formulaVersion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="panel space-y-3">
                <div className="flex items-center gap-2"><Workflow size={18} /><h2>إنشاء متابعة تحصيل</h2></div>
                <p className="report-note">لا تُنشأ متابعة مالية إلا من إجمالي تحصيل مثبت وبأدلة كاملة للعملة والفترة المختارتين. إنشاء المقترح لا يسجل دفعة أو قيداً محاسبياً.</p>
                {data.measurementMetrics.length ? (
                  <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => void createProposal(event)}>
                    <label className="grid gap-1 text-sm">العملة
                      <select className="rounded-lg border bg-background p-2" value={proposalCurrency} onChange={(event) => setProposalCurrency(event.target.value)}>
                        {data.measurementMetrics.map((proof) => <option key={proof.currency} value={proof.currency}>{proof.currency} · {formatMoney(proof.value, proof.currency)}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1 text-sm">النتيجة المتوقعة
                      <input className="rounded-lg border bg-background p-2" value={proposalExpected} maxLength={2000} onChange={(event) => setProposalExpected(event.target.value)} required />
                    </label>
                    <label className="grid gap-1 text-sm md:col-span-2">سبب المتابعة
                      <input className="rounded-lg border bg-background p-2" value={proposalReason} maxLength={2000} onChange={(event) => setProposalReason(event.target.value)} placeholder="سبب إداري مختصر (اختياري)" />
                    </label>
                    <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-muted-foreground">النطاق: {data.period.from} — {data.period.to} · {user?.name}</span>
                      <button className="btn primary" type="submit" disabled={!proposalCurrency || !proposalExpected.trim() || outcomeBusyId !== null}>
                        {outcomeBusyId === "new" ? "جارٍ الحفظ..." : "حفظ مقترح المتابعة"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="rounded-lg border p-3 text-sm" role="status">لا يوجد إجمالي عملة موثق صالح للقياس في الفترة الحالية؛ إنشاء متابعات مالية محجوب حتى اكتمال الأدلة.</div>
                )}
              </section>
            </>
          ) : null}

          <section className="panel space-y-3">
            <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><ShieldCheck size={18} /><h2>دورة القرارات المحفوظة</h2></div><span className="text-xs text-muted-foreground">{outcomeResult?.ok ? outcomeResult.total + " قرار" : ""}</span></div>
            <p className="report-note">كل انتقال يحفظ بإصدار متوقع ومفتاح منع تكرار وسجل تدقيق ذري. لا يتغير وضع القرار محلياً قبل استجابة الخادم.</p>
            {outcomesLoading ? <p role="status" className="text-sm">جارٍ تحميل القرارات...</p> : null}
            {!outcomesLoading && outcomeResult && !outcomeResult.ok ? <div role="alert" className="rounded-lg border p-3 text-sm">{outcomeResult.message}</div> : null}
            {!outcomesLoading && outcomeResult?.ok && outcomeResult.items.length === 0 ? <p role="status" className="text-sm">لا توجد قرارات محفوظة لهذه المؤسسة.</p> : null}
            {!outcomesLoading && outcomeResult?.ok ? (
              <div className="space-y-3">
                {outcomeResult.items.map((outcome) => {
                  const currency = currencyFromCandidate(outcome.candidateId);
                  const proof = currency ? data?.measurementMetrics.find((item) => item.currency === currency && item.period.from + ":" + item.period.to === outcome.candidateId.split(":").slice(2).join(":")) : undefined;
                  const actionReason = outcomeReasons[outcome.id] ?? "";
                  const busy = outcomeBusyId === outcome.id;
                  return (
                    <article key={outcome.id} className="rounded-xl border p-4" aria-label={"قرار " + outcome.id}>
                      <header className="flex flex-wrap items-start justify-between gap-2">
                        <div><h3 className="font-semibold">{outcome.expectedOutcome}</h3><p className="mt-1 text-xs text-muted-foreground">{outcome.ruleId}@{outcome.ruleVersion} · المالك: {outcome.ownerLabel}</p></div>
                        <span className="rounded-full border px-3 py-1 text-xs">{stateLabels[outcome.state]} · v{outcome.version}</span>
                      </header>
                      <div className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                        <p>النطاق: {currency ?? "غير محدد"} · {outcome.candidateId.split(":").slice(2).join(" — ")}</p>
                        <p>الأحداث المحفوظة: {outcome.eventCount} · آخر تحديث: {formatDay(outcome.updatedAt.slice(0, 10))}</p>
                        {outcome.measuredOutcome ? <p className="font-semibold">النتيجة المقاسة: {formatMoney(outcome.measuredOutcome.value, outcome.measuredOutcome.currency)} · {outcome.measuredOutcome.asOf}</p> : null}
                        {outcome.reason ? <p>السبب: {outcome.reason}</p> : null}
                      </div>
                      {outcome.state === "IN_REVIEW" ? (
                        <label className="mt-3 grid gap-1 text-sm">سبب الاعتماد أو الرفض
                          <input className="rounded-lg border bg-background p-2" value={actionReason} maxLength={2000} onChange={(event) => setOutcomeReasons((current) => ({ ...current, [outcome.id]: event.target.value }))} />
                        </label>
                      ) : null}
                      <div className="mt-3 flex flex-wrap gap-2">
                        {outcome.state === "PROPOSED" ? <button className="btn primary" type="button" disabled={busy || outcomeBusyId !== null} onClick={() => void runTransition(outcome, "SUBMIT_FOR_REVIEW")}>إرسال للمراجعة</button> : null}
                        {outcome.state === "IN_REVIEW" ? (
                          <>
                            <button className="btn primary" type="button" disabled={busy || outcomeBusyId !== null || !actionReason.trim()} onClick={() => void runTransition(outcome, "APPROVE", { reason: actionReason })}>اعتماد</button>
                            <button className="btn secondary" type="button" disabled={busy || outcomeBusyId !== null || !actionReason.trim()} onClick={() => void runTransition(outcome, "REJECT", { reason: actionReason })}>رفض مع السبب</button>
                          </>
                        ) : null}
                        {outcome.state === "APPROVED" ? <button className="btn primary" type="button" disabled={busy || outcomeBusyId !== null || !user?.profileId} onClick={() => user?.profileId && void runTransition(outcome, "ASSIGN", { ownerProfileId: user.profileId })}>تعيين لنفسي</button> : null}
                        {outcome.state === "ASSIGNED" ? <button className="btn primary" type="button" disabled={busy || outcomeBusyId !== null} onClick={() => void runTransition(outcome, "START_EXECUTION")}>بدء التنفيذ</button> : null}
                        {outcome.state === "EXECUTING" ? <button className="btn primary" type="button" disabled={busy || outcomeBusyId !== null} onClick={() => void runTransition(outcome, "COMPLETE_EXECUTION")}>إتمام التنفيذ</button> : null}
                        {outcome.state === "EXECUTED" ? (
                          <button className="btn primary" type="button" disabled={busy || outcomeBusyId !== null || !proof} onClick={() => proof && void runTransition(outcome, "MEASURE", { proof })}>
                            قياس من مصدر {currency ?? "غير متاح"}
                          </button>
                        ) : null}
                        {busy ? <span role="status" className="self-center text-xs">جارٍ تسجيل الحدث...</span> : null}
                      </div>
                      {outcome.state === "EXECUTED" && !proof ? <p className="mt-2 text-xs text-muted-foreground">القياس محجوب: لا توجد حزمة إثبات كاملة للعملة والفترة المطابقتين تماماً.</p> : null}
                      <footer className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                        {outcome.history.map((event) => <span key={event.id} className="me-3">{event.version}. {event.type} · {event.actorRole} · {formatDay(event.at.slice(0, 10))}</span>)}
                      </footer>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>

          {outcomeMessage ? <div className="panel" role="status">{outcomeMessage}</div> : null}
          {[...data?.warnings ?? [], ...data?.schedule.warnings ?? []].length ? (
            <section className="panel" role="status"><h2>تنبيهات جودة البيانات</h2><ul className="list-disc space-y-1 ps-5">{[...new Set([...(data?.warnings ?? []), ...(data?.schedule.warnings ?? [])])].map((warning) => <li key={warning}>{warning}</li>)}</ul></section>
          ) : null}
          <p className="report-note">وقت الاحتساب: {data?.asOf ?? "غير متاح"} · مصدر الهوية والصلاحية والنطاق: الخادم. لا يرسل المتصفح معرّف المؤسسة أو الدور في طلبات البيانات.</p>

          <section className="panel space-y-3">
            <h2>محركات ذكاء الأعمال الأخرى</h2>
            <p className="report-note">هذه البطاقات لا تعرض أرقاماً تقديرية. لن تُفتح إلا عند وصول DTO موثق من مصدر المؤسسة.</p>
            <div className="grid gap-3 lg:grid-cols-2">
              <EvidencePassport state="unavailable" />
              <LiquiditySummary state="unavailable" />
              <CashflowForecastCard state="unavailable" />
              <DeadStockCard state="unavailable" />
              <ReplenishmentCard state="unavailable" />
              <ActionCard state="unavailable" />
            </div>
          </section>
        </>
      )}
    </section>
  );
}
