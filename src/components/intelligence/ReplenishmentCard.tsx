import type { ReplenishmentRecommendation } from "@/lib/intelligence/replenishment";
import type { ProductDemandForecast } from "@/lib/intelligence/demand-forecast";
import { useEffect, useRef, useState } from "react";
import { fetchProducts } from "@/lib/api";
import { buildReplenishmentCsv, downloadIntelligenceCsv } from "@/lib/intelligence/intelligence-csv";
import { ReplenishmentPurchaseDraft } from "./ReplenishmentPurchaseDraft";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export type ReplenishmentTriageFilter = "ALL" | "URGENT" | "SCENARIO" | "RECOMMENDED" | "NO_ACTION" | "WITHHELD";

function leadTimeDeficit(item:ReplenishmentRecommendation):number {
 return item.status==="VERIFIED"&&item.action==="RECOMMEND"&&
  typeof item.coveredAfterIncoming==="number"&&typeof item.leadTimeDemand==="number"
  ? Math.max(0,item.leadTimeDemand-item.coveredAfterIncoming) : 0;
}
function upperScenarioGap(item:ReplenishmentRecommendation):boolean {
 const forecast=item.forecastLeadTimeDemand;
 return item.status==="VERIFIED"&&item.demandSource==="FORECAST"&&forecast!==null&&
  typeof item.coveredAfterIncoming==="number"&&
  item.coveredAfterIncoming>=forecast.expectedQuantity&&item.coveredAfterIncoming<forecast.highQuantity;
}
export function selectReplenishmentRecommendations(
 recommendations:ReplenishmentRecommendation[],
 filter:ReplenishmentTriageFilter="ALL",
 query="",
 productNames:Record<string,string>={},
):ReplenishmentRecommendation[] {
 const normalized=query.trim().toLocaleLowerCase("ar");
 const selected=recommendations.filter(item=>{
  const searchable=(item.productRef+" "+(productNames[item.productRef]??"")).toLocaleLowerCase("ar");
  if(normalized&&!searchable.includes(normalized))return false;
  switch(filter){
   case "URGENT":return leadTimeDeficit(item)>0;
   case "SCENARIO":return upperScenarioGap(item);
   case "RECOMMENDED":return item.status==="VERIFIED"&&item.action==="RECOMMEND";
   case "NO_ACTION":return item.status==="VERIFIED"&&item.action==="NO_ACTION";
   case "WITHHELD":return item.status!=="VERIFIED"||item.action==="WITHHELD";
   default:return true;
  }
 });
 const rank=(item:ReplenishmentRecommendation)=>{
  if(leadTimeDeficit(item)>0)return 0;
  if(upperScenarioGap(item))return 1;
  if(item.status==="VERIFIED"&&item.action==="RECOMMEND")return 2;
  if(item.status==="VERIFIED"&&item.action==="NO_ACTION")return 3;
  return 4;
 };
 return selected.sort((left,right)=>
  rank(left)-rank(right)||leadTimeDeficit(right)-leadTimeDeficit(left)||left.productRef.localeCompare(right.productRef));
}

export interface ReplenishmentCardProps {
  recommendations?: ReplenishmentRecommendation[] | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
  canManagePurchases?: boolean;
  demandForecasts?: ProductDemandForecast[] | null;
}

