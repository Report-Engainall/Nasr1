import { useMemo, useState } from "react";
import { ActionCard, type ActionCardState } from "./ActionCard";
import {
  filterAndPaginateDailyDecisionActions,
  type DailyDecisionActionDomain,
  type DailyDecisionActionPriority,
} from "@/lib/intelligence/daily-decision-action-queue";
import type { DailyDecisionActionEnvelope } from "@/lib/intelligence/daily-decisions";
import type { DecisionCandidate, DecisionPriority } from "@/lib/intelligence/types";

export interface DailyDecisionActionQueueProps {
  actions: readonly DailyDecisionActionEnvelope<{ candidateId: string }>[];
  sourceOmittedCount?: number;
  state?: ActionCardState;
  errorMessage?: string;
  onRetry?: () => void;
  onPersist: (decision: DecisionCandidate, candidateId: string) => void | Promise<boolean>;
}

const priorityOptions: Array<{ value: DailyDecisionActionPriority; label: string }> = [
  { value: "ALL", label: "كل الأولويات" },
  { value: "P0", label: "حرج P0" },
  { value: "P1", label: "مرتفع P1" },
  { value: "P2", label: "متوسط P2" },
  { value: "P3", label: "منخفض P3" },
];

const priorityCounters: Array<{ value: DailyDecisionActionPriority; label: string }> = [
  { value: "ALL", label: "الكل" },
  { value: "P0", label: "حرج" },
  { value: "P1", label: "مرتفع" },
  { value: "P2", label: "متوسط" },
  { value: "P3", label: "منخفض" },
];

export function DailyDecisionActionQueue({
  actions,
  sourceOmittedCount = 0,
  state = "empty",
  errorMessage,
  onRetry,
  onPersist,
}: DailyDecisionActionQueueProps) {
  const [searchText, setSearchText] = useState("");
  const [priority, setPriority] = useState<DailyDecisionActionPriority>("ALL");
  const [domain, setDomain] = useState<DailyDecisionActionDomain>("ALL");
  const [requestedPage, setRequestedPage] = useState(0);
  const page = useMemo(() => filterAndPaginateDailyDecisionActions(actions, {
    searchText,
    priority,
    domain,
    requestedPage,
    pageSize: 10,
  }), [actions, searchText, priority, domain, requestedPage]);

  function resetFilters() {
    setSearchText("");
    setPriority("ALL");
    setDomain("ALL");
    setRequestedPage(0);
  }

  const emptyState: ActionCardState = state === "ready" ? "empty" : state;
  return (
    <section dir="rtl" aria-label="قائمة إجراءات القرار اليومية" className="space-y-3">
      <header className="space-y-1">
        <h3 className="font-semibold">الإجراءات اليومية القابلة للمراجعة</h3>
        <p className="text-xs text-muted-foreground">القائمة تشمل كل الإجراءات المحمّلة، وتحافظ على ترتيب الأولوية والأثر المثبت داخل العملة نفسها. حفظ الإجراء ينشئ مقترحاً للمراجعة فقط ولا ينفذ شراءً أو تغييراً تلقائياً.</p>
      </header>

      <div className="grid gap-2 md:grid-cols-3">
        <label className="space-y-1 text-sm">
          بحث في الإجراءات
          <input
            type="search"
            className="w-full rounded-lg border bg-background px-3 py-2"
            value={searchText}
            onChange={event => { setSearchText(event.target.value); setRequestedPage(0); }}
            placeholder="اسم الصنف أو سبب الإجراء أو مرجع الدليل..."
          />
        </label>
        <label className="space-y-1 text-sm">
          مجال الإجراء
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            value={domain}
            onChange={event => { setDomain(event.target.value as DailyDecisionActionDomain); setRequestedPage(0); }}
          >
            <option value="ALL">كل المجالات</option>
            <option value="INVENTORY">المخزون وإعادة التوريد</option>
            <option value="CUSTOMER">العملاء والاحتفاظ</option>
            <option value="CASHFLOW">السيولة والتحصيل</option>
            <option value="OTHER">مجالات أخرى</option>
          </select>
        </label>
        <label className="space-y-1 text-sm">
          الأولوية
          <select
            className="w-full rounded-lg border bg-background px-3 py-2"
            value={priority}
            onChange={event => { setPriority(event.target.value as DailyDecisionActionPriority); setRequestedPage(0); }}
          >
            {priorityOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">تصفية سريعة:</span>
        {priorityCounters.map(option => (
          <button
            key={option.value}
            type="button"
            className="rounded-full border px-3 py-1.5 text-xs"
            aria-pressed={priority === option.value}
            onClick={() => { setPriority(option.value); setRequestedPage(0); }}
          >
            {option.label} ({option.value === "ALL" ? page.searchCount : page.countsByPriority[option.value as DecisionPriority]})
          </button>
        ))}
        <button type="button" className="rounded-lg border px-3 py-1.5 text-xs" onClick={resetFilters}>مسح المرشحات</button>
      </div>

      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {page.totalCount === 0
          ? "لا توجد إجراءات مطابقة للبحث والمرشحات الحالية."
          : "يعرض " + page.firstItemNumber + "–" + page.lastItemNumber + " من " + page.totalCount + " إجراء مطابق، ضمن " + actions.length + " إجراء محمّل."}
      </p>
      {sourceOmittedCount > 0 ? (
        <p role="note" className="rounded-lg border p-3 text-xs text-muted-foreground">
          لم تُحمّل {sourceOmittedCount} إجراءات إضافية من مصدر متابعة العملاء بسبب حد تغطية المصدر؛ لا تعتبر القائمة شاملة لهذا الجزء حتى تُستكمل صفحاته من الخادم.
        </p>
      ) : null}

      {page.items.length > 0 ? (
        <div className="space-y-3">
          {page.items.map(action => (
            <ActionCard
              key={action.decision.id}
              decision={action.decision}
              state="ready"
              ctaLabel="حفظ الإجراء في دورة القرارات"
              onContinue={() => { void onPersist(action.decision, action.payload.candidateId); }}
            />
          ))}
        </div>
      ) : actions.length === 0 ? (
        <ActionCard state={emptyState} errorMessage={errorMessage} onRetry={onRetry} />
      ) : (
        <div className="rounded-lg border p-4 text-sm">
          لا توجد نتائج ضمن المرشحات الحالية. أزل بعض المرشحات أو ابحث بعبارة أخرى.
          <button type="button" className="ms-2 underline" onClick={resetFilters}>عرض كل الإجراءات</button>
        </div>
      )}

      {page.pageCount > 1 ? (
        <nav aria-label="صفحات إجراءات القرار" className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={page.page === 0} onClick={() => setRequestedPage(current => Math.max(0, current - 1))}>السابق</button>
          <span className="text-xs text-muted-foreground">صفحة {page.page + 1} من {page.pageCount}</span>
          <button type="button" className="rounded-lg border px-3 py-2 text-sm" disabled={page.page + 1 >= page.pageCount} onClick={() => setRequestedPage(current => Math.min(page.pageCount - 1, current + 1))}>التالي</button>
        </nav>
      ) : null}
    </section>
  );
}
