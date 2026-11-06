import type { GrowthOpportunity, GrowthOpportunityRadarResult } from "@/lib/intelligence/growth-opportunities";
import { EvidenceReferences, EvidenceStatusLabel, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface GrowthOpportunityRadarProps {
  result?: GrowthOpportunityRadarResult | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
  onOpenRecord?: (kind: GrowthOpportunity["kind"], subjectRef: string) => void;
}

const priorityLabels = { P1: "مرتفع", P2: "متوسط", P3: "متابعة" } as const;
const withheldLabels: Record<GrowthOpportunityRadarResult["withheld"][number]["reason"], string> = {
  INVALID_SIGNAL: "إشارة غير صالحة",
  DUPLICATE_SIGNAL: "إشارة مكررة",
  METRIC_MISSING: "مؤشر المصدر مفقود",
  METRIC_AMBIGUOUS: "مرجع المؤشر ملتبس",
  METRIC_NOT_VERIFIED: "المؤشر غير مثبت أو غير مكتمل",
  METRIC_SCOPE_MISMATCH: "الفترة أو الوحدة أو العملة لا تطابق المصدر",
  SAMPLE_INSUFFICIENT: "العينة أقل من الحد المحدد",
  INVALID_COMPARISON: "الفترتان أو أساس المقارنة غير صالحين",
  SOURCE_AMOUNT_WITHHELD: "القيمة المصدرية غير قابلة للمقارنة",
};

function numberLabel(value: number | null, unit: string, currency?: string, unitOfMeasure?: string): string {
  if (value === null || !Number.isFinite(value)) return "غير متاح";
  return formatEvidenceNumber(value) + " " + (currency ?? unitOfMeasure ?? unit);
}

function GrowthOpportunityCard({
  opportunity,
  onOpenRecord,
}: {
  opportunity: GrowthOpportunity;
  onOpenRecord?: GrowthOpportunityRadarProps["onOpenRecord"];
}) {
  const current = numberLabel(opportunity.observedValue, opportunity.unit, opportunity.currency, opportunity.unitOfMeasure);
  const baseline = opportunity.baselineValue === null
    ? null
    : numberLabel(opportunity.baselineValue, opportunity.unit, opportunity.currency, opportunity.unitOfMeasure);
  const change = opportunity.changePercent === null ? "غير محسوبة" : (opportunity.changePercent > 0 ? "+" : "") + opportunity.changePercent.toFixed(1) + "%";

  return (
    <article dir="rtl" className="rounded-xl border bg-card p-4 text-card-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{opportunity.title}</h3>
        <span className="rounded-full border px-3 py-1 text-xs">{priorityLabels[opportunity.priority]}</span>
      </header>
      <p className="mt-2 text-sm font-medium">{opportunity.what}</p>
      <p className="mt-2 text-sm"><strong>الدليل:</strong> {opportunity.why}</p>
      <p className="mt-2 text-sm"><strong>الأهمية:</strong> {opportunity.soWhat}</p>
      <p className="mt-2 text-sm"><strong>الخطوة التالية:</strong> {opportunity.whatNext}</p>
      <dl className="mt-3 grid gap-2 rounded-lg border p-3 text-xs sm:grid-cols-2">
        <div><dt className="text-muted-foreground">القيمة الحالية المثبتة</dt><dd className="font-semibold">{current}</dd></div>
        {baseline !== null ? <div><dt className="text-muted-foreground">فترة الأساس</dt><dd className="font-semibold">{baseline}</dd></div> : null}
        {opportunity.changePercent !== null || opportunity.direction === "NEW_ACTIVITY"
          ? <div><dt className="text-muted-foreground">التغير</dt><dd className="font-semibold">{change}</dd></div>
          : null}
        <div><dt className="text-muted-foreground">حجم العينة</dt><dd>{formatEvidenceNumber(opportunity.sampleSize)}{opportunity.baselineSampleSize !== null ? " / " + formatEvidenceNumber(opportunity.baselineSampleSize) : ""}</dd></div>
        {opportunity.sourceAmount ? (
          <div>
            <dt className="text-muted-foreground">قيمة مصدرية للفحص — ليست ربحاً متوقعاً</dt>
            <dd>{numberLabel(opportunity.sourceAmount.value, "CURRENCY", opportunity.sourceAmount.currency)}</dd>
          </div>
        ) : null}
        <div><dt className="text-muted-foreground">المسؤول المقترح</dt><dd>{opportunity.owner}</dd></div>
        <div><dt className="text-muted-foreground">الفترة</dt><dd>{opportunity.period.from} — {opportunity.period.to}</dd></div>
        <div><dt className="text-muted-foreground">حتى تاريخ</dt><dd>{opportunity.asOf}</dd></div>
      </dl>
      <section className="mt-3 space-y-1 text-xs">
        <p>حالة الدليل: <EvidenceStatusLabel status="VERIFIED" /></p>
        <p>مراجع الإثبات: <EvidenceReferences ids={opportunity.proof.evidenceIds} /></p>
        <p>إصدارات المعادلات: {opportunity.proof.formulaVersions.join("، ") || "غير محددة"}</p>
        <p>النتيجة المتوقعة: {opportunity.expectedOutcome}</p>
        {opportunity.warnings.map(warning => <p key={warning} className="text-muted-foreground">{warning}</p>)}
      </section>
      {onOpenRecord ? (
        <footer className="mt-3 border-t pt-3">
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onOpenRecord(opportunity.kind, opportunity.subjectRef)}>
            فتح السجل المرتبط
          </button>
        </footer>
      ) : null}
    </article>
  );
}

