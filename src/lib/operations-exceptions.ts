import type { ImportJob, OperationalTask } from "./types";

export type OperationsExceptionKind = "task" | "import" | "reconciliation";
export type OperationsExceptionPriority = "low" | "medium" | "high" | "critical";

export interface OperationsException {
  id: string;
  kind: OperationsExceptionKind;
  category: string;
  title: string;
  reason: string;
  evidence: string;
  sourceId: string;
  sourceReference: string;
  sourceLabel: string;
  ownerLabel: string;
  dueAt: string | null;
  createdAt: string | null;
  statusLabel: string;
  priority: OperationsExceptionPriority;
  isOverdue: boolean;
  actionLabel: string;
}

type ReconciliationRun = {
  id?: unknown;
  snapshot_id?: unknown;
  status?: unknown;
  created_at?: unknown;
  changed_count?: unknown;
  new_count?: unknown;
  invalid_count?: unknown;
};

function validDate(value: unknown): string | null {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  return value;
}

function timestamp(value: unknown): number {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function boundedText(value: unknown, limit = 280): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, limit) : null;
}

function priorityScore(priority: OperationsExceptionPriority): number {
  return priority === "critical" ? 4 : priority === "high" ? 3 : priority === "medium" ? 2 : 1;
}

function keepNewest<T>(rows: readonly T[], keyOf: (row: T) => string, timeOf: (row: T) => number): T[] {
  const newest = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const prior = newest.get(key);
    if (!prior || timeOf(row) >= timeOf(prior)) newest.set(key, row);
  }
  return [...newest.values()];
}

function taskStatusLabel(status: string): string {
  return status === "pending" ? "بانتظار التنفيذ" : "قيد التنفيذ";
}

function importStatusLabel(status: string): string {
  if (status === "failed") return "فشلت الدفعة";
  if (status === "rejected") return "رُفضت الدفعة";
  if (status === "manual_mapping_required") return "بانتظار ربط الأعمدة";
  return "تحت مراجعة أخطاء الصفوف";
}

