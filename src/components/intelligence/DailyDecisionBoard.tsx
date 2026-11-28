import { useState } from "react";
import type {
  DecisionMemoryBookResult,
  DecisionMemoryMetricResult,
  DecisionMemoryRecord,
} from "@/lib/intelligence/decision-memory";
import { DecisionOutcomeLifecycleControls } from "./DecisionOutcomeLifecycleControls";

const stateLabels: Record<DecisionMemoryRecord["state"], string> = {
  PROPOSED: "مقترح",
  IN_REVIEW: "قيد المراجعة",
  APPROVED: "معتمد",
  REJECTED: "مرفوض",
  DEFERRED: "مؤجل",
  ASSIGNED: "مسند",
  EXECUTING: "قيد التنفيذ",
  EXECUTED: "بانتظار قياس النتيجة",
  MEASURED: "تم قياس النتيجة",
};

const stateOrder: Record<DecisionMemoryRecord["state"], number> = {
  IN_REVIEW: 0, PROPOSED: 1, APPROVED: 2, ASSIGNED: 3, EXECUTING: 4,
  EXECUTED: 5, MEASURED: 6, DEFERRED: 7, REJECTED: 8,
};

const steps: Array<{ state: DecisionMemoryRecord["state"]; label: string }> = [
  { state: "PROPOSED", label: "مقترح" },
  { state: "IN_REVIEW", label: "مراجعة" },
  { state: "APPROVED", label: "اعتماد" },
  { state: "ASSIGNED", label: "إسناد" },
  { state: "EXECUTING", label: "تنفيذ" },
  { state: "EXECUTED", label: "اكتمل" },
  { state: "MEASURED", label: "قياس" },
];

function metricValue(metric: DecisionMemoryMetricResult | null): string {
  if (!metric) return "غير متاح من المصدر";
  const amount = new Intl.NumberFormat("ar-YE", { maximumFractionDigits: 2 }).format(metric.value);
  return [amount, metric.currency ?? metric.unit, metric.unitOfMeasure].filter(Boolean).join(" ");
}

export type DailyDecisionStateFilter = "ALL" | DecisionMemoryRecord["state"];
export type DailyDecisionPriorityFilter = "ALL" | "P0" | "P1" | "P2" | "P3" | "UNRANKED";
export type DailyDecisionDueFilter = "ALL" | "OVERDUE" | "DUE_7_DAYS" | "UNSCHEDULED";

export interface DailyDecisionFilters {
  searchText: string;
  state: DailyDecisionStateFilter;
  priority: DailyDecisionPriorityFilter;
  due: DailyDecisionDueFilter;
}

export function normalizeDailyDecisionSearch(value: string): string {
  return value.normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLocaleLowerCase("ar")
    .trim()
    .replace(/\s+/g, " ");
}

export function filterDailyDecisionRecords(
  records: DecisionMemoryRecord[],
  filters: DailyDecisionFilters,
  now: number,
): DecisionMemoryRecord[] {
  const query = normalizeDailyDecisionSearch(filters.searchText);
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  return records.filter(record => {
    if (filters.state !== "ALL" && record.state !== filters.state) return false;
    const savedPriority = record.candidateSnapshot?.priority ?? null;
    if (filters.priority === "UNRANKED" && savedPriority !== null) return false;
    if (filters.priority !== "ALL" && filters.priority !== "UNRANKED" && savedPriority !== filters.priority) return false;

    const terminal = record.state === "REJECTED" || record.state === "MEASURED";
    const due = record.reviewAt ? Date.parse(record.reviewAt) : Number.NaN;
    if (filters.due === "OVERDUE" &&
        (terminal || record.reviewDisposition !== "SCHEDULED" || !Number.isFinite(due) || due > now)) return false;
    if (filters.due === "DUE_7_DAYS" &&
        (terminal || record.reviewDisposition !== "SCHEDULED" || !Number.isFinite(due) || due <= now || due > weekAhead)) return false;
    if (filters.due === "UNSCHEDULED" &&
        (terminal || record.reviewDisposition !== "NOT_SCHEDULED" &&
          !(record.reviewDisposition === null && !record.reviewAt))) return false;

    if (!query) return true;
    const candidate = record.candidateSnapshot;
    const searchable = normalizeDailyDecisionSearch([
      record.decisionId, record.candidateRef, record.ruleId, record.ruleVersion,
      record.state, record.owner, record.proposedResult, record.decisionReason ?? "",
      record.problem ?? "", record.actionTaken ?? "", record.reviewAt ?? "",
      candidate?.what ?? "", candidate?.why ?? "", candidate?.risk ?? "",
      candidate?.whatNext ?? "", candidate?.expectedOutcome ?? "",
      record.events.map(event => [event.type, event.actorRole, event.reason ?? ""].join(" ")).join(" "),
      record.facts.map(item => item.text + " " + item.evidenceIds.join(" ")).join(" "),
      record.hypotheses.map(item => item.text + " " + item.evidenceIds.join(" ")).join(" "),
      record.lessons.join(" "),
    ].join(" "));
    return searchable.includes(query);
  });
}