export function GrowthOpportunityRadar({
  result = null,
  state = "ready",
  onRetry,
  onOpenRecord,
}: GrowthOpportunityRadarProps) {
  if (state !== "ready") {
    return <IntelligenceStatePanel state={state} onRetry={onRetry} errorMessage="تعذر تحميل رادار فرص النمو." />;
  }
  if (!result || result.status === "UNAVAILABLE") {
    return <IntelligenceStatePanel state="unavailable" unavailableMessage="مصادر رادار النمو غير متاحة؛ لم يتم إنشاء فرص أو قيم بديلة." />;
  }

  return (
    <section dir="rtl" className="space-y-3 rounded-xl border p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">رادار فرص النمو الموثقة</h2>
          <p className="text-xs text-muted-foreground">محرك حتمي · سياسة {result.opportunities[0]?.policyVersion ?? "1.0.0"} · حتى {result.asOf}</p>
        </div>
        <div className="text-xs">
          <EvidenceStatusLabel status={result.status} /> · {result.opportunities.length} فرصة مثبتة · {result.withheld.length} إشارة محجوبة
        </div>
      </header>
      <p className="text-sm text-muted-foreground">الفرصة تثبت الإشارة التجارية فقط؛ لا تمثل وعداً بالبيع أو توقعاً للربح ولا تنفذ إجراءً نيابة عن المستخدم.</p>
      {result.opportunities.length === 0 && result.withheld.length === 0 && result.status === "VERIFIED" ? (
        <div role="status" className="rounded-lg border p-3 text-sm">لا توجد فرص تجاوزت العتبات المحددة في مجتمع البيانات المكتمل لهذه الفترة.</div>
      ) : null}
      {result.opportunities.length === 0 && result.withheld.length === 0 && result.status !== "VERIFIED" ? (
        <div role="status" className="rounded-lg border p-3 text-sm">
          لا توجد فرصة يمكن إثباتها حالياً، لكن تغطية المصادر أو جودة بعض المؤشرات لا تسمح باستنتاج أن فرص النمو غير موجودة.
        </div>
      ) : null}
      {result.opportunities.map(opportunity => (
        <GrowthOpportunityCard key={opportunity.id} opportunity={opportunity} onOpenRecord={onOpenRecord} />
      ))}
      {result.withheld.length > 0 ? (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-semibold">الإشارات المحجوبة بسبب نقص المصدر أو المقارنة ({result.withheld.length})</summary>
          <ul className="mt-2 space-y-1 text-xs">
            {result.withheld.map((item, index) => (
              <li key={item.signalId + ":" + index}>{withheldLabels[item.reason]}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {result.warnings.length > 0 ? (
        <div className="rounded-lg border p-3 text-xs">
          {result.warnings.map(warning => <p key={warning}>{warning}</p>)}
        </div>
      ) : null}
    </section>
  );
}
