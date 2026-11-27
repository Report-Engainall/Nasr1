import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { createUnavailableProductDemandFollowUpTask } from "@/lib/intelligence/unavailable-product-search-demand-client";
import { createDecisionOutcomeProposal, type DecisionCandidateSnapshot } from "@/lib/intelligence/decision-outcome-client";
import type { GrowthOpportunity, GrowthOpportunityRadarResult } from "@/lib/intelligence/growth-opportunities";
import { EvidenceReferences, EvidenceStatusLabel, formatEvidenceNumber, IntelligenceStatePanel, type IntelligenceViewState } from "./shared";

export interface GrowthOpportunityRadarProps {
  result?: GrowthOpportunityRadarResult | null;
  state?: IntelligenceViewState;
  onRetry?: () => void;
  onOpenRecord?: (kind: GrowthOpportunity["kind"], subjectRef: string) => void;
}

const priorityLabels = { P1: "مرتفع", P2: "متوسط", P3: "متابعة" } as const;
const sourceLabels: Record<NonNullable<GrowthOpportunityRadarResult["sourceCoverage"]>[number]["key"], string> = {
  CUSTOMER_RETENTION: "نشاط العملاء والشراء المتكرر",
  UNAVAILABLE_PRODUCT_DEMAND: "الطلب على المنتجات غير المتاحة",
  PRODUCT_PERFORMANCE: "اتجاه أداء المنتجات",
};
const sourceStatusLabels = {
  VERIFIED: "مكتمل وموثق",
  PARTIAL: "تغطية جزئية",
  UNAVAILABLE: "غير متاح",
  DENIED: "غير مصرح",
  ERROR: "تعذر التحقق",
} as const;
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

export type GrowthOpportunityPriorityFilter = "ALL" | GrowthOpportunity["priority"];
export type GrowthOpportunityKindFilter = "ALL" | GrowthOpportunity["kind"];

export interface GrowthOpportunityFilters {
  searchText: string;
  priority: GrowthOpportunityPriorityFilter;
  kind: GrowthOpportunityKindFilter;
}

/** Arabic-aware normalization for merchant search; it does not mutate source evidence. */
export function normalizeGrowthOpportunitySearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLocaleLowerCase("ar")
    .trim()
    .replace(/\s+/g, " ");
}

export function filterAndSortGrowthOpportunities(
  opportunities: GrowthOpportunity[],
  filters: GrowthOpportunityFilters,
): GrowthOpportunity[] {
  const query = normalizeGrowthOpportunitySearch(filters.searchText);
  const priorityOrder: Record<GrowthOpportunity["priority"], number> = { P1: 0, P2: 1, P3: 2 };
  return opportunities
    .filter(opportunity => {
      if (filters.priority !== "ALL" && opportunity.priority !== filters.priority) return false;
      if (filters.kind !== "ALL" && opportunity.kind !== filters.kind) return false;
      if (!query) return true;
      const searchable = normalizeGrowthOpportunitySearch([
        opportunity.kind,
        opportunity.priority,
        opportunity.title,
        opportunity.what,
        opportunity.why,
        opportunity.soWhat,
        opportunity.whatNext,
        opportunity.owner,
        opportunity.expectedOutcome,
        opportunity.subjectRef,
        opportunity.period.from,
        opportunity.period.to,
      ].join(" "));
      return searchable.includes(query);
    })
    .sort((left, right) =>
      priorityOrder[left.priority] - priorityOrder[right.priority] ||
      right.asOf.localeCompare(left.asOf) ||
      left.id.localeCompare(right.id),
    );
}

export function paginateGrowthOpportunities(
  opportunities: GrowthOpportunity[],
  requestedPage: number,
  pageSize = 5,
): { items: GrowthOpportunity[]; page: number; pageCount: number; totalCount: number } {
  const safePageSize = Number.isSafeInteger(pageSize) && pageSize > 0 ? pageSize : 5;
  const pageCount = Math.ceil(opportunities.length / safePageSize);
  const requested = Number.isFinite(requestedPage) ? Math.max(0, Math.floor(requestedPage)) : 0;
  const page = pageCount === 0 ? 0 : Math.min(requested, pageCount - 1);
  const start = page * safePageSize;
  return {
    items: opportunities.slice(start, start + safePageSize),
    page,
    pageCount,
    totalCount: opportunities.length,
  };
}

