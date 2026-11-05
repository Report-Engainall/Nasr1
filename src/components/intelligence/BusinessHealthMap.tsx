import type { BusinessHealthMapResult, BusinessHealthCurrencyPosition } from "@/lib/intelligence/business-health-map";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface BusinessHealthMapProps {
  result?: BusinessHealthMapResult | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}
const money = (value: number | null, currency: string) => value === null ? "غير متاح" : formatEvidenceNumber(value) + " " + currency;

function CurrencyHealthCard({ position }: { position: BusinessHealthCurrencyPosition }) {
  const rows = [
    ["صافي السيولة المتاحة", position.netAvailableLiquidity, "الصافي = الرصيد المتاح + التحصيلات المتوقعة − الالتزامات المستحقة"],
    ["التحصيلات المتوقعة — ضمن الصافي", position.expectedCollections, "لا تُجمع مرة ثانية مع صافي السيولة"],
    ["الذمم المتأخرة", position.overdueReceivables, "عرض منفصل؛ لا تضاف إلى التحصيلات أو الصافي"],
    ["الالتزامات المستحقة — مخصومة من الصافي", position.dueObligations, "لا تُخصم مرة ثانية"],
    ["تعرض المخزون الراكد — رأس مال غير نقدي", position.stagnantStockExposure, "لا يخصم من النقد"],
  ] as const;
  return (
    <article className="rounded-xl border bg-card p-4 text-card-foreground">
      <header className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{position.currency}</h3>
        <span className="text-xs"><EvidenceStatusLabel status={position.status} /></span>
      </header>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {rows.map(([label, item, note]) => (
          <div key={label} className="rounded-lg border p-3">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="font-semibold">{money(item.value, position.currency)}</dd>
            <p className="text-xs"><EvidenceStatusLabel status={item.status} /> · {note}</p>
            <p className="text-xs">الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
            <EvidenceWarnings warnings={item.note ? [item.note] : []} />
          </div>
        ))}
      </dl>
      <EvidenceWarnings warnings={position.warnings} />
    </article>
  );
}
export function BusinessHealthMap({ result = null, state = "ready", onRetry }: BusinessHealthMapProps) {
  const effective = state === "ready" && !result ? "unavailable" : state;
  if (effective !== "ready") return <IntelligenceStatePanel state={effective} onRetry={onRetry} errorMessage="تعذر تحميل خريطة صحة العمل." />;
  if (!result) return <IntelligenceStatePanel state="unavailable" unavailableMessage="مصادر خريطة صحة العمل غير متاحة؛ لا توجد بيانات بديلة." />;
  const currencies = [...new Set(result.cashflow.map(point => point.currency))];
  return (
    <section dir="rtl" className="space-y-4 rounded-xl border p-4" aria-label="خريطة صحة العمل ورأس المال المحجوز">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">خريطة صحة العمل ورأس المال المحجوز</h2>
          <p className="text-xs text-muted-foreground">حتى {result.asOf} · سياسة {result.policyVersion} · {result.period.from} — {result.period.to}</p>
        </div>
        <span className="text-xs"><EvidenceStatusLabel status={result.status} /></span>
      </header>
      <p className="text-sm text-muted-foreground">كل مبلغ يبقى بعملته ومصدره. لا تجمع المكونات المتداخلة، ولا تخصم تكلفة المخزون الراكد من الرصيد النقدي.</p>
      <section className="space-y-2">
        <h3 className="font-semibold">السيولة ومكونات رأس المال</h3>
        {result.currencies.length ? <div className="grid gap-3 xl:grid-cols-2">{result.currencies.map(position => <CurrencyHealthCard key={position.currency} position={position} />)}</div> : <p className="text-sm">لا توجد مراكز سيولة حسب العملة.</p>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">التدفق النقدي المجدول</h3>
        <p className="text-xs text-muted-foreground">الأفق 7 / 30 / 90 يوماً مستقل لكل عملة؛ الفترات الثلاث لا تُجمع معاً.</p>
        {currencies.length ? currencies.map(currency => (
          <article key={currency} className="rounded-lg border p-3">
            <h4 className="font-semibold">{currency}</h4>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="border-b text-right text-xs text-muted-foreground">
                  <th className="p-2">الأفق</th><th className="p-2">داخل</th><th className="p-2">خارج</th><th className="p-2">الرصيد المتوقع</th><th className="p-2">الحالة</th>
                </tr></thead>
                <tbody>{result.cashflow.filter(point => point.currency === currency).sort((a,b)=>a.horizonDays-b.horizonDays).map(point => (
                  <tr key={point.horizonDays} className="border-b last:border-0">
                    <td className="p-2">{point.horizonDays} يوم</td>
                    <td className="p-2">{money(point.knownInflows,currency)}</td>
                    <td className="p-2">{money(point.knownOutflows,currency)}</td>
                    <td className="p-2 font-semibold">{money(point.projectedBalance,currency)}</td>
                    <td className="p-2"><EvidenceStatusLabel status={point.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </article>
        )) : <p className="text-sm text-muted-foreground">جدول التدفق النقدي غير متاح.</p>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">حركة المخزون</h3>
        <p className="text-sm">عدد الأصناف: {formatEvidenceNumber(result.stock.totalProducts)} · <EvidenceStatusLabel status={result.stock.status} /></p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {result.stock.classes.map(item => <article key={item.classification} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{item.classification}</p>
            <p className="font-semibold">{formatEvidenceNumber(item.count)}</p>
            <EvidenceStatusLabel status={item.status} />
          </article>)}
        </div>
        {result.stock.totalsByCurrency.map(item => <article key={item.currency} className="rounded-lg border p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><span>التعرض الراكد · {item.currency}</span><strong>{money(item.exposure,item.currency)}</strong></div>
          <p className="text-xs"><EvidenceStatusLabel status={item.status} /> · مثبت: {item.verifiedItems} · محجوب: {item.withheldItems}</p>
          <p className="text-xs">الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
        </article>)}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">إعادة التوريد</h3>
        <p className="text-sm"><EvidenceStatusLabel status={result.replenishment.status} /> · توصيات مثبتة: {formatEvidenceNumber(result.replenishment.recommendedCount)} · لا إجراء: {formatEvidenceNumber(result.replenishment.noActionCount)} · محجوب: {formatEvidenceNumber(result.replenishment.withheldCount)}</p>
        {result.replenishment.recommendations.map(item => <article key={item.productRef} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
          <span>{item.productRef}</span><strong>{formatEvidenceNumber(item.quantity)} {item.quantityUnit}</strong>
          <p className="w-full text-xs">الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
        </article>)}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">تركيز الإيراد حسب العملاء</h3>
        {result.customerFocus.length ? result.customerFocus.map(item => <article key={item.currency} className="flex flex-wrap justify-between gap-2 rounded-lg border p-3 text-sm">
          <span>{item.currency}</span><span>تركيز أعلى 5: {item.top5SalesConcentration === null ? "غير متاح" : formatEvidenceNumber(item.top5SalesConcentration) + "%"}</span>
          <span>العملاء: {formatEvidenceNumber(item.customerCount)} · <EvidenceStatusLabel status={item.status} /></span>
        </article>) : <p className="text-sm text-muted-foreground">تركيز العملاء غير متاح من مصدر مكتمل.</p>}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">مؤشرات لا يمكن حسابها بالمدخلات الحالية</h3>
        {Object.entries(result.calculations).map(([key,item]) => <article key={key} className="rounded-lg border p-3 text-sm">
          <h4 className="font-semibold">{key}</h4><p>{item.reason}</p>
          <p className="text-xs text-muted-foreground">المدخلات المطلوبة: {item.missingInputs.join("، ")}</p>
        </article>)}
      </section>
      <section className="space-y-2">
        <h3 className="font-semibold">ما يستحق الانتباه</h3>
        {result.attention.length ? result.attention.map(item => <article key={item.id} className="rounded-lg border p-3">
          <p className="text-sm font-medium">{item.message}</p>
          {item.value !== null ? <p className="text-sm">{formatEvidenceNumber(item.value)} {item.unit}</p> : null}
          <p className="text-xs text-muted-foreground">المصدر: {item.source} · الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
        </article>) : <p className="text-sm text-muted-foreground">لا توجد استثناءات مثبتة في المدخلات المتاحة.</p>}
      </section>
      <section className="rounded-lg border p-3">
        <h3 className="font-semibold">إجمالي رأس المال المعرض للمخاطر</h3>
        <p className="mt-1 text-sm font-semibold">غير محسوب</p>
        <p className="text-xs text-muted-foreground">{result.totalCapitalAtRiskReason}</p>
      </section>
      <EvidenceWarnings warnings={result.warnings} />
    </section>
  );
}
