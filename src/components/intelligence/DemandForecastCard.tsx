import { useState } from "react";
import { buildDemandScenario } from "@/lib/intelligence/demand-forecast";
import { buildDemandScenarioStockImpact } from "@/lib/intelligence/demand-scenario-stock-impact";
import type { ReplenishmentRecommendation } from "@/lib/intelligence/replenishment";
import type { DemandForecastResult, DemandScenarioResult, DemandTrend } from "@/lib/intelligence/demand-forecast";
import { buildDemandForecastCsv, downloadIntelligenceCsv } from "@/lib/intelligence/intelligence-csv";

export interface DemandForecastCardProps {
  result: DemandForecastResult | null;
  state: "loading" | "ready" | "unavailable" | "error";
  onRetry?: () => void;
  onSaveScenario?: (scenario: DemandScenarioResult) => Promise<boolean>;
  replenishmentRecommendations?: ReplenishmentRecommendation[] | null;
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

function DemandScenarioLab({ result, onSaveScenario, replenishmentRecommendations }: { result: DemandForecastResult; onSaveScenario?: (scenario: DemandScenarioResult) => Promise<boolean>; replenishmentRecommendations?: ReplenishmentRecommendation[] | null }) {
  const firstProduct = result.forecasts[0] ?? null;
  const [selectedProductRef, setSelectedProductRef] = useState(firstProduct?.productRef ?? "");
  const [changePercent, setChangePercent] = useState(0);
  const [savingScenario, setSavingScenario] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const selectedProduct = result.forecasts.find((item) => item.productRef === selectedProductRef) ?? firstProduct;
  const scenario = selectedProduct
    ? buildDemandScenario({ forecast: result, productRef: selectedProduct.productRef, changePercent })
    : null;
  const stockImpact = scenario
    ? buildDemandScenarioStockImpact({ scenario, recommendations: replenishmentRecommendations })
    : null;

  if (!selectedProduct || !scenario) return null;

  async function saveScenario() {
    if (!onSaveScenario || !scenario || scenario.status !== "SIMULATED" || savingScenario) return;
    setSavingScenario(true);
    setSaveMessage(null);
    try {
      const saved = await onSaveScenario(scenario);
      setSaveMessage(saved
        ? "تم تأكيد إرسال السيناريو إلى دورة القرارات كمقترح يحتاج مراجعة؛ لم يُعتمد أو يُنفذ."
        : "لم يتأكد حفظ السيناريو؛ راجع دورة القرارات وحالة الاتصال قبل إعادة المحاولة.");
    } catch {
      setSaveMessage("تعذر تأكيد حفظ السيناريو؛ راجع دورة القرارات قبل إعادة المحاولة.");
    } finally {
      setSavingScenario(false);
    }
  }

  const withheldReasons: Record<string, string> = {
    ASSUMPTION_OUT_OF_BOUNDS: "النسبة خارج النطاق المسموح من ‎-100% إلى ‎+300%.",
    DEMAND_SOURCE_NOT_VERIFIED: "المصدر أو كامل مجتمع المنتجات يحتاج إلى مراجعة؛ لذلك حُجبت المحاكاة.",
    DEMAND_SOURCE_POPULATION_INCOMPLETE: "مجتمع المنتجات غير مكتمل؛ لا يمكن تعميم السيناريو.",
    PRODUCT_NOT_UNIQUELY_AVAILABLE: "المنتج غير محدد بصورة فريدة في لقطة التوقع.",
    PRODUCT_EVIDENCE_INCOMPLETE: "أدلة المنتج أو فترة القياس أو معادلة المصدر غير مكتملة.",
    HORIZON_SET_INVALID: "آفاق التوقع لا تطابق 7 و30 و90 يوماً.",
    HORIZON_QUANTITY_INVALID: "كميات الأساس غير صالحة أو غير مرتبة.",
    SCENARIO_QUANTITY_UNSAFE: "نتيجة المحاكاة تجاوزت حدود الدقة الآمنة.",
  };

  return (
    <section dir="rtl" role="region" aria-label="مختبر ماذا لو" className="rounded-xl border p-4 space-y-3">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">مختبر ماذا لو — سيناريو الطلب</h3>
          <p className="text-xs text-muted-foreground">
            غيّر معدل الطلب افتراضياً لقياس أثره على كميات 7 و30 و90 يوماً. لا يُعد ذلك توقعاً جديداً أو أمراً بالشراء.
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs">محاكاة غير تنفيذية</span>
      </header>

      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <label className="space-y-1 text-sm">
          <span className="font-medium">المنتج محل المحاكاة</span>
          <select
            aria-label="المنتج محل المحاكاة"
            className="input w-full"
            value={selectedProduct.productRef}
            onChange={(event) => setSelectedProductRef(event.target.value)}
          >
            {result.forecasts.map((product) => (
              <option key={product.productRef} value={product.productRef}>{product.productLabel} · {product.unitOfMeasure}</option>
            ))}
          </select>
        </label>
        <div className="space-y-2">
          <label htmlFor="demand-scenario-change" className="flex items-center justify-between gap-2 text-sm">
            <span className="font-medium">نسبة تغير الطلب المفترضة</span>
            <output className="font-semibold tabular-nums" aria-live="polite">
              {changePercent > 0 ? "+" : ""}{changePercent}%
            </output>
          </label>
          <input
            id="demand-scenario-change"
            aria-label="نسبة تغير الطلب المفترضة"
            className="w-full"
            type="range"
            min={-100}
            max={300}
            step={5}
            value={changePercent}
            onChange={(event) => setChangePercent(Number(event.target.value))}
          />
          <div className="flex justify-between text-xs text-muted-foreground"><span>‎-100%</span><span>0%</span><span>‎+300%</span></div>
        </div>
      </div>

      {scenario.status === "SIMULATED" ? (
        <>
          <div className="rounded-lg bg-muted/40 p-3 text-sm" role="status" aria-live="polite">
            <strong>{selectedProduct.productLabel}</strong> · افتراض التغير: <strong>{changePercent > 0 ? "+" : ""}{changePercent}%</strong> ·
            الفترة المرجعية: {scenario.period?.from} — {scenario.period?.to} · لقطة المصدر: {scenario.asOf}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead>
                <tr className="border-b text-right">
                  <th className="p-2">الأفق</th>
                  <th className="p-2">الأساس منخفض</th>
                  <th className="p-2">الأساس المتوقع</th>
                  <th className="p-2">الأساس مرتفع</th>
                  <th className="p-2">السيناريو منخفض</th>
                  <th className="p-2">السيناريو المتوقع</th>
                  <th className="p-2">السيناريو مرتفع</th>
                  <th className="p-2">فرق المتوقع</th>
                </tr>
              </thead>
              <tbody>
                {scenario.horizons.map((horizon) => (
                  <tr key={horizon.days} className="border-b last:border-0">
                    <td className="p-2 font-medium">{horizon.days} يوم</td>
                    <td className="p-2">{formatQuantity(horizon.baselineLowQuantity, scenario.unitOfMeasure ?? "")}</td>
                    <td className="p-2 font-semibold">{formatQuantity(horizon.baselineExpectedQuantity, scenario.unitOfMeasure ?? "")}</td>
                    <td className="p-2">{formatQuantity(horizon.baselineHighQuantity, scenario.unitOfMeasure ?? "")}</td>
                    <td className="p-2">{formatQuantity(horizon.scenarioLowQuantity, scenario.unitOfMeasure ?? "")}</td>
                    <td className="p-2 font-semibold">
                      <output data-testid={"demand-scenario-expected-" + horizon.days} data-value={String(horizon.scenarioExpectedQuantity)}>
                        {formatQuantity(horizon.scenarioExpectedQuantity, scenario.unitOfMeasure ?? "")}
                      </output>
                    </td>
                    <td className="p-2">{formatQuantity(horizon.scenarioHighQuantity, scenario.unitOfMeasure ?? "")}</td>
                    <td className="p-2">{formatQuantity(horizon.expectedDeltaQuantity, scenario.unitOfMeasure ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            الأدلة: {scenario.evidenceIds.length} · مؤشرات المصدر: {scenario.metricKeys.length} · نسخ المعادلات: {scenario.formulaVersions.length}.
            الحساب مبني على كميات بنود الطلب، وليس كميات تم شحنها أو مبيعات محققة. النطاق المنخفض/المرتفع مرصود وليس فاصل ثقة إحصائياً.
          </p>
        </>
      ) : (
        <p role="alert" className="rounded-lg border p-3 text-sm">
          {withheldReasons[scenario.reason ?? ""] ?? "تعذر التحقق من مدخلات السيناريو؛ لم تُعرض نتيجة افتراضية."}
        </p>
      )}

          {stockImpact ? (
        <section className="rounded-lg border p-3 space-y-3" aria-label="أثر السيناريو على تغطية المخزون">
          <div>
            <h4 className="font-semibold">أثر السيناريو على تغطية المخزون</h4>
            <p className="text-xs text-muted-foreground">
              إسقاط تحليلي على كمية المتاح للتخصيص (ATP) ونقطة إعادة الطلب من لقطة المخزون المطابقة؛ لا تُحتسب أوامر الشراء الواردة لعدم وجود تاريخ استلام موثوق في هذا الملخص.
            </p>
          </div>
          {stockImpact.status === "READY" ? (
            <>
              <div className="grid gap-2 sm:grid-cols-3 text-sm">
                <div className="rounded-md bg-muted/40 p-2"><span className="text-xs text-muted-foreground">المتاح للتخصيص</span><strong className="block">{formatQuantity(stockImpact.availableToPromise ?? 0, stockImpact.quantityUnit ?? "")}</strong></div>
                <div className="rounded-md bg-muted/40 p-2"><span className="text-xs text-muted-foreground">نقطة إعادة الطلب</span><strong className="block">{formatQuantity(stockImpact.reorderPoint ?? 0, stockImpact.quantityUnit ?? "")}</strong></div>
                <div className="rounded-md bg-muted/40 p-2"><span className="text-xs text-muted-foreground">أدلة المخزون/الطلب</span><strong className="block">{stockImpact.inventoryEvidenceIds.length} / {stockImpact.demandEvidenceIds.length}</strong></div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-xs">
                  <thead><tr className="border-b text-right">
                    <th className="p-2">الأفق</th><th className="p-2">طلب الأساس</th><th className="p-2">طلب السيناريو</th>
                    <th className="p-2">المتبقي الأساسي من ATP</th><th className="p-2">المتبقي في السيناريو</th><th className="p-2">العجز المحتمل</th>
                  </tr></thead>
                  <tbody>{stockImpact.horizons.map(item => (
                    <tr key={item.days} className="border-b last:border-0">
                      <td className="p-2 font-medium">{item.days} يوم</td>
                      <td className="p-2">{formatQuantity(item.baselineDemand.expected, stockImpact.quantityUnit ?? "")}</td>
                      <td className="p-2 font-semibold">{formatQuantity(item.scenarioDemand.expected, stockImpact.quantityUnit ?? "")}</td>
                      <td className="p-2">{formatQuantity(item.baselineRemainingAtp, stockImpact.quantityUnit ?? "")}</td>
                      <td className="p-2">{formatQuantity(item.scenarioRemainingAtp, stockImpact.quantityUnit ?? "")}</td>
                      <td className="p-2">{formatQuantity(item.scenarioPotentialShortfall, stockImpact.quantityUnit ?? "")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              {stockImpact.leadTime ? (
                <p className="text-xs">
                  <strong>مهلة المورد (ضمن أفق {stockImpact.leadTime.sourceHorizonDays} يوم):</strong>
                  طلب الأساس {formatQuantity(stockImpact.leadTime.baselineDemand.expected, stockImpact.quantityUnit ?? "")}،
                  والسيناريو {formatQuantity(stockImpact.leadTime.scenarioDemand.expected, stockImpact.quantityUnit ?? "")}،
                  والمتبقي من ATP {formatQuantity(stockImpact.leadTime.scenarioRemainingAtp, stockImpact.quantityUnit ?? "")}،
                  والعجز المحتمل {formatQuantity(stockImpact.leadTime.scenarioPotentialShortfall, stockImpact.quantityUnit ?? "")}.
                  {stockImpact.leadTime.belowReorderPoint ? " يتراجع المتبقي دون نقطة إعادة الطلب." : " المتبقي لا يقل عن نقطة إعادة الطلب في هذا الإسقاط."}
                </p>
              ) : null}
              <p className="text-xs text-muted-foreground">الأدلة متطابقة مع توقع المنتج واللقطة المستخدمة في محرك إعادة التوريد. هذه حساسية افتراضية وليست رصيداً مرحلاً أو تأكيد نفاد؛ ولا تنشئ أمر شراء.</p>
            </>
          ) : (
            <p role="status" className="text-sm text-muted-foreground">حُجب إسقاط المخزون: {stockImpact.reason}. يلزم تطابق المنتج والوحدة وأدلة الطلب ومؤشراته مع لقطة مخزون موثقة.</p>
          )}
        </section>
      ) : null}
      {onSaveScenario ? (
            <div className="flex flex-wrap items-center gap-2 border-t pt-3">
              <button
                type="button"
                className="btn primary"
                onClick={() => void saveScenario()}
                disabled={savingScenario || scenario.status !== "SIMULATED"}
              >
                {savingScenario ? "جارٍ حفظ المقترح..." : "حفظ السيناريو في دورة القرارات"}
              </button>
              <span className="text-xs text-muted-foreground">يحفظ كسجل مقترح قابل للمراجعة، ولا يغيّر أي سجل تجاري.</span>
            </div>
          ) : null}
          {saveMessage ? <p role="status" aria-live="polite" className="text-xs text-muted-foreground">{saveMessage}</p> : null}
      <p className="text-xs text-muted-foreground">
        الافتراض يدوي وغير محفوظ كحقيقة محاسبية. لا يغيّر الطلبات أو المخزون أو أوامر الشراء أو الأسعار أو الحسابات.
      </p>
    </section>
  );
}

export function DemandForecastCard({ result, state, onRetry, onSaveScenario, replenishmentRecommendations }: DemandForecastCardProps) {
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
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border px-3 py-1 text-xs">
            {result.status === "VERIFIED" ? "مصدر مكتمل" : "بحاجة إلى مراجعة"}
          </span>
          {result.forecasts.length > 0 || result.withheld.length > 0 ? (
            <button
              type="button"
              className="btn secondary btn-sm"
              onClick={() => downloadIntelligenceCsv(buildDemandForecastCsv(result), "aghbari-demand-forecast.csv")}
            >
              تصدير توقعات الطلب CSV
            </button>
          ) : null}
        </div>
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
      {result.forecasts.length > 0 ? <DemandScenarioLab result={result} onSaveScenario={onSaveScenario} replenishmentRecommendations={replenishmentRecommendations} /> : null}
      {onRetry ? <button type="button" className="btn secondary" onClick={onRetry}>تحديث التوقع</button> : null}
    </section>
  );
}