function priorityRank(record: DecisionMemoryRecord): number {
  const priority = record.candidateSnapshot?.priority;
  return priority === "P0" ? 0 : priority === "P1" ? 1 : priority === "P2" ? 2 : priority === "P3" ? 3 : 4;
}

function followUpOrder(record: DecisionMemoryRecord, now: number): number[] {
  const terminal = record.state === "REJECTED" || record.state === "MEASURED";
  const due = record.reviewAt ? Date.parse(record.reviewAt) : Number.NaN;
  const dueRank = terminal ? 2 : Number.isFinite(due) && due <= now ? 0 : 1;
  return [dueRank, stateOrder[record.state], Number.isFinite(due) ? due : Number.MAX_SAFE_INTEGER];
}

function compareOrder(left: DecisionMemoryRecord, right: DecisionMemoryRecord, now: number): number {
  const leftRank = priorityRank(left);
  const rightRank = priorityRank(right);
  if (leftRank !== rightRank) return leftRank - rightRank;
  const leftImpact = left.candidateSnapshot?.impact;
  const rightImpact = right.candidateSnapshot?.impact;
  if (leftImpact && rightImpact && leftImpact.unit === rightImpact.unit && leftImpact.currency === rightImpact.currency) {
    const byImpact = Math.abs(rightImpact.value) - Math.abs(leftImpact.value);
    if (byImpact !== 0) return byImpact;
  }
  const a = followUpOrder(left, now);
  const b = followUpOrder(right, now);
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  const byCreation = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  if (byCreation !== 0) return byCreation;
  // Use the immutable decision ID as a deterministic final tie-breaker.
  return left.decisionId < right.decisionId ? -1 : left.decisionId > right.decisionId ? 1 : 0;
}

export interface DailyDecisionBoardSelection {
  records: DecisionMemoryRecord[];
  matchingRecords: DecisionMemoryRecord[];
  matchedCount: number;
  omittedCount: number;
}

export function selectDailyDecisionBoardRows(
  records: DecisionMemoryRecord[],
  filters: DailyDecisionFilters,
  now: number,
  limit = 10,
): DailyDecisionBoardSelection {
  const safeLimit = Number.isSafeInteger(limit) && limit > 0 && limit <= 50 ? limit : 10;
  const matching = filterDailyDecisionRecords(records, filters, now)
    .sort((left, right) => compareOrder(left, right, now));
  return {
    records: matching.slice(0, safeLimit),
    matchingRecords: matching,
    matchedCount: matching.length,
    omittedCount: Math.max(0, matching.length - safeLimit),
  };
}

