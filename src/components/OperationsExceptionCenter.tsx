import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { createCashflowScheduleRequest, fetchCashflowSchedule, type CashflowScheduleResult } from "@/lib/intelligence/cashflow-schedule-client";
import { AlertTriangle, ClipboardList, Search } from "lucide-react";
import { fetchImportJobs, fetchInventoryReconciliationRuns, fetchOperationalTasks } from "@/lib/api";
import type { ImportJob, OperationalTask } from "@/lib/types";
import { buildOperationsExceptions, buildSupplierDueDateExceptions, type OperationsException, type OperationsExceptionKind } from "@/lib/operations-exceptions";
import { Empty, ErrorBox, Loading } from "@/components/AdminPages";

type LoadedSources = {
  tasks: OperationalTask[];
  imports: ImportJob[];
  reconciliationRuns: unknown[];
  supplierSchedule: CashflowScheduleResult | null;
  supplierScheduleEnabled: boolean;
  errors: { tasks: string | null; imports: string | null; reconciliation: string | null; supplier: string | null };
  loading: boolean;
  loadedAt: string | null;
};

const initialSources: LoadedSources = {
  tasks: [],
  imports: [],
  reconciliationRuns: [],
  supplierSchedule: null,
  supplierScheduleEnabled: false,
  errors: { tasks: null, imports: null, reconciliation: null, supplier: null },
  loading: true,
  loadedAt: null,
};

const priorityLabels = { critical: "حرجة", high: "مرتفعة", medium: "متوسطة", low: "منخفضة" } as const;
const kindLabels: Record<OperationsExceptionKind, string> = {
  task: "مهمة تشغيلية",
  import: "استيراد",
  reconciliation: "مطابقة مخزون",
  supplier_due_date: "استحقاق مورد",
};

function errorMessage(value: PromiseSettledResult<unknown>, label: string): string | null {
  return value.status === "rejected" ? "تعذر تحميل مصدر " + label + ". بقيت بقية المصادر متاحة." : null;
}

