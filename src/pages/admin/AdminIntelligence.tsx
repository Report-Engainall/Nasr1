import { useCallback, useEffect, useMemo, useState } from "react";
import { BrainCircuit, CalendarClock, RefreshCw } from "lucide-react";
import { createCashflowScheduleRequest, fetchCashflowSchedule, type CashflowScheduleResult } from "@/lib/intelligence/cashflow-schedule-client";

type Horizon = 7 | 30 | 90;
const formatDay = (value: string) => new Date(value + "T00:00:00.000Z").toLocaleDateString("ar-YE", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
const formatMoney = (value: number, currency: string) => new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(value) + " " + currency;

export default function AdminIntelligence() {
  const [horizon, setHorizon] = useState<Horizon>(30);
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState<CashflowScheduleResult | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (active: () => boolean) => {
    setLoading(true);
    const request = createCashflowScheduleRequest({ horizonDays: horizon });
    const response = await fetchCashflowSchedule(request);
    if (!active()) return;
    setResult(response);
    setLoading(false);
  }, [horizon]);

  useEffect(() => {
    let mounted = true;
    void load(() => mounted);
    return () => { mounted = false; };
  }, [load, refreshKey]);

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

  return (
    <section dir="rtl" className="space-y-4">
      <header className="panel">
        <div className="panel-head">
          <div>
            <div className="flex items-center gap-2"><BrainCircuit size={22} /><h1>ذكاء الأعمال والتحصيلات</h1></div>
            <p className="report-note">جدول الاستحقاقات المبني على فواتير المؤسسة ومدفوعاتها المسجلة، دون افتراض نسب تحصيل.</p>
          </div>
          <button type="button" className="btn secondary" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading}>
            <RefreshCw size={16} /> تحديث
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm"><CalendarClock size={16} /> أفق العرض</label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="فترة جدول التدفق النقدي">
            {([7, 30, 90] as const).map((value) => (
              <button key={value} type="button" className={horizon === value ? "btn primary" : "btn secondary"} aria-pressed={horizon === value} onClick={() => setHorizon(value)} disabled={loading}>
                {value} يومًا
              </button>
            ))}
          </div>
        </div>
      </header>

      {loading ? <div className="panel" role="status">جارٍ تحميل جدول التحصيل من قاعدة البيانات...</div> : null}
      {!loading && result && !result.ok ? (
        <div className="panel" role="alert"><p>{result.message}</p></div>
      ) : null}
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
                    <article className="report-metric" key={currency}><span>{currency}</span><strong>{formatMoney(amount, currency)}</strong><small>تحصيلات داخلة مطروحًا منها الالتزامات المجدولة الداخلة في هذا المصدر</small></article>
                  ))}
                </div>
              )}
            </section>
          ) : (
            <div className="panel" role="status"><strong>تم حجب الإجمالي والتوقع.</strong><p className="report-note">توجد فاتورة مستحقة بلا تاريخ استحقاق صالح أو تغطية غير مكتملة؛ لن تُحوّل البيانات المجهولة إلى صفر.</p></div>
          )}

          <section className="panel">
            <h2>سجل الاستحقاقات</h2>
            {data.schedule.entries.length === 0 ? <p className="report-note">لا توجد سجلات قابلة للعرض؛ راجع حالة التغطية والتنبيهات أعلاه.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr><th className="text-right">تاريخ الاستحقاق</th><th className="text-right">الاتجاه</th><th className="text-right">المبلغ</th><th className="text-right">مرجع الإثبات</th></tr></thead>
                  <tbody>
                    {data.schedule.entries.map((entry) => (
                      <tr key={entry.id} className="border-t">
                        <td className="p-2">{formatDay(entry.dueDate)}</td>
                        <td className="p-2">{entry.direction === "INFLOW" ? "تحصيل متوقع" : "التزام مجدول"}</td>
                        <td className="p-2 font-semibold">{formatMoney(entry.amount.value, entry.amount.currency)}</td>
                        <td className="p-2 text-muted-foreground">{entry.amount.lineage.evidenceIds.length} دليل · {entry.amount.lineage.formulaId}@{entry.amount.lineage.formulaVersion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {[...data.warnings, ...data.schedule.warnings].length ? (
            <section className="panel" role="status"><h2>تنبيهات جودة البيانات</h2><ul className="list-disc space-y-1 ps-5">{[...new Set([...data.warnings, ...data.schedule.warnings])].map((warning) => <li key={warning}>{warning}</li>)}</ul></section>
          ) : null}
          <p className="report-note">وقت الاحتساب: {data.asOf} · الصلاحية الفعلية التي تحقّق منها الخادم: {data.effectiveRole}. لا يتلقى المتصفح معرّف المؤسسة أو الدور لتحديد نطاق البيانات.</p>
        </>
      ) : null}
    </section>
  );
}
