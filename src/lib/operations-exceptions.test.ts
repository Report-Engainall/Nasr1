import { describe, expect, it } from "vitest";
import type { ImportJob, OperationalTask } from "./types";
import { buildOperationsExceptions } from "./operations-exceptions";

function task(overrides: Partial<OperationalTask> = {}): OperationalTask {
  return {
    id: "task-1",
    organization_id: "tenant-1",
    title: "متابعة طلب متأخر",
    description: "راجع سبب التأخر مع قسم التوصيل.",
    task_type: "follow_up",
    priority: "high",
    status: "pending",
    assigned_to: null,
    created_at: "2026-11-10T08:00:00.000Z",
    completed_at: null,
    task_role: "operations",
    source_event_key: "order-delivery:order-1",
    source_entity_type: "orders",
    source_entity_id: "order-1",
    due_at: "2026-11-10T09:00:00.000Z",
    created_by: null,
    completed_by: null,
    resolution_note: null,
    task_payload: {},
    updated_at: "2026-11-10T08:00:00.000Z",
    ...overrides,
  };
}

function importJob(overrides: Partial<ImportJob> = {}): ImportJob {
  return {
    id: "import-1",
    profile_id: null,
    file_name: "onyx-november.xlsx",
    file_hash: "sha256-abc",
    period_key: "2026-11",
    status: "failed",
    total_rows: 100,
    processed_rows: 70,
    failed_rows: 12,
    rejected_rows: 8,
    data_quality_score: null,
    created_at: "2026-11-10T07:00:00.000Z",
    ...overrides,
  };
}

describe("buildOperationsExceptions", () => {
  it("projects only open task records and preserves their source owner and due-date boundary", () => {
    const items = buildOperationsExceptions([
      task(),
      task({ id: "done", status: "completed" }),
      task({ id: "cancelled", status: "cancelled" }),
    ], [], [], Date.parse("2026-11-10T10:00:00.000Z"));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "task",
      sourceReference: "orders:order-1",
      ownerLabel: "غير مسندة",
      isOverdue: true,
      priority: "high",
    });
  });

  it("deduplicates repeated task events and keeps the newest source record", () => {
    const items = buildOperationsExceptions([
      task({ id: "old", title: "نسخة قديمة", updated_at: "2026-11-10T08:30:00.000Z" }),
      task({ id: "new", title: "النسخة الأحدث", updated_at: "2026-11-10T09:00:00.000Z" }),
    ], [], [], Date.parse("2026-11-10T10:00:00.000Z"));

    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("النسخة الأحدث");
    expect(items[0].id).toBe("task:new");
  });

  it("surfaces failed import batches with source-backed counters and deduplicates the same file period", () => {
    const items = buildOperationsExceptions([], [
      importJob({ id: "old", created_at: "2026-11-10T06:00:00.000Z" }),
      importJob({ id: "new", created_at: "2026-11-10T07:00:00.000Z", failed_rows: 5 }),
      importJob({ id: "healthy", file_hash: "sha256-healthy", status: "completed", failed_rows: 0, rejected_rows: 0 }),
    ], [], Date.parse("2026-11-10T10:00:00.000Z"));

    expect(items).toHaveLength(1);
    expect(items[0].sourceId).toBe("new");
    expect(items[0].evidence).toContain("صفوف فاشلة: ٥");
  });


  it("clears an open task exception when the newest task event is completed", () => {
    const items = buildOperationsExceptions([
      task({ id: "old", updated_at: "2026-11-10T08:30:00.000Z", status: "pending" }),
      task({ id: "new", updated_at: "2026-11-10T09:00:00.000Z", status: "completed" }),
    ], [], [], Date.parse("2026-11-10T10:00:00.000Z"));

    expect(items).toHaveLength(0);
  });

  it("clears a failed import exception after a newer clean attempt for the same source file and period", () => {
    const items = buildOperationsExceptions([], [
      importJob({ id: "failed", created_at: "2026-11-10T06:00:00.000Z", status: "failed" }),
      importJob({
        id: "recovered",
        created_at: "2026-11-10T07:00:00.000Z",
        status: "completed",
        failed_rows: 0,
        rejected_rows: 0,
      }),
    ], []);

    expect(items).toHaveLength(0);
  });

  it("clears prior reconciliation differences only after the newest run proves zero differences", () => {
    const items = buildOperationsExceptions([], [], [
      { id: "old", snapshot_id: "snapshot-1", status: "completed", changed_count: 2, new_count: 1, invalid_count: 0, created_at: "2026-11-10T06:00:00.000Z" },
      { id: "new", snapshot_id: "snapshot-1", status: "completed", changed_count: 0, new_count: 0, invalid_count: 0, created_at: "2026-11-10T07:00:00.000Z" },
    ]);

    expect(items).toHaveLength(0);
  });

  it("keeps a latest reconciliation run with missing counters visible instead of treating unknown as zero", () => {
    const items = buildOperationsExceptions([], [], [
      { id: "run-unknown", snapshot_id: "snapshot-unknown", status: "completed", created_at: "2026-11-10T07:00:00.000Z" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].statusLabel).toBe("نتيجة غير مكتملة");
    expect(items[0].evidence).toContain("عدادات المطابقة: غير مكتملة");
  });

  it("keeps a completed import with missing error counters visible rather than assuming a clean import", () => {
    const job = importJob({ id: "unknown", status: "completed" });
    delete job.failed_rows;
    delete job.rejected_rows;

    const items = buildOperationsExceptions([], [job], []);

    expect(items).toHaveLength(1);
    expect(items[0].statusLabel).toBe("عدادات الصفوف غير مكتملة");
    expect(items[0].evidence).toContain("عدادات أخطاء الصفوف: غير متاحة بالكامل");
  });

  it("surfaces reconciliation differences only when the stored run contains source counters", () => {
    const items = buildOperationsExceptions([], [], [
      { id: "run-1", snapshot_id: "snapshot-1", status: "completed", changed_count: 2, new_count: 1, invalid_count: 0 },
      { id: "run-2", snapshot_id: "snapshot-2", status: "completed" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "reconciliation",
      sourceId: "run-1",
      priority: "medium",
    });
    expect(items[0].evidence).toContain("مختلف: ٢");
    expect(items[0].evidence).toContain("جديد: ١");
  });
});
