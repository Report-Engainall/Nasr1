import type { LiquiditySnapshot } from "@/lib/intelligence/liquidity";
import { EvidenceReferences, EvidenceStatusLabel, EvidenceWarnings, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface LiquiditySummaryProps {
  snapshot?: LiquiditySnapshot | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}

const amount = (value: number | null, currency: string) =>
  value === null ? "غير متاح" : formatEvidenceNumber(value) + " " + currency;

export function LiquiditySummary({ snapshot, state = "ready", onRetry }: LiquiditySummaryProps) {
  const effectiveState = state === "ready" && !snapshot ? "unavailable" : state;
  const panel = <IntelligenceStatePanel state={effectiveState} onRetry={onRetry} emptyMessage="لا توجد مراكز سيولة للفترة المحددة." />;
  if (effectiveState !== "ready") return panel;
  if (!snapshot || snapshot.positions.length === 0) {
    return <IntelligenceStatePanel state="empty" emptyMessage="لا توجد مراكز سيولة للفترة المحددة." />;
  }

  return (
    <section dir="rtl" className="space-y-3" aria-label="ملخص السيولة حسب العملة">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">مركز السيولة</h3>
        <span className="text-xs text-muted-foreground">حتى {snapshot.asOf}</span>
      </header>
      {snapshot.positions.map((position, index) => (
        <article key={position.currency + ":" + index} aria-label={position.currency} className="rounded-xl border bg-card p-4 text-card-foreground">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-semibold">{position.currency}</h4>
            <span className="text-xs">حالة صافي السيولة: <EvidenceStatusLabel status={position.status} /> · الاكتمال: {position.completeness}</span>
          </header>
          <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div><dt className="text-xs text-muted-foreground">الرصيد المتاح</dt><dd className="font-semibold">{amount(position.availableBalance, position.currency)} · <EvidenceStatusLabel status={position.availableBalanceStatus} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">التحصيلات المتوقعة</dt><dd className="font-semibold">{amount(position.expectedCollections, position.currency)} · <EvidenceStatusLabel status={position.expectedCollectionsStatus} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">المبالغ المستحقة</dt><dd className="font-semibold">{amount(position.dueObligations, position.currency)} · <EvidenceStatusLabel status={position.dueObligationsStatus} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">الذمم المتأخرة</dt><dd>{amount(position.overdueReceivables, position.currency)} · <EvidenceStatusLabel status={position.overdueReceivablesStatus} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">صافي السيولة المتاحة</dt><dd className="font-semibold">{amount(position.netAvailableLiquidity, position.currency)} · <EvidenceStatusLabel status={position.status} /></dd></div>
            <div><dt className="text-xs text-muted-foreground">تكلفة المخزون الراكد المثبتة (خارج صافي السيولة)</dt><dd>{amount(position.stagnantStockExposure, position.currency)} · <EvidenceStatusLabel status={position.stagnantStockExposureStatus} /></dd></div>
          </dl>
          {position.receivableAging.length ? <div className="mt-4 border-t pt-3">
            <h5 className="text-sm font-semibold">أعمار الذمم</h5>
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {position.receivableAging.map((bucket, bucketIndex) => (
                <li key={bucket.bucket + ":" + bucketIndex} className="flex justify-between gap-3 text-sm">
                  <span>{bucket.bucket}</span>
                  <span>{amount(bucket.amount, position.currency)} · <EvidenceStatusLabel status={bucket.status} /></span>
                </li>
              ))}
            </ul>
          </div> : null}
          <footer className="mt-3 border-t pt-3 text-xs text-muted-foreground">
            <p>المعادلة: {position.formulaId} · الإصدار: {position.formulaVersion} · الفترة: {position.period.from} — {position.period.to}</p>
            <p>مراجع المصدر: <EvidenceReferences ids={position.lineage.evidenceIds} /></p>
            <EvidenceWarnings warnings={position.warnings} />
          </footer>
        </article>
      ))}
      <EvidenceWarnings warnings={snapshot.warnings} />
    </section>
  );
}
