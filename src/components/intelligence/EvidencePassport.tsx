import type {
  EvidencePassport as PassportData,
  EvidenceRecord,
  EvidenceStatus,
  MetricSnapshot,
} from "@/lib/intelligence/types";

export type EvidencePassportState = "loading" | "empty" | "error" | "unavailable" | "ready";

export interface EvidencePassportProps {
  passport?: PassportData | null;
  state?: EvidencePassportState;
  errorMessage?: string;
  onRetry?: () => void;
}

const labels: Record<EvidenceStatus, string> = {
  VERIFIED: "مثبت",
  NEEDS_REVIEW: "يحتاج مراجعة",
  UNVERIFIED: "غير مثبت",
  UNAVAILABLE: "غير متاح",
};

function displayMetricValue(metric: MetricSnapshot): string {
  if (metric.value === null) return "غير متاح";
  if (metric.unit !== "CURRENCY") return String(metric.value) + " " + metric.unit;
  return String(metric.value) + " " + (metric.currency ?? "عملة غير محددة");
}

function EvidencePassportStatePanel({
  state,
  errorMessage,
  onRetry,
}: {
  state: Exclude<EvidencePassportState, "ready">;
  errorMessage: string;
  onRetry?: () => void;
}) {
  if (state === "loading") {
    return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">جارٍ تحميل سجل الأدلة…</section>;
  }
  if (state === "empty") {
    return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">لا توجد مؤشرات أو أدلة للفترة المحددة.</section>;
  }
  if (state === "unavailable") {
    return <section role="note" dir="rtl" className="rounded-xl border p-4 text-sm">مصدر الأدلة غير متاح. لم تُعرض بيانات بديلة.</section>;
  }
  return (
    <section role="alert" dir="rtl" className="rounded-xl border p-4 text-sm">
      <p>{errorMessage}</p>
      {onRetry ? <button type="button" className="mt-3 rounded-lg border px-3 py-2" onClick={onRetry}>إعادة المحاولة</button> : null}
    </section>
  );
}

function EvidenceStatusText({ status }: { status: EvidenceStatus }) {
  return <span>{labels[status]}</span>;
}

function MetricLineage({ metric }: { metric: MetricSnapshot }) {
  const evidenceIds = metric.lineage.evidenceIds.join("، ") || "لا يوجد مصدر";
  const formulaId = metric.lineage.formulaId || "غير محددة";
  const formulaVersion = metric.lineage.formulaVersion || "غير محدد";

  return (
    <p className="mt-1 text-xs text-muted-foreground">
      المصدر: {evidenceIds} · المعادلة: {formulaId} / {formulaVersion}
    </p>
  );
}

function EvidenceMetricCard({ metric }: { metric: MetricSnapshot }) {
  return (
    <article data-testid="evidence-metric-card" className="rounded-lg border p-3">
      <div className="flex flex-wrap justify-between gap-2">
        <strong className="text-sm">{metric.key}</strong>
        <EvidenceStatusText status={metric.status} />
      </div>
      <p className="mt-1 text-sm">{displayMetricValue(metric)}</p>
      <MetricLineage metric={metric} />
      {metric.warnings.length > 0 ? (
        <p className="mt-1 text-xs">تحذيرات: {metric.warnings.join("، ")}</p>
      ) : null}
    </article>
  );
}

function EvidenceMetricList({ metrics }: { metrics: MetricSnapshot[] }) {
  return (
    <div className="mt-3 space-y-3">
      {metrics.map((metric) => <EvidenceMetricCard key={metric.id} metric={metric} />)}
    </div>
  );
}

function EvidenceRecordRow({ record }: { record: EvidenceRecord }) {
  return (
    <li>
      {record.source.name} · <EvidenceStatusText status={record.status} /> · {record.sourceTimestamp}
    </li>
  );
}

function EvidenceRecordList({ records }: { records: EvidenceRecord[] }) {
  if (records.length === 0) return null;
  return (
    <div className="mt-4 border-t pt-3">
      <h4 className="text-sm font-semibold">المصادر</h4>
      <ul className="mt-2 space-y-1 text-xs">
        {records.map((record) => <EvidenceRecordRow key={record.id} record={record} />)}
      </ul>
    </div>
  );
}

function EvidencePassportContent({ passport }: { passport: PassportData }) {
  return (
    <section dir="rtl" className="rounded-xl border p-4 text-card-foreground">
      <header className="flex flex-wrap justify-between gap-2">
        <h3 className="font-semibold">جواز الأدلة</h3>
        <span className="text-xs">الحالة: <EvidenceStatusText status={passport.status} /></span>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        As of: {passport.asOf} · الاكتمال: {passport.completeness}
      </p>
      <EvidenceMetricList metrics={passport.metrics} />
      <EvidenceRecordList records={passport.evidenceRecords} />
    </section>
  );
}

export function EvidencePassport({
  passport,
  state = "ready",
  errorMessage = "تعذر تحميل سجل الأدلة.",
  onRetry,
}: EvidencePassportProps) {
  if (state !== "ready") {
    return <EvidencePassportStatePanel state={state} errorMessage={errorMessage} onRetry={onRetry} />;
  }
  if (!passport) {
    return <section role="status" dir="rtl" className="rounded-xl border p-4 text-sm">سجل الأدلة غير متوفر.</section>;
  }
  return <EvidencePassportContent passport={passport} />;
}