function dailyDecisionCsvCell(value: string | number | null | undefined): string {
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = String(value ?? "").replace(/\r\n?/g, "\n");
  const protectedText = /^[\s\u0000-\u001F]*[=+\-@]/.test(text) ? "'" + text : text;
  return "\"" + protectedText.replace(/"/g, '""') + "\"";
}

function dailyDecisionMetricContext(metric: DecisionMemoryMetricResult | null): string {
  if (!metric) return "";
  return [
    metric.metricKey,
    metric.unit,
    metric.currency ?? "عملة غير محددة",
    metric.unitOfMeasure ?? "وحدة صنف غير محددة",
    metric.period.from + " — " + metric.period.to,
    metric.formulaId + "@" + metric.formulaVersion,
  ].join(" | ");
}

/** Exports every filtered, loaded decision rather than only the ten visible cards. */
export function buildDailyDecisionBoardCsv(input: {
  records: DecisionMemoryRecord[];
  loadedCount: number;
  totalCount: number;
}): string {
  if (!input || !Array.isArray(input.records) ||
      ![input.loadedCount, input.totalCount].every(value => Number.isSafeInteger(value) && value >= 0) ||
      input.loadedCount > input.totalCount || input.records.length > input.loadedCount) {
    throw new Error("daily_decision_export_invalid");
  }
  const coverageNotice = input.loadedCount === input.totalCount
    ? "الملف يشمل النتائج المطابقة من السجلات المحمّلة؛ لا يعني ذلك اكتمال أدلة كل قرار."
    : "نطاق جزئي: " + input.loadedCount + " من " + input.totalCount +
      " قراراً محمّلاً؛ قد توجد نتائج مطابقة خارج النطاق.";
  const headers = [
    "decision_id", "candidate_ref", "rule_id", "rule_version", "state", "version",
    "priority", "priority_score", "proposed_result", "decision_reason", "problem",
    "owner", "review_disposition", "review_at", "action_taken", "expected_outcome",
    "risk", "next_action", "created_at", "updated_at",
    "comparison_status", "expected_metric_context", "expected_metric_value",
    "expected_evidence_ids", "actual_metric_context", "actual_metric_value",
    "actual_evidence_ids", "difference", "difference_percent",
    "facts", "fact_evidence_ids", "hypotheses", "hypothesis_evidence_ids",
    "lessons", "corrections_count", "event_count", "event_history",
    "candidate_evidence_ids", "metric_keys", "formula_versions",
    "memory_status", "warnings", "coverage_notice",
  ];
  const rows = input.records.map(record => {
    const candidate = record.candidateSnapshot;
    const expected = record.metricComparison.expected;
    const actual = record.metricComparison.actual;
    return [
      record.decisionId,
      record.candidateRef,
      record.ruleId,
      record.ruleVersion,
      record.state,
      record.version,
      candidate?.priority ?? null,
      candidate?.priorityScore ?? null,
      record.proposedResult,
      record.decisionReason,
      record.problem,
      record.owner,
      record.reviewDisposition,
      record.reviewAt,
      record.actionTaken,
      candidate?.expectedOutcome ?? null,
      candidate?.risk ?? null,
      candidate?.whatNext ?? null,
      record.createdAt,
      record.updatedAt,
      record.metricComparison.status,
      dailyDecisionMetricContext(expected),
      expected?.value ?? null,
      expected?.evidenceIds.join(";") ?? null,
      dailyDecisionMetricContext(actual),
      actual?.value ?? null,
      actual?.evidenceIds.join(";") ?? null,
      record.metricComparison.difference,
      record.metricComparison.differencePercent,
      record.facts.map(item => item.text).join("; "),
      record.facts.flatMap(item => item.evidenceIds).join(";"),
      record.hypotheses.map(item => item.text).join("; "),
      record.hypotheses.flatMap(item => item.evidenceIds).join(";"),
      record.lessons.join("; "),
      record.corrections.length,
      record.eventCount,
      record.events.map(event => [
        event.version, event.type, event.at, event.actorRole, event.reason ?? "",
      ].join(" | ")).join("; "),
      candidate?.proof.evidenceIds.join(";") ?? null,
      candidate?.proof.metricKeys.join(";") ?? null,
      candidate?.proof.formulaVersions.join(";") ?? null,
      record.memoryStatus,
      record.warnings.join(";"),
      coverageNotice,
    ].map(dailyDecisionCsvCell).join(",");
  });
  return "\uFEFF" + [headers.map(dailyDecisionCsvCell).join(","), ...rows].join("\r\n");
}

function decisionDue(record: DecisionMemoryRecord, now: number): string {
  if (record.reviewDisposition === "NOT_REQUIRED") return "لا تتطلب مراجعة مجدولة";
  if (record.reviewDisposition === "NOT_SCHEDULED") return "لم يُحدد موعد مراجعة";
  if (!record.reviewAt) return "المراجعة مجدولة لكن وقتها غير متاح";
  const time = new Date(record.reviewAt).toLocaleString("ar-YE");
  return Date.parse(record.reviewAt) < now ? "متأخر: " + time : time;
}

function DecisionProgress({ state }: { state: DecisionMemoryRecord["state"] }) {
  const terminal = state === "REJECTED";
  // Deferral is resumable through RESUBMIT_FOR_REVIEW; retain the review step as reached.
  const activeIndex = state === "DEFERRED"
    ? steps.findIndex(step => step.state === "IN_REVIEW")
    : steps.findIndex(step => step.state === state);
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="تسلسل انتقال القرار">
      {steps.map((step, index) => {
        const complete = !terminal && activeIndex >= index;
        const current = step.state === state;
        return (
          <li key={step.state} className={[
            "min-w-0 break-words rounded-md border px-2 py-2 text-center text-xs",
            current ? "border-primary bg-primary/10 font-semibold" : complete ? "border-primary/50" : "text-muted-foreground",
          ].join(" ")} aria-current={current ? "step" : undefined}>
            {step.label}
          </li>
        );
      })}
      {terminal ? (
        <li className="col-span-2 rounded-md border px-2 py-2 text-center text-xs font-semibold sm:col-span-4 lg:col-span-7">
          {stateLabels[state]} — قرار مرفوض ولا يُعاد فتحه من هذه الدورة
        </li>
      ) : state === "DEFERRED" ? (
        <li className="col-span-2 rounded-md border px-2 py-2 text-center text-xs font-semibold sm:col-span-4 lg:col-span-7">
          مؤجل — يمكن إعادته للمراجعة بسبب موثق
        </li>
      ) : null}
    </ol>
  );
}

