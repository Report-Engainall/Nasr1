import type { DemandForecastResult, DemandTrend } from "@/lib/intelligence/demand-forecast";

export interface DemandForecastCardProps {
  result: DemandForecastResult | null;
  state: "loading" | "ready" | "unavailable" | "error";
  onRetry?: () => void;
}

const trendLabels: Record<DemandTrend, string> = {
  INCREASING: "طلب متزايد",
  DECLINING: "طلب متراجع",
  STABLE: "طلب مستقر نسبياً",
  NEW_ACTIVITY: "طلب جديد في الفترة",
  NO_DEMAND: "لا توجد كمية طلب في الفترتين",
};

const formatQuantity = (value: number, unit: string) =>
  new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 6 }).format(value) + " " + unit;

export function DemandForecastCard({ result, state, onRetry }: DemandForecastCardProps) {
  if (state !== "ready" || !result) {
    return (
      <section dir="rtl" className="panel space-y-2" aria-label="توقع الطلب">
        <h2 className="font-semibold">توقع الطلب حسب المنتج</h2>
        <p role={state === "error" ? "alert" : "status"} className="text-sm text-muted-foreground">
          {state === "loading"
            ? "جارٍ قراءة كميات الطلبات الموثقة..."
            : state === "error"
              ? "تعذر تحميل توقع الطلب من مصدر المؤسسة."
              : "مصدر توقع الطلب غير متاح؛ لم تُنشأ توقعات بديلة."}
        </p>
        {onRetry ? <button type="button" className="btn secondary" onClick={onRetry}>إعادة المحاولة</button> : null}
      </section>
    );
  }

  return (
    <section dir="rtl" className="panel space-y-3" aria-label="توقع الطلب">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">توقع الطلب حسب المنتج</h2>
          <p className="report-note">توقع حتمي من متوسط كميات بنود الطلب المؤكدة في فترتين متجاورتين متساويتين؛ لا يمثل مبيعات مسلّمة أو وعداً بالطلب القادم.</p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs">
          {result.status === "VERIFIED" ? "مصدر مكتمل" : "بحاجة إلى مراجعة"}
        </span>
      </header>

      <div className="text-xs text-muted-foreground">
        الفترة الحالية: {result.period.from} — {result.period.to} ·
        فترة الأساس: {result.baselinePeriod.from} — {result.baselinePeriod.to} ·
        اللقطة: {result.asOf}
      </div>

      {result.forecasts.length === 0 ? (
        <p role="status" className="rounded-lg border p-3 text-sm">
          لا يوجد منتج تتوافر له عينة ووحدة قياس وفترتان صالحتان لبناء توقع الطلب.
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {result.forecasts.map((forecast) => (
          <article key={forecast.productRef} className="rounded-lg border p-3 space-y-3">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold">{forecast.productLabel}</h3>
                <p className="text-xs text-muted-foreground">{forecast.productRef} · {trendLabels[forecast.trend]}</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {forecast.changePercentHundredths === null
                  ? "لا توجد نسبة مقارنة معرفة"
                  : (forecast.changePercentHundredths / 100).toFixed(2) + "%"}
              </span>
            </header>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <p className="rounded-md bg-muted/40 p-2">معدل الفترة الحالية: <strong>{formatQuantity(forecast.currentDailyDemand, forecast.unitOfMeasure)}/يوم</strong></p>
              <p className="rounded-md bg-muted/40 p-2">معدل فترة الأساس: <strong>{formatQuantity(forecast.baselineDailyDemand, forecast.unitOfMeasure)}/يوم</strong></p>
              <p className="rounded-md bg-muted/40 p-2">طلبات العينة الحالية: <strong>{forecast.currentOrders}</strong></p>
              <p className="rounded-md bg-muted/40 p-2">طلبات عينة الأساس: <strong>{forecast.baselineOrders}</strong></p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-right">
                    <th className="p-2">الأفق</th>
                    <th className="p-2">منخفض</th>
                    <th className="p-2">أساسي</th>
                    <th className="p-2">مرتفع</th>
                  </tr>
                </thead>
                <tbody>
                  {forecast.horizons.map((horizon) => (
                    <tr key={horizon.days} className="border-b last:border-0">
                      <td className="p-2 font-medium">{horizon.days} يوم</td>
                      <td className="p-2">{formatQuantity(horizon.lowQuantity, forecast.unitOfMeasure)}</td>
                      <td className="p-2 font-semibold">{formatQuantity(horizon.expectedQuantity, forecast.unitOfMeasure)}</td>
                      <td className="p-2">{formatQuantity(horizon.highQuantity, forecast.unitOfMeasure)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">النطاق المنخفض/المرتفع هو نطاق المعدل المرصود بين الفترتين، وليس فاصل ثقة إحصائياً. لا يتضمن الموسمية أو العروض أو فترات نفاد المخزون.</p>
          </article>
        ))}
      </div>

      {result.withheld.length > 0 ? (
        <details className="rounded-lg border p-3 text-xs">
          <summary className="cursor-pointer font-semibold">المنتجات المحجوبة عن التوقع ({result.withheld.length})</summary>
          <ul className="mt-2 list-disc space-y-1 ps-4">
            {result.withheld.map((item, index) => (
              <li key={item.signalId + ":" + index}>{item.productRef || "منتج غير محدد"} · {item.reason}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {result.warnings.length > 0 ? (
        <details className="rounded-lg border p-3 text-xs">
          <summary className="cursor-pointer font-semibold">حدود جودة البيانات ({result.warnings.length})</summary>
          <ul className="mt-2 list-disc space-y-1 ps-4">
            {result.warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </details>
      ) : null}
      {onRetry ? <button type="button" className="btn secondary" onClick={onRetry}>تحديث التوقع</button> : null}
    </section>
  );
}
