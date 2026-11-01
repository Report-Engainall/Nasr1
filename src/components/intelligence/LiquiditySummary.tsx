import type { LiquiditySnapshot } from "@/lib/intelligence/liquidity";
import {
  EvidenceReferences,
  EvidenceStatusLabel,
  EvidenceWarnings,
  formatEvidenceNumber,
  IntelligenceStatePanel,
  type IntelligenceViewState,
} from "./shared";

export interface LiquiditySummaryProps {
  snapshot?: LiquiditySnapshot | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
}

type LiquidityPosition = LiquiditySnapshot["positions"][number];

const amount = (value: number | null, currency: string) =>
  value === null ? "غير متاح" : formatEvidenceNumber(value) + " " + currency;

interface LiquidityMetricProps {
  label: string;
  value: number | null;
  currency: string;
  status: LiquidityPosition["status"];
  emphasis?: boolean;
}

function LiquidityMetric({ label, value, currency, status, emphasis = false }: LiquidityMetricProps) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={emphasis ? "font-semibold" : undefined}>
        {amount(value, currency)} · <EvidenceStatusLabel status={status} />
      </dd>
    </div>
  );
}

function LiquidityMetrics({ position }: { position: LiquidityPosition }) {
  return (
    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <LiquidityMetric label="الرصيد المتاح" value={position.availableBalance} currency={position.currency} status={position.availableBalanceStatus} emphasis />
      <LiquidityMetric label="التحصيلات المتوقعة" value={position.expectedCollections} currency={position.currency} status={position.expectedCollectionsStatus} emphasis />
      <LiquidityMetric label="المبالغ المستحقة" value={position.dueObligations} currency={position.currency} status={position.dueObligationsStatus} emphasis />
      <LiquidityMetric label="الذمم المتأخرة" value={position.overdueReceivables} currency={position.currency} status={position.overdueReceivablesStatus} />
      <LiquidityMetric label="صافي السيولة المتاحة" value={position.netAvailableLiquidity} currency={position.currency} status={position.status} emphasis />
      <LiquidityMetric label="تكلفة المخزون الراكد المثبتة (خارج صافي السيولة)" value={position.stagnantStockExposure} currency={position.currency} status={position.stagnantStockExposureStatus} />
    </dl>
  );
}

function ReceivableAgingRow({
  bucket,
  amount: value,
  status,
  currency,
}: {
  bucket: LiquidityPosition["receivableAging"][number];
  amount: number | null;
  status: LiquidityPosition["status"];
  currency: string;
}) {
  return (
    <li className="flex justify-between gap-3 text-sm">
      <span>{bucket.bucket}</span>
      <span>{amount(value, currency)} · <EvidenceStatusLabel status={status} /></span>
    </li>
  );
}

function ReceivableAgingSection({ position }: { position: LiquidityPosition }) {
  if (position.receivableAging.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-3">
      <h5 className="text-sm font-semibold">أعمار الذمم</h5>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {position.receivableAging.map((bucket, index) => (
          <ReceivableAgingRow
            key={bucket.bucket + ":" + index}
            bucket={bucket}
            amount={bucket.amount}
            status={bucket.status}
            currency={position.currency}
          />
        ))}
      </ul>
    </div>
  );
}

function LiquidityPositionCard({
  position,
  index,
}: {
  position: LiquidityPosition;
  index: number;
}) {
  return (
    <article aria-label={position.currency} className="rounded-xl border bg-card p-4 text-card-foreground">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{position.currency}</h4>
        <span className="text-xs">
          حالة صافي السيولة: <EvidenceStatusLabel status={position.status} /> · الاكتمال: {position.completeness}
        </span>
      </header>
      <LiquidityMetrics position={position} />
      <ReceivableAgingSection position={position} />
      <footer className="mt-3 border-t pt-3 text-xs text-muted-foreground">
        <p>
          المعادلة: {position.formulaId} · الإصدار: {position.formulaVersion} · الفترة: {position.period.from} — {position.period.to}
        </p>
        <p>مراجع المصدر: <EvidenceReferences ids={position.lineage.evidenceIds} /></p>
        <EvidenceWarnings warnings={position.warnings} />
      </footer>
    </article>
  );
}

const EMPTY_MESSAGE = "لا توجد مراكز سيولة للفترة المحددة.";

export function LiquiditySummary({ snapshot, state = "ready", onRetry }: LiquiditySummaryProps) {
  const effectiveState = state === "ready" && !snapshot ? "unavailable" : state;
  if (effectiveState !== "ready") {
    return <IntelligenceStatePanel state={effectiveState} onRetry={onRetry} emptyMessage={EMPTY_MESSAGE} />;
  }

  if (!snapshot || snapshot.positions.length === 0) {
    return <IntelligenceStatePanel state="empty" emptyMessage={EMPTY_MESSAGE} />;
  }

  return (
    <section dir="rtl" className="space-y-3" aria-label="ملخص السيولة حسب العملة">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">مركز السيولة</h3>
        <span className="text-xs text-muted-foreground">حتى {snapshot.asOf}</span>
      </header>
      {snapshot.positions.map((position, index) => (
        <LiquidityPositionCard key={position.currency + ":" + index} position={position} index={index} />
      ))}
      <EvidenceWarnings warnings={snapshot.warnings} />
    </section>
  );
}