function DecisionCard({
  record,
  now,
  onChanged,
}: {
  record: DecisionMemoryRecord;
  now: number;
  onChanged?: () => void;
}) {
  const evidence = record.snapshot?.evidenceRecords ?? [];
  const variance = record.metricComparison;
  const due = record.reviewAt ? Date.parse(record.reviewAt) : Number.NaN;
  const overdue = Number.isFinite(due) && due < now &&
    record.state !== "REJECTED" && record.state !== "MEASURED";
  const facts = record.facts.filter(item => item.text.trim());
  const hypotheses = record.hypotheses.filter(item => item.text.trim());
  const candidate = record.candidateSnapshot;

  return (
    <article className="min-w-0 space-y-3 rounded-xl border p-3 sm:p-4" aria-labelledby={"daily-decision-" + record.decisionId}>
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id={"daily-decision-" + record.decisionId} className="break-words text-base font-semibold">{record.proposedResult}</h3>
          <p className="mt-1 break-all text-xs text-muted-foreground" dir="ltr">
            {record.ruleId}@{record.ruleVersion} · {record.decisionId.slice(0, 8)}
          </p>
        </div>
        <span className="w-fit max-w-full shrink-0 break-words rounded-full border px-3 py-1 text-xs font-medium">
          {stateLabels[record.state]}
        </span>
      </header>

      <DecisionProgress state={record.state}/>

      <div className="min-w-0 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">مالك القرار</p>
          <strong className="mt-1 block break-words text-sm">{record.owner || "غير معيّن"}</strong>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">موعد المراجعة المطلوب</p>
          <strong className={["mt-1 block text-sm", overdue ? "text-destructive" : ""].join(" ")}>
            {decisionDue(record, now)}
          </strong>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">أولوية القرار</p>
          <strong className="mt-1 block break-words text-sm">{candidate ? candidate.priority + " · " + candidate.priorityScore : "غير محفوظة في السجل التاريخي"}</strong>
        </div>
      </div>

      {candidate ? (
        <section className="grid gap-3 rounded-lg border p-3 md:grid-cols-2">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">المشكلة وسبب القرار</h4>
            <p className="text-sm">{candidate.what}</p>
            <p className="text-sm text-muted-foreground">{candidate.why}</p>
            <p className="text-sm">المصدر: {candidate.proof.evidenceIds.join("، ")}</p>
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold">الأثر والمسؤول والإجراء</h4>
            <p className="text-sm">{candidate.impactStatus === "CALCULATED" && candidate.impact
              ? Math.abs(candidate.impact.value).toLocaleString("ar-YE", { maximumFractionDigits: 2 }) + " " + (candidate.impact.currency ?? candidate.impact.unit)
              : "الأثر المالي محجوب: " + (candidate.impactReason ?? "لم يثبت المصدر")}</p>
            <p className="text-sm text-muted-foreground">المخاطر: {candidate.risk}</p>
            <p className="text-sm">المسؤول: {candidate.owner}</p>
            <p className="text-sm">الإجراء المطلوب: {candidate.whatNext}</p>
            <p className="text-xs text-muted-foreground">النتيجة المتوقعة: {candidate.expectedOutcome}</p>
          </div>
        </section>
      ) : null}

      <section className="rounded-lg border p-3">
        <h4 className="text-sm font-semibold">سبب التوصية</h4>
        {record.decisionReason
          ? <p className="mt-1 whitespace-pre-wrap text-sm">{record.decisionReason}</p>
          : <p className="mt-1 text-sm text-muted-foreground">لم يُحفظ سبب تفصيلي مع هذا الإصدار؛ لا يُستنتج سبب بديل.</p>}
      </section>
      <section className="rounded-lg border p-3">
        <h4 className="text-sm font-semibold">المشكلة والمخاطر المسجلة</h4>
        {record.problem
          ? <p className="mt-1 whitespace-pre-wrap text-sm">{record.problem}</p>
          : <p className="mt-1 text-sm text-muted-foreground">لا توجد مشكلة أو مخاطر موثقة في لقطة القرار الحالية.</p>}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">الوقائع المثبتة</h4>
          {facts.length ? facts.map(fact => (
            <div key={fact.id} className="rounded-md bg-muted/40 p-2">
              <p className="whitespace-pre-wrap text-sm">{fact.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {fact.evidenceIds.length
                  ? "مراجع الأدلة: " + fact.evidenceIds.join("، ")
                  : "لا توجد إحالة دليل مرتبطة بهذه الواقعة"}
              </p>
            </div>
          )) : <p className="text-sm text-muted-foreground">لا توجد وقائع مثبتة محفوظة لهذا القرار.</p>}
        </div>
        <div className="space-y-2 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">الفرضيات والمخاطر قيد المراجعة</h4>
          {hypotheses.length ? hypotheses.map(item => (
            <div key={item.id} className="rounded-md bg-muted/40 p-2">
              <p className="whitespace-pre-wrap text-sm">{item.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.evidenceIds.length
                  ? "مراجع مرتبطة: " + item.evidenceIds.join("، ")
                  : "فرضية غير مثبتة؛ لا تعامل كحقيقة"}
              </p>
            </div>
          )) : <p className="text-sm text-muted-foreground">لا توجد فرضيات مخاطر محفوظة؛ لا يُستنتج خطر غير مسجل.</p>}
        </div>
      </section>

      <section className="space-y-2 rounded-lg border p-3">
        <h4 className="text-sm font-semibold">الأثر المتوقع ومقارنته بالنتيجة</h4>
        {variance.expected ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">خط الأساس المتوقع</p>
              <strong className="mt-1 block text-sm">{metricValue(variance.expected)}</strong>
            </div>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">النتيجة الفعلية الموثقة</p>
              <strong className="mt-1 block text-sm">
                {variance.actual ? metricValue(variance.actual) : "لم تُسجل نتيجة فعلية متوافقة بعد"}
              </strong>
            </div>
          </div>
        ) : <p className="text-sm text-muted-foreground">لا يوجد خط أساس متوقع موثق لهذا القرار؛ لم يُنشأ تقدير بديل.</p>}
        {variance.status === "VERIFIED" && variance.difference !== null ? (
          <p className="text-sm">
            الفرق الفعلي − المتوقع: <strong>{variance.difference.toLocaleString("ar-YE", { maximumFractionDigits: 2 })}</strong>
            {variance.differencePercent === null
              ? " · النسبة غير معرفة لخط أساس صفري"
              : " · الانحراف النسبي: " + variance.differencePercent.toLocaleString("ar-YE", { maximumFractionDigits: 2 }) + "%"}
          </p>
        ) : variance.reason ? (
          <p className="text-xs text-muted-foreground">المقارنة محجوبة: {variance.reason}</p>
        ) : null}
        {record.expectedMetric ? (
          <p className="text-xs text-muted-foreground">
            المعادلة: {record.expectedMetric.formulaId}@{record.expectedMetric.formulaVersion}
            {" · "}الفترة: {record.expectedMetric.period.from} — {record.expectedMetric.period.to}
            {" · "}كما في: {record.expectedMetric.asOf}
          </p>
        ) : null}
      </section>

      <section className="space-y-2 rounded-lg border p-3">
        <h4 className="text-sm font-semibold">الأدلة والمصادر المؤسسة للقرار</h4>
        {evidence.length ? evidence.map(item => (
          <div key={item.id} className="flex flex-col gap-1 border-b py-2 last:border-b-0 sm:flex-row sm:justify-between">
            <span className="break-words text-sm">{item.source.name} · {item.source.kind}</span>
            <span className="break-all text-xs text-muted-foreground" dir="ltr">{item.id} · {item.sourceTimestamp}</span>
          </div>
        )) : (
          <p className="text-sm text-muted-foreground">لم تُحفظ قائمة أدلة تفصيلية مع هذه النسخة؛ لا تُعرض مراجع من الذاكرة غير المحملة.</p>
        )}
      </section>

      {record.events.length ? (
        <section className="space-y-1 rounded-lg border p-3">
          <h4 className="text-sm font-semibold">سجل الانتقالات</h4>
          {record.events.slice(-8).map(event => (
            <p key={event.id} className="text-xs text-muted-foreground">
              {event.type} · {event.actorRole} · {new Date(event.at).toLocaleString("ar-YE")}
              {event.reason ? " · " + event.reason : ""}
            </p>
          ))}
        </section>
      ) : null}

      <DecisionOutcomeLifecycleControls
        outcomeId={record.decisionId}
        state={record.state}
        version={record.version}
        ownerProfileId={record.ownerProfileId}
        expectedMetric={record.expectedMetric}
        onChanged={onChanged}
      />
    </article>
  );
}

