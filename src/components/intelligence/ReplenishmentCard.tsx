import type { ReplenishmentRecommendation } from "@/lib/intelligence/replenishment";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface ReplenishmentCardProps {
  recommendations?: ReplenishmentRecommendation[] | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}

export function ReplenishmentCard({ recommendations, state = "ready", onRetry }: ReplenishmentCardProps) {
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
        <h3 className="font-semibold">توصيات إعادة التوريد</h3>
        <span className="text-xs text-muted-foreground">توصيات فقط؛ لا ينشئ هذا العرض أمر شراء.</span>
      </header>
      <div className="grid gap-3 md:grid-cols-2">
        {recommendations.map((item) => (
          <article key={item.productRef} className="rounded-xl border bg-card p-4 text-card-foreground">
            <header className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold">{item.productRef}</h4>
              <span className="text-xs"><EvidenceStatusLabel status={item.status} /></span>
            </header>
            <p className="mt-2 text-sm font-semibold">
              {item.action === "WITHHELD"
                ? "التوصية محجوبة؛ مدخلات المصدر غير مثبتة"
                : item.action === "NO_ACTION"
                  ? "لا توجد حاجة مثبتة لإعادة التوريد"
                  : "توجد توصية لإعادة التوريد"}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">المتاح للبيع (ATP)</dt><dd>{formatEvidenceNumber(item.availableToPromise)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">نقطة إعادة الطلب</dt><dd>{formatEvidenceNumber(item.reorderPoint)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الطلب اليومي المحسوب</dt><dd>{formatEvidenceNumber(item.dailyDemand)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">طلب مهلة التوريد</dt><dd>{formatEvidenceNumber(item.leadTimeDemand)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">المخزون المستهدف</dt><dd>{formatEvidenceNumber(item.targetStock)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">الكمية الموصى بها (وحدة الصنف غير متاحة في العقد)</dt><dd className="font-semibold">{item.status === "VERIFIED" ? formatEvidenceNumber(item.recommendedQuantity) : "غير متاح"}</dd></div>
            </dl>
            <footer className="mt-3 border-t pt-3 text-xs text-muted-foreground">
              <p>المعادلة: {item.formulaId}@{item.formulaVersion} · الشراء التلقائي: ممنوع</p>
              <p>مراجع الإثبات: <EvidenceReferences ids={item.evidenceIds} /></p>
              <EvidenceWarnings warnings={item.warnings} />
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}