export function ReplenishmentCard({ recommendations, state = "ready", onRetry, canManagePurchases = false, demandForecasts = null }: ReplenishmentCardProps) {
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [triageFilter, setTriageFilter] = useState<ReplenishmentTriageFilter>("ALL");
  const [searchText, setSearchText] = useState("");
  const [productNames, setProductNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    if (!recommendations?.length) {
      setProductNames({});
      return () => { active = false; };
    }
    void fetchProducts().then((products) => {
      if (!active) return;
      const labels: Record<string, string> = {};
      for (const product of products) {
        const name = typeof product.name === "string" ? product.name.trim() : "";
        if (!name) continue;
        labels[product.id] = name;
        const itemCode = typeof product.item_code === "string" ? product.item_code.trim() : "";
        if (itemCode && !labels[itemCode]) labels[itemCode] = name;
      }
      setProductNames(labels);
    }).catch(() => {
      if (active) setProductNames({});
    });
    return () => { active = false; };
  }, [recommendations]);
  // Keep retry keys alive while the purchase dialog is closed and reopened.
  const idempotencyKeys = useRef(new Map<string, string>());
  const [draftOpen, setDraftOpen] = useState(false);
  const selectableRecommendations = (recommendations ?? []).filter((item) =>
    item.status === "VERIFIED" && item.action === "RECOMMEND" &&
    item.recommendedQuantity !== null && item.recommendedQuantity > 0 &&
    typeof item.quantityUnit === "string" && item.quantityUnit.trim().length > 0
  );
  const selectedRecommendations = selectableRecommendations.filter((item) => selectedRefs.includes(item.productRef));
  const demandForecastByProduct = new Map((demandForecasts ?? []).map((item) => [item.productRef, item]));
  const sourceRecommendations = recommendations ?? [];
  const visibleRecommendations = selectReplenishmentRecommendations(sourceRecommendations, triageFilter, searchText, productNames);
  const triageOptions: { value: ReplenishmentTriageFilter; label: string; count: number }[] = [
    { value: "ALL", label: "الكل", count: sourceRecommendations.length },
    { value: "URGENT", label: "عجز خلال مهلة المورد", count: selectReplenishmentRecommendations(sourceRecommendations, "URGENT").length },
    { value: "SCENARIO", label: "فجوة أعلى سيناريو", count: selectReplenishmentRecommendations(sourceRecommendations, "SCENARIO").length },
    { value: "RECOMMENDED", label: "توصية شراء", count: selectReplenishmentRecommendations(sourceRecommendations, "RECOMMENDED").length },
    { value: "NO_ACTION", label: "لا يلزم شراء", count: selectReplenishmentRecommendations(sourceRecommendations, "NO_ACTION").length },
    { value: "WITHHELD", label: "محجوب للمراجعة", count: selectReplenishmentRecommendations(sourceRecommendations, "WITHHELD").length },
  ];
  const effectiveState = state === "ready" && !recommendations ? "unavailable" : state;
  if (effectiveState !== "ready") {
    return <IntelligenceStatePanel state={effectiveState} onRetry={onRetry} emptyMessage="لا توجد توصيات إعادة توريد للفترة المحددة." />;
  }
  if (!recommendations || recommendations.length === 0) {
    return <IntelligenceStatePanel state="empty" emptyMessage="لا توجد توصيات إعادة توريد للفترة المحددة." />;
  }

  return (
    <section dir="rtl" className="space-y-3" aria-label="توصيات إعادة التوريد">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">توصيات إعادة التوريد</h3>
          <span className="text-xs text-muted-foreground">يُخصم الوارد المؤكد من أوامر الشراء قبل التوصية؛ لا ينشئ هذا العرض أمر شراء تلقائيًا.</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn secondary btn-sm"
            disabled={!visibleRecommendations.length}
            onClick={() => downloadIntelligenceCsv(
              buildReplenishmentCsv(visibleRecommendations, productNames, sourceRecommendations.length),
              "aghbari-replenishment.csv",
            )}
          >
            تصدير نتائج التوريد CSV ({visibleRecommendations.length})
          </button>
          {canManagePurchases ? (
            <>
              <span className="text-xs text-muted-foreground">المحدد للمسودة: {selectedRecommendations.length}</span>
              <button type="button" className="btn primary btn-sm" disabled={!selectedRecommendations.length}
                onClick={() => setDraftOpen(true)}>إنشاء مسودة من المحدد</button>
            </>
          ) : null}
        </div>
      </header>
      <section className="space-y-2 rounded-lg border p-3" aria-label="فرز توصيات التوريد">
        <label className="grid gap-1 text-sm">
          <span>بحث باسم الصنف أو رقمه</span>
          <input type="search" aria-label="بحث توصيات التوريد" value={searchText}
            onChange={event => setSearchText(event.target.value)}
            placeholder="اكتب اسم الصنف أو رقمه" className="rounded-lg border bg-background px-3 py-2" />
        </label>
        <div className="flex flex-wrap gap-2">
          {triageOptions.map(option => (
            <button key={option.value} type="button" aria-pressed={triageFilter === option.value}
              onClick={() => setTriageFilter(option.value)}
              className={"rounded-lg border px-3 py-2 text-xs " + (triageFilter === option.value ? "bg-muted font-semibold" : "")}>
              {option.label} · {option.count}
            </button>
          ))}
        </div>
        <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
          {visibleRecommendations.length} من {sourceRecommendations.length} توصية؛ يبدأ الترتيب بعجز مهلة المورد المثبت، ثم فجوة السيناريو الأعلى.
        </p>
      </section>
      {visibleRecommendations.length === 0 ? (
        <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">لا توجد توصيات مطابقة للبحث والمرشح المختار.</p>
      ) : null}
      <div className="grid gap-3 md:grid-cols-2">
        {visibleRecommendations.map((item) => (
          <article key={item.productRef} aria-label={item.productRef} className="rounded-xl border bg-card p-4 text-card-foreground">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">{productNames[item.productRef] ?? item.productRef}</h4>
              {productNames[item.productRef] && productNames[item.productRef] !== item.productRef ? (
                <span className="text-xs text-muted-foreground">{item.productRef}</span>
              ) : null}
              <span className="text-xs"><EvidenceStatusLabel status={item.status} /></span>
            </header>
            {leadTimeDeficit(item) > 0 ? (
              <p className="mt-2 rounded-md border border-destructive/30 px-2 py-1 text-xs font-semibold">
                عجز مثبت خلال مهلة المورد: {formatEvidenceNumber(leadTimeDeficit(item))} {item.quantityUnit}
              </p>
            ) : upperScenarioGap(item) ? (
              <p className="mt-2 rounded-md border px-2 py-1 text-xs">
                التغطية تغطي الطلب المتوقع لكنها أقل من أعلى سيناريو مرصود
              </p>
            ) : null}
            <p className="mt-2 text-sm font-semibold">
              {item.action === "WITHHELD"
                ? "التوصية محجوبة؛ مدخلات المصدر غير مثبتة"
                : item.action === "NO_ACTION"
                  ? item.incomingPurchaseQuantity !== null && item.incomingPurchaseQuantity > 0
                    ? "المخزون والوارد المؤكد يغطيان الاحتياج"
                    : "لا توجد حاجة مثبتة لإعادة التوريد"
                  : "توجد توصية لإعادة التوريد"}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">المتاح للبيع (ATP)</dt><dd>{formatEvidenceNumber(item.availableToPromise)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">نقطة إعادة الطلب</dt><dd>{formatEvidenceNumber(item.reorderPoint)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الوارد المؤكد من أوامر الشراء</dt><dd>{formatEvidenceNumber(item.incomingPurchaseQuantity)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">التغطية بعد الوارد</dt><dd>{formatEvidenceNumber(item.coveredAfterIncoming)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الطلب اليومي المحسوب</dt><dd>{formatEvidenceNumber(item.dailyDemand)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">طلب مهلة التوريد</dt><dd>{formatEvidenceNumber(item.leadTimeDemand)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">المخزون المستهدف</dt><dd>{formatEvidenceNumber(item.targetStock)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الكمية الموصى بها</dt><dd className="font-semibold">{item.status === "VERIFIED" && item.quantityUnit ? formatEvidenceNumber(item.recommendedQuantity) + " " + item.quantityUnit : "غير متاح"}</dd></div>
            </dl>
            {item.demandSource === "FORECAST" && item.forecastLeadTimeDemand && item.demandTrend ? (
              <aside className="mt-3 rounded-lg border border-dashed p-3 text-xs" aria-label="أساس توقع الطلب المستخدم في إعادة التوريد">
                <p className="font-semibold">دخل توقع الطلب الموثق في حساب مهلة التوريد · {item.demandTrend === "INCREASING" ? "متزايد" : item.demandTrend === "DECLINING" ? "متراجع" : item.demandTrend === "NEW_ACTIVITY" ? "نشاط جديد" : item.demandTrend === "NO_DEMAND" ? "لا طلب مرصود" : "مستقر نسبياً"}</p>
                <p className="mt-1">نافذة المصدر: {item.forecastLeadTimeDemand.horizonDays} يوماً · المتوقع خلال مهلة المورد: {formatEvidenceNumber(item.forecastLeadTimeDemand.expectedQuantity)} {item.quantityUnit} · النطاق: {formatEvidenceNumber(item.forecastLeadTimeDemand.lowQuantity)}–{formatEvidenceNumber(item.forecastLeadTimeDemand.highQuantity)} {item.quantityUnit}</p>
                <p className="mt-1 text-muted-foreground">الكمية المقترحة حُسبت من الطلب المتوقع بعد خصم المتاح والوارد المؤكد ومراعاة نقطة إعادة الطلب. الحد الأعلى نطاق سيناريو مرصود وليس ضماناً أو أمراً آلياً. أدلة التوقع: <EvidenceReferences ids={item.forecastEvidenceIds} /></p>
              </aside>
            ) : demandForecastByProduct.get(item.productRef) ? (() => {
              const forecast = demandForecastByProduct.get(item.productRef)!;
              const thirty = forecast.horizons.find((horizon) => horizon.days === 30);
              const ninety = forecast.horizons.find((horizon) => horizon.days === 90);
              return (
                <aside className="mt-3 rounded-lg border border-dashed p-3 text-xs" aria-label="سياق توقع الطلب غير المستخدم">
                  <p className="font-semibold">توقع مستقل غير داخل في كمية التوريد؛ احتُفظ بالحساب التاريخي لعدم تطابق شروط المصدر</p>
                  <p className="mt-1">30 يوماً: {thirty ? formatEvidenceNumber(thirty.expectedQuantity) + " " + forecast.unitOfMeasure : "غير متاح"} · 90 يوماً: {ninety ? formatEvidenceNumber(ninety.expectedQuantity) + " " + forecast.unitOfMeasure : "غير متاح"}</p>
                  <p className="mt-1 text-muted-foreground">الفترة الحالية {forecast.period.from} — {forecast.period.to} والمقارنة {forecast.baselinePeriod.from} — {forecast.baselinePeriod.to}. كمية إعادة التوريد المعروضة لا تستخدم هذا التوقع.</p>
                </aside>
              );
            })() : item.demandSource === "HISTORICAL" ? (
              <p className="mt-3 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">أساس الكمية: معدل الاستهلاك التاريخي المثبت. لم يدخل توقع الطلب في الحساب لهذه اللقطة أو الصنف؛ راجع تحذيرات المصدر إن وجدت.</p>
            ) : null}
            <footer className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              <p>المعادلة: {item.formulaId}@{item.formulaVersion} · المتبقي = الهدف − (المتاح + الوارد المؤكد) · أساس الطلب: {item.demandSource === "FORECAST" ? "توقع موثق" : "استهلاك تاريخي"} · الشراء التلقائي: ممنوع</p>
              <p>مراجع الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
              <EvidenceWarnings warnings={item.warnings} />
              {canManagePurchases && item.status === "VERIFIED" && item.action === "RECOMMEND" &&
                item.recommendedQuantity !== null && item.recommendedQuantity > 0 && item.quantityUnit ? (
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 border-t pt-3 font-medium text-foreground">
                  <input type="checkbox" checked={selectedRefs.includes(item.productRef)}
                    onChange={(event) => setSelectedRefs((old) => event.target.checked
                      ? [...old.filter((value) => value !== item.productRef), item.productRef]
                      : old.filter((value) => value !== item.productRef))} />
                  أضف الكمية الموصى بها إلى مسودة الشراء
                </label>
              ) : null}
            </footer>
          </article>
        ))}
      </div>
      {draftOpen ? <ReplenishmentPurchaseDraft recommendations={selectedRecommendations} idempotencyKeys={idempotencyKeys.current} onClose={() => setDraftOpen(false)} /> : null}
    </section>
  );
}