function dateText(value: string | null): string {
  if (!value) return "غير محدد في المصدر";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString("ar-YE", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "تاريخ غير صالح";
}

function ExceptionAction({ item, onOpen }: { item: OperationsException; onOpen: (item: OperationsException) => void }) {
  return <button type="button" className="btn secondary" onClick={() => onOpen(item)}>{item.actionLabel}</button>;
}

export function OperationsExceptionCenter({
  refreshVersion,
  onOpenTask,
  onOpenImportJob,
  onOpenReconciliationRun,
  onOpenSupplierInvoice,
}: {
  refreshVersion: number;
  onOpenTask: (taskId: string) => void;
  onOpenImportJob: (jobId: string) => void;
  onOpenReconciliationRun: (runId: string) => void;
  onOpenSupplierInvoice: (invoiceId: string) => void;
}) {
  const { user, sessionRevision } = useAuth();
  const canReadSupplierSchedule = Boolean(user?.roles.some((role) => ["admin", "manager", "accountant"].includes(role)));
  const [sources, setSources] = useState<LoadedSources>(initialSources);
  const [kindFilter, setKindFilter] = useState<"all" | OperationsExceptionKind>("all");
  const [priorityFilter, setPriorityFilter] = useState<"all" | keyof typeof priorityLabels>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    let active = true;
    setSources((current) => ({ ...current, loading: true }));
    void Promise.allSettled([
      fetchOperationalTasks(),
      fetchImportJobs(),
      fetchInventoryReconciliationRuns(),
      canReadSupplierSchedule
        ? fetchCashflowSchedule(createCashflowScheduleRequest({ horizonDays: 30 }))
        : Promise.resolve(null),
    ]).then(([tasksResult, importsResult, reconciliationResult, supplierResult]) => {
      if (!active) return;
      setSources({
        tasks: tasksResult.status === "fulfilled" ? tasksResult.value : [],
        imports: importsResult.status === "fulfilled" ? importsResult.value : [],
        reconciliationRuns: reconciliationResult.status === "fulfilled" ? reconciliationResult.value : [],
        supplierSchedule: supplierResult.status === "fulfilled" ? supplierResult.value : null,
        supplierScheduleEnabled: canReadSupplierSchedule,
        errors: {
          tasks: errorMessage(tasksResult, "المهام"),
          imports: errorMessage(importsResult, "الاستيراد"),
          reconciliation: errorMessage(reconciliationResult, "مطابقة المخزون"),
          supplier: !canReadSupplierSchedule ? null
            : supplierResult.status === "rejected" ? "تعذر تحميل مصدر استحقاقات الموردين. لم تُفترض التزامات بقيمة صفر."
              : supplierResult.value && !supplierResult.value.ok ? supplierResult.value.message : null,
        },
        loading: false,
        loadedAt: new Date().toISOString(),
      });
    });
    return () => { active = false; };
  }, [refreshVersion, canReadSupplierSchedule, user?.id, user?.profileId, sessionRevision]);

  const exceptions = useMemo(
    () => [
      ...buildOperationsExceptions(sources.tasks, sources.imports, sources.reconciliationRuns),
      ...buildSupplierDueDateExceptions(sources.supplierSchedule),
    ].sort((left, right) =>
      (left.dueAt ? Date.parse(left.dueAt) : Number.MAX_SAFE_INTEGER) -
        (right.dueAt ? Date.parse(right.dueAt) : Number.MAX_SAFE_INTEGER) ||
      left.id.localeCompare(right.id)),
    [sources.tasks, sources.imports, sources.reconciliationRuns, sources.supplierSchedule],
  );
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("ar");
    return exceptions.filter((item) => {
      if (kindFilter !== "all" && item.kind !== kindFilter) return false;
      if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
      if (!needle) return true;
      return [item.title, item.reason, item.evidence, item.sourceReference, item.sourceLabel]
        .some((value) => value.toLocaleLowerCase("ar").includes(needle));
    });
  }, [exceptions, kindFilter, priorityFilter, search]);

  const overdueCount = exceptions.filter((item) => item.isOverdue).length;
  const highPriorityCount = exceptions.filter((item) => item.priority === "critical" || item.priority === "high").length;
  const importCount = exceptions.filter((item) => item.kind === "import").length;
  const supplierDueCount = exceptions.filter((item) => item.kind === "supplier_due_date").length;
  const supplierSchedulePartial = sources.supplierScheduleEnabled && (
    !sources.supplierSchedule?.ok ||
    sources.supplierSchedule.data.schedule.status !== "VERIFIED" ||
    sources.supplierSchedule.data.schedule.completeness !== "COMPLETE" ||
    sources.supplierSchedule.data.schedule.quality !== "ACCEPTABLE"
  );

  function openSource(item: OperationsException) {
    if (item.kind === "task") onOpenTask(item.sourceId);
    else if (item.kind === "import") onOpenImportJob(item.sourceId);
    else if (item.kind === "reconciliation") onOpenReconciliationRun(item.sourceId);
    else onOpenSupplierInvoice(item.sourceId);
  }

  return (
    <section className="operations-exception-center" aria-label="مركز الاستثناءات الموحد">
      <div className="panel">
        <div className="panel-head">
          <div>
            <span className="text-sm text-muted-foreground">متابعة موحدة من السجلات المعتمدة</span>
            <h2>مركز الاستثناءات الموحد</h2>
            <p>يعرض المهام المفتوحة ودفعات الاستيراد المتعثرة وفروقات المطابقة واستحقاقات الموردين المثبتة بمستندات محفوظة. العرض للقراءة فقط؛ لا ينشئ دفعات ولا يغيّر الأرصدة أو السجلات، ولا يعرض القيم المالية.</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <ClipboardList size={20} />
            <span>{exceptions.length.toLocaleString("ar-YE")} سجل متابعة</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-3"><span className="text-sm text-muted-foreground">السجلات المفتوحة</span><strong className="block text-2xl">{exceptions.length.toLocaleString("ar-YE")}</strong></div>
          <div className="rounded-lg border p-3"><span className="text-sm text-muted-foreground">عالية الأولوية</span><strong className="block text-2xl">{highPriorityCount.toLocaleString("ar-YE")}</strong></div>
          <div className="rounded-lg border p-3"><span className="text-sm text-muted-foreground">مهام تجاوزت موعدها</span><strong className="block text-2xl">{overdueCount.toLocaleString("ar-YE")}</strong></div>
          <div className="rounded-lg border p-3"><span className="text-sm text-muted-foreground">دفعات الاستيراد المتعثرة</span><strong className="block text-2xl">{importCount.toLocaleString("ar-YE")}</strong></div>
          {sources.supplierScheduleEnabled && <div className="rounded-lg border p-3"><span className="text-sm text-muted-foreground">استحقاقات الموردين المثبتة خلال 30 يوماً</span><strong className="block text-2xl">{supplierDueCount.toLocaleString("ar-YE")}</strong><span className="text-xs text-muted-foreground">عدد السجلات فقط — دون مبالغ أو عملات</span></div>}
        </div>
      </div>

      {sources.errors.tasks && <div role="status" className="mt-3"><ErrorBox message={sources.errors.tasks} /></div>}
      {sources.errors.imports && <div role="status" className="mt-3"><ErrorBox message={sources.errors.imports} /></div>}
      {sources.errors.reconciliation && <div role="status" className="mt-3"><ErrorBox message={sources.errors.reconciliation} /></div>}
      {sources.errors.supplier && <div role="status" className="mt-3"><ErrorBox message={sources.errors.supplier} /></div>}
      {supplierSchedulePartial && <p role="status" className="panel mt-3 text-sm">مصدر استحقاقات الموردين غير مكتمل أو غير متاح بالكامل؛ تُعرض السجلات ذات الدليل المحقق فقط، وغياب السجل لا يعني عدم وجود التزام.</p>}

      <div className="panel mt-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="form-field">
            <span>نوع الاستثناء</span>
            <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)}>
              <option value="all">كل المصادر</option>
              <option value="task">المهام التشغيلية</option>
              <option value="import">الاستيراد</option>
              <option value="reconciliation">مطابقة المخزون</option>
              {sources.supplierScheduleEnabled && <option value="supplier_due_date">استحقاقات الموردين</option>}
            </select>
          </label>
          <label className="form-field">
            <span>الأولوية</span>
            <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as typeof priorityFilter)}>
              <option value="all">كل الأولويات</option>
              <option value="critical">حرجة</option>
              <option value="high">مرتفعة</option>
              <option value="medium">متوسطة</option>
              <option value="low">منخفضة</option>
            </select>
          </label>
          <label className="form-field">
            <span><Search size={14} className="inline" /> بحث في السبب والمرجع</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="رقم سجل أو كلمة من السبب" maxLength={120} />
          </label>
        </div>
      </div>

      {sources.loading ? <Loading /> : filtered.length === 0 ? (
        <div className="panel mt-3">
          <Empty text={exceptions.length === 0 ? "لا توجد استثناءات مثبتة في المصادر المحملة." : "لا توجد نتائج تطابق عوامل التصفية."} />
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          {filtered.map((item) => (
            <article key={item.id} className="panel">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{item.category}</span>
                <span className={"badge " + (item.priority === "critical" || item.priority === "high" ? "danger" : "warning")}>{priorityLabels[item.priority]}</span>
              </div>
              <h3 className="mt-2 text-lg font-semibold">{item.title}</h3>
              <p className="mt-2">{item.reason}</p>
              <p className="mt-2 text-sm text-muted-foreground">{item.evidence}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div><span className="font-medium">المصدر: </span>{item.sourceLabel}</div>
                <div><span className="font-medium">الحالة: </span>{item.statusLabel}</div>
                <div><span className="font-medium">المسؤول: </span>{item.ownerLabel}</div>
                <div><span className="font-medium">الموعد: </span>{dateText(item.dueAt)}</div>
                <div className="break-all"><span className="font-medium">مرجع السجل: </span><code>{item.sourceReference}</code></div>
                <div><span className="font-medium">الإنشاء: </span>{dateText(item.createdAt)}</div>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                {item.isOverdue
                  ? <span className="inline-flex items-center gap-1 text-sm font-semibold text-red-700"><AlertTriangle size={15} /> متأخرة</span>
                  : <span className="text-sm text-muted-foreground">{kindLabels[item.kind]}</span>}
                <ExceptionAction item={item} onOpen={openSource} />
              </div>
            </article>
          ))}
        </div>
      )}
      {sources.loadedAt && <p className="mt-3 text-xs text-muted-foreground">آخر قراءة للمصادر: {dateText(sources.loadedAt)} — لم تُجر أي كتابة على البيانات.</p>}
    </section>
  );
}
