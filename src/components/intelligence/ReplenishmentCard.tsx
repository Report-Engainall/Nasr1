import type { ReplenishmentRecommendation } from "@/lib/intelligence/replenishment";
import type { ProductDemandForecast } from "@/lib/intelligence/demand-forecast";
import { useEffect, useRef, useState } from "react";
import { fetchProducts } from "@/lib/api";
import { ReplenishmentPurchaseDraft } from "./ReplenishmentPurchaseDraft";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface ReplenishmentCardProps {
  recommendations?: ReplenishmentRecommendation[] | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
  canManagePurchases?: boolean;
  demandForecasts?: ProductDemandForecast[] | null;
}

export function ReplenishmentCard({ recommendations, state = "ready", onRetry, canManagePurchases = false, demandForecasts = null }: ReplenishmentCardProps) {
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
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
        {canManagePurchases ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">المحدد للمسودة: {selectedRecommendations.length}</span>
            <button type="button" className="btn primary btn-sm" disabled={!selectedRecommendations.length}
              onClick={() => setDraftOpen(true)}>إنشاء مسودة من المحدد</button>
          </div>
        ) : null}
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map((item) => (
          <article key={item.productRef} aria-label={item.productRef} className="rounded-xl border bg-card p-4 text-card-foreground">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">{productNames[item.productRef] ?? item.productRef}</h4>
              {productNames[item.productRef] && productNames[item.productRef] !== item.productRef ? (
                <span className="text-xs text-muted-foreground">{item.productRef}</span>
              ) : null}
              <span className="text-xs"><EvidenceStatusLabel status={item.status} /></span>
            </header>
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
            {demandForecastByProduct.get(item.productRef) ? (() => {
              const forecast = demandForecastByProduct.get(item.productRef)!;
              const thirty = forecast.horizons.find((horizon) => horizon.days === 30);
              const ninety = forecast.horizons.find((horizon) => horizon.days === 90);
              return (
                <aside className="mt-3 rounded-lg border border-dashed p-3 text-xs" aria-label="سياق توقع الطلب">
                  <p className="font-semibold">سياق مستقل من محرك توقع الطلب · {forecast.trend === "INCREASING" ? "متزايد" : forecast.trend === "DECLINING" ? "متراجع" : forecast.trend === "NEW_ACTIVITY" ? "نشاط جديد" : forecast.trend === "NO_DEMAND" ? "لا طلب مرصود" : "مستقر نسبياً"}</p>
                  <p className="mt-1">30 يوماً: {thirty ? formatEvidenceNumber(thirty.expectedQuantity) + " " + forecast.unitOfMeasure : "غير متاح"} · 90 يوماً: {ninety ? formatEvidenceNumber(ninety.expectedQuantity) + " " + forecast.unitOfMeasure : "غير متاح"}</p>
                  <p className="mt-1 text-muted-foreground">توقع مشتق من فترتي الطلب {forecast.period.from} — {forecast.period.to} و{forecast.baselinePeriod.from} — {forecast.baselinePeriod.to}، ولا يغيّر كمية إعادة التوريد تلقائياً؛ راجع الوارد والتغطية ومهلة المورد أولاً.</p>
                </aside>
              );
            })() : null}
            <footer className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              <p>المعادلة: {item.formulaId}@{item.formulaVersion} · المتبقي = الهدف − (المتاح + الوارد المؤكد) · الشراء التلقائي: ممنوع</p>
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