export function DailyDecisionBoard({
  result,
  onRetry,
}: {
  result: DecisionMemoryBookResult;
  onRetry?: () => void;
}) {
  const now = Date.now();
  const [searchText, setSearchText] = useState("");
  const [stateFilter, setStateFilter] = useState<DailyDecisionStateFilter>("ALL");
  const [priorityFilter, setPriorityFilter] = useState<DailyDecisionPriorityFilter>("ALL");
  const [dueFilter, setDueFilter] = useState<DailyDecisionDueFilter>("ALL");
  const selection = selectDailyDecisionBoardRows(result.records, {
    searchText, state: stateFilter, priority: priorityFilter, due: dueFilter,
  }, now);
  const records = selection.records;
  const omittedCount = selection.omittedCount;
  const hasFilters = Boolean(searchText) || stateFilter !== "ALL" || priorityFilter !== "ALL" || dueFilter !== "ALL";
  function exportFilteredDecisions() {
    if (!selection.matchingRecords.length) return;
    const csv = buildDailyDecisionBoardCsv({
      records: selection.matchingRecords,
      loadedCount: result.loadedCount,
      totalCount: result.totalCount,
    });
    const url = window.URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "nasr1-daily-decisions-" + new Date().toISOString().slice(0, 10) + ".csv";
    anchor.click();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  }
  return (
    <section dir="rtl" className="min-w-0 space-y-3 rounded-xl border p-3 sm:p-4" aria-labelledby="daily-decision-board-title">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="daily-decision-board-title" className="text-lg font-semibold">لوحة متابعة القرارات اليومية</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            ابحث وصفِّ كامل القرارات المحمّلة قبل عرض أعلى عشرة نتائج مطابقة؛ الترتيب يقدّم الأولوية المحفوظة ثم الأثر القابل للمقارنة داخل العملة والوحدة ثم الاستحقاق وحالة التنفيذ.
          </p>
        </div>
        <span role="status" aria-live="polite" className="w-fit max-w-full rounded-full border px-3 py-1 text-xs break-words">
          {result.status === "VERIFIED" ? "تغطية مكتملة" : result.status === "PARTIAL" ? "تغطية جزئية" : result.status === "EMPTY" ? "لا توجد قرارات" : "المصدر غير متاح"}
        </span>
      </header>

      {result.records.some(record => !record.candidateSnapshot) ? (
        <div className="min-w-0 break-words rounded-lg border p-3 text-xs text-muted-foreground">
          بعض القرارات القديمة لا تملك لقطة أولوية وأثر محفوظة؛ تبقى ظاهرة كسجل تاريخي ولا يُستنتج لها تصنيف بأثر رجعي.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <article className="min-w-0 rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">قرارات محفوظة</p>
          <strong className="text-xl tabular-nums">{result.totalCount}</strong>
        </article>
        <article className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">قرارات محمّلة</p>
          <strong className="text-xl tabular-nums">{result.loadedCount}</strong>
        </article>
        <article className="rounded-lg bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">نتائج مقاسة ومثبتة</p>
          <strong className="text-xl tabular-nums">{result.verifiedMeasurementCount}</strong>
        </article>
      </div>

      {result.records.length > 0 ? (
        <section className="space-y-2 rounded-lg border p-3" aria-label="بحث وتصفية القرارات اليومية">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span className="block">البحث في جميع القرارات المحمّلة</span>
              <input
                type="search"
                aria-label="ابحث في القرارات اليومية"
                value={searchText}
                onChange={event => setSearchText(event.target.value)}
                placeholder="القرار أو المسؤول أو السبب أو الدليل..."
                className="w-full rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">حالة القرار</span>
              <select aria-label="تصفية حالة القرار" value={stateFilter}
                onChange={event => setStateFilter(event.target.value as DailyDecisionStateFilter)}
                className="w-full rounded-lg border bg-background px-3 py-2">
                <option value="ALL">كل الحالات</option>
                {Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">الأولوية المحفوظة</span>
              <select aria-label="تصفية أولوية القرار" value={priorityFilter}
                onChange={event => setPriorityFilter(event.target.value as DailyDecisionPriorityFilter)}
                className="w-full rounded-lg border bg-background px-3 py-2">
                <option value="ALL">كل الأولويات</option>
                <option value="P0">P0 — حرجة</option>
                <option value="P1">P1 — مرتفعة</option>
                <option value="P2">P2 — متوسطة</option>
                <option value="P3">P3 — متابعة</option>
                <option value="UNRANKED">قرارات تاريخية بلا أولوية محفوظة</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">موعد المراجعة</span>
              <select aria-label="تصفية موعد المراجعة" value={dueFilter}
                onChange={event => setDueFilter(event.target.value as DailyDecisionDueFilter)}
                className="w-full rounded-lg border bg-background px-3 py-2">
                <option value="ALL">كل المواعيد</option>
                <option value="OVERDUE">متأخر أو مستحق الآن</option>
                <option value="DUE_7_DAYS">مستحق خلال 7 أيام</option>
                <option value="UNSCHEDULED">غير مجدول</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>يعرض {records.length} من {selection.matchedCount} نتيجة مطابقة ضمن {result.loadedCount} قراراً محمّلاً</span>
            <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-40"
              disabled={!hasFilters}
              onClick={() => { setSearchText(""); setStateFilter("ALL"); setPriorityFilter("ALL"); setDueFilter("ALL"); }}>
              مسح البحث والتصفية
            </button>
            <button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-40"
              disabled={selection.matchedCount === 0}
              onClick={exportFilteredDecisions}>
              تصدير جميع النتائج المطابقة CSV ({selection.matchedCount})
            </button>
          </div>
        </section>
      ) : null}

      {result.status === "UNAVAILABLE" ? (
        <div className="rounded-lg border p-3" role="alert">
          <p className="text-sm">تعذر تحميل سجل القرارات من الخادم؛ لا تُعرض بطاقات افتراضية.</p>
          {onRetry ? <button type="button" className="mt-2 rounded-lg border px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={onRetry}>إعادة المحاولة</button> : null}
        </div>
      ) : result.records.length === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground">لا توجد قرارات محفوظة لعرضها في لوحة المتابعة.</p>
      ) : selection.matchedCount === 0 ? (
        <p className="rounded-lg border p-3 text-sm text-muted-foreground" role="status">لا توجد قرارات تطابق البحث والتصفية الحالية.</p>
      ) : (
        <ol className="min-w-0 space-y-3" aria-label="قرارات محفوظة مرتبة للمتابعة">
          {records.map(record => (
            <li key={record.decisionId} className="min-w-0">
              <DecisionCard record={record} now={now} onChanged={onRetry}/>
            </li>
          ))}
        </ol>
      )}
      {omittedCount > 0 ? (
        <p className="text-xs text-muted-foreground" role="status">يُعرض أعلى 10 من {selection.matchedCount} نتيجة مطابقة؛ {omittedCount} نتيجة مطابقة أخرى ضمن السجلات المحمّلة. وسّع التصفية لعرضها.</p>
      ) : null}
      {result.status === "PARTIAL" || result.loadedCount < result.totalCount ? (
        <p className="text-xs text-muted-foreground" role="status">
          لا تشمل هذه اللوحة كامل تاريخ القرارات. النتائج المعروضة محدودة بالسجلات المحملة والمتحقق منها فقط.
        </p>
      ) : null}
    </section>
  );
}