/** Read-model projection only. Missing ownership, due dates and source counters stay unavailable. */
export function buildOperationsExceptions(
  tasks: readonly OperationalTask[],
  importJobs: readonly ImportJob[],
  reconciliationRuns: readonly unknown[],
  nowMs = Date.now(),
): OperationsException[] {
  // Resolve each logical task event to its newest state before filtering. A newer
  // completed/cancelled task must clear the older open exception for that event.
  const openTasks = keepNewest(
    tasks,
    (task) => boundedText(task.source_event_key, 240) ?? task.id,
    (task) => timestamp(task.updated_at) || timestamp(task.created_at),
  ).filter((task) => task.status === "pending" || task.status === "in_progress");

  const taskExceptions: OperationsException[] = openTasks.map((task) => {
    const dueAt = validDate(task.due_at);
    const sourceKind = boundedText(task.source_entity_type, 80);
    const sourceId = boundedText(task.source_entity_id, 120) ?? task.id;
    const role = task.task_role === "accountant" ? "المحاسبة والتحصيل"
      : task.task_role === "warehouse" ? "المخزون"
        : task.task_role === "purchasing" ? "المشتريات"
          : task.task_role === "sales" ? "المبيعات"
            : task.task_role === "management" ? "الإدارة" : "العمليات والبيانات";
    return {
      id: "task:" + task.id,
      kind: "task",
      category: "متابعة تشغيلية — " + role,
      title: boundedText(task.title, 180) ?? "مهمة تشغيلية",
      reason: boundedText(task.description) ?? "تحتاج المهمة إلى متابعة حتى تسجيل الإجراء والنتيجة.",
      evidence: "مرجع المهمة: " + task.id + (sourceKind ? " • نوع المصدر: " + sourceKind : ""),
      sourceId: task.id,
      sourceReference: sourceKind ? sourceKind + ":" + sourceId : "ai_tasks:" + task.id,
      sourceLabel: sourceKind ? "السجل المرتبط: " + sourceKind : "سجل المهام التشغيلية",
      ownerLabel: task.assigned_to ? "مسندة إلى موظف — الاسم غير متاح في هذا المصدر" : "غير مسندة",
      dueAt,
      createdAt: validDate(task.created_at),
      statusLabel: taskStatusLabel(task.status),
      priority: task.priority,
      isOverdue: Boolean(dueAt && Date.parse(dueAt) < nowMs),
      actionLabel: "فتح المهمة",
    };
  });

  // Deduplicate the full history first. A newer successful import of the same
  // source/hash/period must supersede its older failed attempt.
  const latestImportJobs = keepNewest(
    importJobs,
    (job) => {
      const fileHash = boundedText(job.file_hash, 128);
      return fileHash
        ? [job.source_system ?? "unknown", job.period_key ?? "unscoped", fileHash].join(":")
        : "import:" + job.id;
    },
    (job) => timestamp(job.updated_at) || timestamp(job.created_at),
  );
  const relevantJobs = latestImportJobs.filter((job) => {
    const status = job.status.toLocaleLowerCase("en");
    const failedRows = safeCount(job.failed_rows);
    const rejectedRows = safeCount(job.rejected_rows);
    return ["failed", "rejected", "manual_mapping_required"].includes(status)
      || (failedRows !== null && failedRows > 0)
      || (rejectedRows !== null && rejectedRows > 0)
      || failedRows === null
      || rejectedRows === null;
  });

  const importExceptions: OperationsException[] = relevantJobs.map((job) => {
    const status = job.status.toLocaleLowerCase("en");
    const failedRows = safeCount(job.failed_rows);
    const rejectedRows = safeCount(job.rejected_rows);
    const evidenceParts: string[] = ["دفعة الاستيراد: " + job.id];
    if (failedRows !== null) evidenceParts.push("صفوف فاشلة: " + failedRows.toLocaleString("ar-YE"));
    if (rejectedRows !== null) evidenceParts.push("صفوف مرفوضة: " + rejectedRows.toLocaleString("ar-YE"));
    const errorCountsComplete = failedRows !== null && rejectedRows !== null;
    if (!errorCountsComplete) evidenceParts.push("عدادات أخطاء الصفوف: غير متاحة بالكامل");
    if (Number.isSafeInteger(job.processed_rows) && job.processed_rows >= 0) {
      evidenceParts.push("صفوف معالجة: " + job.processed_rows.toLocaleString("ar-YE"));
    }
    if (Number.isSafeInteger(job.total_rows) && job.total_rows >= 0) {
      evidenceParts.push("إجمالي الصفوف: " + job.total_rows.toLocaleString("ar-YE"));
    }
    const summary = job.error_summary;
    const errorCode = summary && typeof summary === "object" && !Array.isArray(summary)
      ? boundedText((summary as Record<string, unknown>).code, 80)
      : null;
    if (errorCode && /^[A-Z0-9_:-]+$/.test(errorCode)) evidenceParts.push("رمز السبب: " + errorCode);

    const isTerminalFailure = status === "failed" || status === "rejected";
    const fileName = boundedText(job.file_name, 160) ?? "ملف دون اسم";
    const hasRowErrors = (failedRows !== null && failedRows > 0) || (rejectedRows !== null && rejectedRows > 0);
    const errorCountsComplete = failedRows !== null && rejectedRows !== null;
    const reason = status === "manual_mapping_required"
      ? "تعذر اعتماد تخطيط الأعمدة؛ يلزم ربط الحقول قبل إعادة المعالجة."
      : hasRowErrors
        ? "تحتوي الدفعة على صفوف فاشلة أو مرفوضة تحتاج مراجعة أسبابها."
        : !errorCountsComplete
          ? "عدادات أخطاء الصفوف غير مكتملة؛ لا يمكن إثبات خلو الدفعة من الصفوف الفاشلة أو المرفوضة."
          : "انتهت الدفعة بحالة " + importStatusLabel(status) + ".";

    return {
      id: "import:" + job.id,
      kind: "import",
      category: "الاستيراد والمزامنة",
      title: "مراجعة استيراد: " + fileName,
      reason,
      evidence: evidenceParts.join(" • "),
      sourceId: job.id,
      sourceReference: "import_jobs:" + job.id,
      sourceLabel: fileName,
      ownerLabel: "غير محدد في سجل الدفعة",
      dueAt: null,
      createdAt: validDate(job.created_at),
      statusLabel: !errorCountsComplete && !isTerminalFailure && status !== "manual_mapping_required"
        ? "عدادات الصفوف غير مكتملة"
        : importStatusLabel(status),
      priority: isTerminalFailure ? "high" : "medium",
      isOverdue: false,
      actionLabel: "فتح دفعة الاستيراد",
    };
  });

  const runs = reconciliationRuns.filter((value): value is ReconciliationRun =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value),
  );
  // Resolve each snapshot to its latest run before evaluating its outcome.
  // A later clean run clears the prior variance; missing counters remain visible.
  const latestRuns = keepNewest(
    runs,
    (run) => typeof run.snapshot_id === "string" && run.snapshot_id
      ? "snapshot:" + run.snapshot_id
      : "run:" + String(run.id ?? ""),
    (run) => timestamp(run.created_at),
  );
  const relevantRuns = latestRuns.filter((run) => {
    const status = typeof run.status === "string" ? run.status.toLocaleLowerCase("en") : "";
    const changed = safeCount(run.changed_count);
    const added = safeCount(run.new_count);
    const invalid = safeCount(run.invalid_count);
    return ["failed", "error", "rejected"].includes(status)
      || (changed !== null && changed > 0)
      || (added !== null && added > 0)
      || (invalid !== null && invalid > 0)
      || changed === null
      || added === null
      || invalid === null;
  });

  const reconciliationExceptions: OperationsException[] = relevantRuns.flatMap((run) => {
    if (typeof run.id !== "string" || !run.id) return [];
    const status = typeof run.status === "string" ? run.status.toLocaleLowerCase("en") : "unknown";
    const changed = safeCount(run.changed_count);
    const added = safeCount(run.new_count);
    const invalid = safeCount(run.invalid_count);
    const evidenceParts = ["تشغيل المطابقة: " + run.id];
    if (changed !== null) evidenceParts.push("مختلف: " + changed.toLocaleString("ar-YE"));
    if (added !== null) evidenceParts.push("جديد: " + added.toLocaleString("ar-YE"));
    if (invalid !== null) evidenceParts.push("غير صالح: " + invalid.toLocaleString("ar-YE"));
    const failed = ["failed", "error", "rejected"].includes(status);
    const countersComplete = changed !== null && added !== null && invalid !== null;
    if (!countersComplete) evidenceParts.push("عدادات المطابقة: غير مكتملة");
    const snapshotId = typeof run.snapshot_id === "string" ? run.snapshot_id : null;
    return [{
      id: "reconciliation:" + run.id,
      kind: "reconciliation" as const,
      category: "مطابقة المخزون",
      title: failed ? "فشل تشغيل مطابقة المخزون" : "فروقات في مطابقة المخزون",
      reason: failed
        ? "سُجل تشغيل المطابقة بحالة فشل؛ افتح سجل التشغيل لمعرفة التفاصيل."
        : !countersComplete
          ? "عدادات نتيجة المطابقة غير مكتملة؛ لا يمكن إثبات خلو التشغيل من الفروقات."
          : "رصدت المطابقة صفوفًا مختلفة أو جديدة أو غير صالحة؛ يلزم فحص المصدر والسجل الحي قبل أي تسوية.",
      evidence: evidenceParts.join(" • "),
      sourceId: run.id,
      sourceReference: snapshotId ? "onyx_snapshots:" + snapshotId : "inventory_reconciliation_runs:" + run.id,
      sourceLabel: snapshotId ? "لقطة المصدر: " + snapshotId : "تشغيل المطابقة",
      ownerLabel: "غير محدد في سجل المطابقة",
      dueAt: null,
      createdAt: validDate(run.created_at),
      statusLabel: failed ? "فشل التشغيل" : !countersComplete ? "نتيجة غير مكتملة" : "يحتاج مراجعة",
      priority: failed || (invalid !== null && invalid > 0) ? "high" : "medium",
      isOverdue: false,
      actionLabel: "فتح نتيجة المطابقة",
    }];
  });

  return [...taskExceptions, ...importExceptions, ...reconciliationExceptions].sort((a, b) =>
    priorityScore(b.priority) - priorityScore(a.priority)
    || Number(b.isOverdue) - Number(a.isOverdue)
    || timestamp(b.createdAt) - timestamp(a.createdAt)
    || a.id.localeCompare(b.id),
  );
}