const growthKindLabels: Record<GrowthOpportunity["kind"], string> = {
  QUOTE_UNCONVERTED: "عرض سعر غير محول",
  PRODUCT_UNAVAILABLE_DEMAND: "طلب على منتج غير متاح",
  CUSTOMER_ACTIVITY_DECLINE: "تراجع نشاط العملاء",
  REPEAT_PURCHASE: "شراء متكرر",
  PRODUCT_PERFORMANCE_CHANGE: "تغير أداء المنتج",
};

function growthCsvCell(value: unknown): string {
  let text = value === null || value === undefined ? "" : String(value);
  // A leading apostrophe keeps spreadsheet software from executing text as a formula.
  if (/^[\s\u0000-\u001F]*[=+\-@]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export function buildGrowthOpportunityCsv(opportunities: GrowthOpportunity[]): string {
  const headers = [
    "الفرصة", "نوع الفرصة", "الأولوية", "القيمة الحالية المثبتة", "قيمة فترة الأساس",
    "التغير النسبي %", "الوحدة", "العملة", "وحدة الصنف", "المسؤول المقترح",
    "الفترة من", "الفترة إلى", "حتى تاريخ", "سبب الإشارة", "الأهمية",
    "الخطوة التالية", "النتيجة المتوقعة", "مراجع الإثبات", "مفاتيح المؤشرات", "إصدارات المعادلات",
  ];
  const rows = opportunities.map(opportunity => [
    opportunity.title,
    growthKindLabels[opportunity.kind],
    opportunity.priority,
    opportunity.observedValue,
    opportunity.baselineValue,
    opportunity.changePercent,
    opportunity.unit,
    opportunity.currency ?? "",
    opportunity.unitOfMeasure ?? "",
    opportunity.owner,
    opportunity.period.from,
    opportunity.period.to,
    opportunity.asOf,
    opportunity.why,
    opportunity.soWhat,
    opportunity.whatNext,
    opportunity.expectedOutcome,
    [...new Set(opportunity.proof.evidenceIds)].join(" | "),
    [...new Set(opportunity.proof.metricKeys)].join(" | "),
    [...new Set(opportunity.proof.formulaVersions)].join(" | "),
  ]);
  return "\uFEFF" + [headers, ...rows].map(row => row.map(growthCsvCell).join(",")).join("\r\n");
}

export function downloadGrowthOpportunityCsv(opportunities: GrowthOpportunity[]): void {
  if (opportunities.length === 0) return;
  const blob = new Blob([buildGrowthOpportunityCsv(opportunities)], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "nasr1-growth-opportunities-" + new Date().toISOString().slice(0, 10) + ".csv";
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function numberLabel(value: number | null, unit: string, currency?: string, unitOfMeasure?: string): string {
  if (value === null || !Number.isFinite(value)) return "غير متاح";
  return formatEvidenceNumber(value) + " " + (currency ?? unitOfMeasure ?? unit);
}

function GrowthOpportunityCard({
  opportunity,
  onOpenRecord,
  canCreateFollowUpTask,
  canCreateDecisionProposal,
  followUpBusy,
  followUpMessage,
  onCreateFollowUpTask,
  onCreateDecisionProposal,
}: {
  opportunity: GrowthOpportunity;
  onOpenRecord?: GrowthOpportunityRadarProps["onOpenRecord"];
  canCreateFollowUpTask: boolean;
  canCreateDecisionProposal: boolean;
  followUpBusy: boolean;
  followUpMessage: string | null;
  onCreateFollowUpTask: (opportunity: GrowthOpportunity) => void;
  onCreateDecisionProposal: (opportunity: GrowthOpportunity) => void;
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
      {onOpenRecord || canCreateDecisionProposal || (canCreateFollowUpTask && opportunity.kind === "PRODUCT_UNAVAILABLE_DEMAND") ? (
        <footer className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
          {onOpenRecord ? (
            <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onOpenRecord(opportunity.kind, opportunity.subjectRef)}>
              فتح السجل المرتبط
            </button>
          ) : null}
          {canCreateDecisionProposal ? (
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-sm"
              disabled={followUpBusy || opportunity.proof.evidenceIds.length === 0 ||
                opportunity.proof.metricKeys.length === 0 || opportunity.proof.formulaVersions.length === 0 ||
                opportunity.id.length > 150}
              onClick={() => onCreateDecisionProposal(opportunity)}
            >
              {followUpBusy ? "جارٍ حفظ القرار…" : "حفظ كقرار إداري للمتابعة"}
            </button>
          ) : null}
          {canCreateFollowUpTask && opportunity.kind === "PRODUCT_UNAVAILABLE_DEMAND" ? (
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-sm"
              disabled={followUpBusy}
              onClick={() => onCreateFollowUpTask(opportunity)}
            >
              {followUpBusy ? "جارٍ إنشاء مهمة المراجعة…" : "إنشاء مهمة مراجعة للمشتريات"}
            </button>
          ) : null}
          {followUpMessage ? <p className="w-full text-xs text-muted-foreground" role="status">{followUpMessage}</p> : null}
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
  const { user } = useAuth();
  const canManageIntelligenceFollowUps = Boolean(
    user && Array.isArray(user.roles) &&
    (user.roles.includes("admin") || user.roles.includes("manager")),
  );
  const canCreateFollowUpTask = canManageIntelligenceFollowUps;
  const canCreateDecisionProposal = Boolean(
    canManageIntelligenceFollowUps && typeof user?.profileId === "string",
  );
  const [busyOpportunityId, setBusyOpportunityId] = useState<string | null>(null);
  const [followUpMessages, setFollowUpMessages] = useState<Record<string, string>>({});
  const [searchText, setSearchText] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<GrowthOpportunityPriorityFilter>("ALL");
  const [kindFilter, setKindFilter] = useState<GrowthOpportunityKindFilter>("ALL");
  const [page, setPage] = useState(0);
  const allOpportunities = result?.opportunities ?? [];
  const filteredOpportunities = filterAndSortGrowthOpportunities(allOpportunities, {
    searchText,
    priority: priorityFilter,
    kind: kindFilter,
  });
  const paginatedOpportunities = paginateGrowthOpportunities(filteredOpportunities, page);
  const priorityCounts = allOpportunities.reduce(
    (counts, opportunity) => {
      counts[opportunity.priority] += 1;
      return counts;
    },
    { P1: 0, P2: 0, P3: 0 },
  );

  async function createFollowUpTask(opportunity: GrowthOpportunity) {
    if (!canCreateFollowUpTask || opportunity.kind !== "PRODUCT_UNAVAILABLE_DEMAND" || busyOpportunityId) return;
    setBusyOpportunityId(opportunity.id);
    setFollowUpMessages(current => ({ ...current, [opportunity.id]: "" }));
    const result = await createUnavailableProductDemandFollowUpTask({
      productId: opportunity.subjectRef,
      period: opportunity.period,
      asOf: opportunity.asOf,
    });
    setBusyOpportunityId(null);
    setFollowUpMessages(current => ({
      ...current,
      [opportunity.id]: result.ok
        ? result.reused
          ? "المهمة موجودة مسبقاً للفترة نفسها؛ أُعيد استخدام المهمة دون إنشاء نسخة."
          : "أُنشئت مهمة مراجعة المشتريات في قائمة المهام."
        : result.message,
    }));
  }

  async function createDecisionProposal(opportunity: GrowthOpportunity) {
    if (!canCreateDecisionProposal || !user?.profileId || busyOpportunityId) return;
    if (opportunity.id.length > 150 || opportunity.proof.evidenceIds.length === 0 ||
        opportunity.proof.metricKeys.length === 0 || opportunity.proof.formulaVersions.length === 0) {
      setFollowUpMessages(current => ({
        ...current,
        [opportunity.id]: "لم يُحفظ القرار: لقطة الفرصة لا تحتوي هوية أو أدلة ومعادلات مكتملة.",
      }));
      return;
    }

    const ruleByKind: Record<GrowthOpportunity["kind"], string> = {
      QUOTE_UNCONVERTED: "growth.quote.unconverted",
      PRODUCT_UNAVAILABLE_DEMAND: "growth.product.unavailable-demand",
      CUSTOMER_ACTIVITY_DECLINE: "growth.customer.activity-decline",
      REPEAT_PURCHASE: "growth.customer.repeat-purchase",
      PRODUCT_PERFORMANCE_CHANGE: "growth.product.performance-change",
    };
    const priorityScore = opportunity.priority === "P1" ? 300
      : opportunity.priority === "P2" ? 200 : 100;
    const ruleId = ruleByKind[opportunity.kind];
    const candidateId = opportunity.id;
    const expectedOutcome = opportunity.expectedOutcome.trim();
    const candidateSnapshot: DecisionCandidateSnapshot = {
      schemaVersion: "1.0.0",
      candidateId,
      ruleId,
      ruleVersion: opportunity.policyVersion,
      priority: opportunity.priority,
      priorityScore,
      what: (opportunity.title + " — " + opportunity.what).slice(0, 500),
      why: opportunity.why.slice(0, 2000),
      risk: opportunity.soWhat.slice(0, 2000),
      soWhat: opportunity.soWhat.slice(0, 2000),
      whatNext: opportunity.whatNext.slice(0, 2000),
      owner: opportunity.owner.slice(0, 150),
      expectedOutcome: expectedOutcome.slice(0, 2000),
      impact: null,
      impactStatus: "WITHHELD",
      impactReason: "GROWTH_OPPORTUNITY_IS_NOT_A_VERIFIED_FINANCIAL_FORECAST",
      proof: {
        evidenceIds: [...opportunity.proof.evidenceIds],
        metricKeys: [...opportunity.proof.metricKeys],
        asOf: opportunity.asOf,
        formulaVersions: [...opportunity.proof.formulaVersions],
      },
      createdAt: opportunity.asOf,
      expiresAt: null,
    };

    setBusyOpportunityId(opportunity.id);
    setFollowUpMessages(current => ({ ...current, [opportunity.id]: "" }));
    try {
      const saved = await createDecisionOutcomeProposal({
        candidateId,
        ruleId,
        ruleVersion: opportunity.policyVersion,
        ownerProfileId: user.profileId,
        expectedOutcome: expectedOutcome.slice(0, 2000),
        reason: opportunity.why.slice(0, 2000),
        candidateSnapshot,
      });
      setFollowUpMessages(current => ({
        ...current,
        [opportunity.id]: saved.ok
          ? saved.duplicate
            ? "هذا القرار محفوظ مسبقاً؛ أُعيد استخدام سجلّه الحالي دون إنشاء نسخة."
            : "حُفظ القرار في دورة القرارات بالخادم مع أدلته وأولويته؛ لم يُعتمد أو يُنفذ تلقائياً."
          : saved.message,
      }));
      if (saved.ok) onRetry?.();
    } catch {
      setFollowUpMessages(current => ({
        ...current,
        [opportunity.id]: "تعذر إكمال حفظ القرار؛ لم تُعرض نتيجة نجاح غير مؤكدة.",
      }));
    } finally {
      setBusyOpportunityId(null);
    }
  }

  if (state !== "ready") {
    return <IntelligenceStatePanel state={state} onRetry={onRetry} errorMessage="تعذر تحميل رادار فرص النمو." />;
  }
  if (!result) {
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
      {result.sourceCoverage?.length ? (
        <section className="rounded-lg border p-3" aria-label="تغطية مصادر رادار النمو">
          <h3 className="mb-2 text-sm font-semibold">مصادر التحليل وحدود تغطيتها</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {result.sourceCoverage.map(source => (
              <article key={source.key} className="rounded-lg border p-3 text-xs">
                <p className="font-semibold">{sourceLabels[source.key]}</p>
                <p className="mt-1">{sourceStatusLabels[source.status]}</p>
                <p className="mt-1 text-muted-foreground">
                  {formatEvidenceNumber(source.signalCount)} إشارة · {formatEvidenceNumber(source.evidenceCount)} دليل
                </p>
                {source.message ? <p className="mt-2 text-muted-foreground">{source.message}</p> : null}
                {source.warnings.length ? (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-muted-foreground">حدود المصدر ({source.warnings.length})</summary>
                    <ul className="mt-1 list-disc space-y-1 ps-4 text-muted-foreground">
                      {source.warnings.map((warning, index) => <li key={source.key + ":" + index}>{warning}</li>)}
                    </ul>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}
      {result.opportunities.length > 0 ? (
        <section className="space-y-3 rounded-lg border p-3" aria-label="البحث وتصفية فرص النمو">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg border p-2 text-xs">
              <span className="text-muted-foreground">أولوية مرتفعة P1</span>
              <p className="text-lg font-semibold">{priorityCounts.P1}</p>
            </div>
            <div className="rounded-lg border p-2 text-xs">
              <span className="text-muted-foreground">أولوية متوسطة P2</span>
              <p className="text-lg font-semibold">{priorityCounts.P2}</p>
            </div>
            <div className="rounded-lg border p-2 text-xs">
              <span className="text-muted-foreground">متابعة P3</span>
              <p className="text-lg font-semibold">{priorityCounts.P3}</p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-sm">
              <span className="block">البحث في الفرص</span>
              <input
                type="search"
                aria-label="ابحث في فرص النمو"
                value={searchText}
                onChange={event => { setSearchText(event.target.value); setPage(0); }}
                placeholder="اسم الفرصة أو الدليل أو المسؤول..."
                className="w-full rounded-lg border bg-background px-3 py-2"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">الأولوية</span>
              <select
                aria-label="تصفية حسب الأولوية"
                value={priorityFilter}
                onChange={event => { setPriorityFilter(event.target.value as GrowthOpportunityPriorityFilter); setPage(0); }}
                className="w-full rounded-lg border bg-background px-3 py-2"
              >
                <option value="ALL">كل الأولويات</option>
                <option value="P1">مرتفعة P1</option>
                <option value="P2">متوسطة P2</option>
                <option value="P3">متابعة P3</option>
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block">نوع الفرصة</span>
              <select
                aria-label="تصفية حسب نوع الفرصة"
                value={kindFilter}
                onChange={event => { setKindFilter(event.target.value as GrowthOpportunityKindFilter); setPage(0); }}
                className="w-full rounded-lg border bg-background px-3 py-2"
              >
                <option value="ALL">كل أنواع الفرص</option>
                <option value="QUOTE_UNCONVERTED">عروض أسعار غير محولة</option>
                <option value="PRODUCT_UNAVAILABLE_DEMAND">طلب على منتج غير متاح</option>
                <option value="CUSTOMER_ACTIVITY_DECLINE">تراجع نشاط العملاء</option>
                <option value="REPEAT_PURCHASE">شراء متكرر</option>
                <option value="PRODUCT_PERFORMANCE_CHANGE">تغير أداء المنتجات</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>يعرض {formatEvidenceNumber(paginatedOpportunities.totalCount)} من {formatEvidenceNumber(allOpportunities.length)} فرصة · الترتيب: الأعلى أولوية ثم الأحدث</span>
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-xs"
              disabled={!searchText && priorityFilter === "ALL" && kindFilter === "ALL"}
              onClick={() => { setSearchText(""); setPriorityFilter("ALL"); setKindFilter("ALL"); setPage(0); }}
            >
              مسح البحث والتصفية
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40"
              disabled={filteredOpportunities.length === 0}
              onClick={() => downloadGrowthOpportunityCsv(filteredOpportunities)}
            >
              تصدير الفرص المصفّاة CSV
            </button>
          </div>
        </section>
      ) : null}
      {result.opportunities.length > 0 && paginatedOpportunities.totalCount === 0 ? (
        <div role="status" className="rounded-lg border p-3 text-sm">
          لا توجد فرص تطابق البحث والتصفية الحالية؛ وسّع نطاق البحث أو امسح عوامل التصفية.
        </div>
      ) : null}
      {result.opportunities.length === 0 && result.withheld.length === 0 && result.status === "VERIFIED" ? (
        <div role="status" className="rounded-lg border p-3 text-sm">لا توجد فرص تجاوزت العتبات المحددة في مجتمع البيانات المكتمل لهذه الفترة.</div>
      ) : null}
      {result.opportunities.length === 0 && result.withheld.length === 0 && result.status !== "VERIFIED" ? (
        <div role="status" className="rounded-lg border p-3 text-sm">
          لا توجد فرصة يمكن إثباتها حالياً، لكن تغطية المصادر أو جودة بعض المؤشرات لا تسمح باستنتاج أن فرص النمو غير موجودة.
        </div>
      ) : null}
      {paginatedOpportunities.items.map(opportunity => (
        <GrowthOpportunityCard
          key={opportunity.id}
          opportunity={opportunity}
          onOpenRecord={onOpenRecord}
          canCreateFollowUpTask={canCreateFollowUpTask}
          canCreateDecisionProposal={canCreateDecisionProposal}
          followUpBusy={busyOpportunityId === opportunity.id}
          followUpMessage={followUpMessages[opportunity.id] || null}
          onCreateFollowUpTask={createFollowUpTask}
          onCreateDecisionProposal={createDecisionProposal}
        />
      ))}
      {paginatedOpportunities.pageCount > 1 ? (
        <nav className="flex flex-wrap items-center justify-center gap-3 rounded-lg border p-3" aria-label="صفحات فرص النمو">
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            disabled={paginatedOpportunities.page === 0}
            onClick={() => setPage(Math.max(0, paginatedOpportunities.page - 1))}
          >
            السابق
          </button>
          <span className="text-xs text-muted-foreground">
            الصفحة {paginatedOpportunities.page + 1} من {paginatedOpportunities.pageCount}
          </span>
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
            disabled={paginatedOpportunities.page >= paginatedOpportunities.pageCount - 1}
            onClick={() => setPage(Math.min(paginatedOpportunities.pageCount - 1, paginatedOpportunities.page + 1))}
          >
            التالي
          </button>
        </nav>
      ) : null}
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
