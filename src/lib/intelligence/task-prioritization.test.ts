import { describe, expect, it } from "vitest";
import type { OperationalTask, OperationalTaskAssignee } from "@/lib/types";
import { prioritizeOperationalTasks, suggestOperationalTaskAssignee } from "./task-prioritization";

const NOW = Date.parse("2026-11-26T12:00:00.000Z");

function task(id: string, overrides: Partial<OperationalTask> = {}): OperationalTask {
  return {
    id,
    organization_id: "org-1",
    title: "مهمة تشغيلية",
    description: null,
    task_type: null,
    priority: "medium",
    status: "pending",
    assigned_to: null,
    created_at: "2026-11-20T08:00:00.000Z",
    completed_at: null,
    task_role: "operations",
    source_event_key: null,
    source_entity_type: null,
    source_entity_id: null,
    due_at: null,
    task_payload: {},
    updated_at: "2026-11-20T08:00:00.000Z",
    ...overrides,
  };
}

const assignee: OperationalTaskAssignee = {
  profile_id: "profile-1",
  full_name: "موظف العمليات",
  email: null,
  roles: ["operations"],
};

describe("operational task prioritization timestamp integrity", () => {
  it("marks a valid offset-qualified overdue task as overdue", () => {
    const result = prioritizeOperationalTasks([
      task("late", { due_at: "2026-11-26T11:59:59.000Z" }),
    ], NOW);
    expect(result[0].whyNow).toContain("متأخرة");
  });

  it("does not interpret a timezone-less local timestamp as an overdue deadline", () => {
    const result = prioritizeOperationalTasks([
      task("local", { due_at: "2026-11-26T11:00:00" }),
    ], NOW);
    expect(result[0].whyNow).not.toContain("متأخرة");
    expect(result[0].whyNow).toContain("لا يوجد موعد استحقاق صالح");
  });

  it("rejects impossible calendar dates instead of normalizing them into overdue tasks", () => {
    const result = prioritizeOperationalTasks([
      task("impossible", { due_at: "2026-02-31T11:00:00.000Z" }),
    ], NOW);
    expect(result[0].whyNow).not.toContain("متأخرة");
    expect(result[0].whyNow).toContain("لا يوجد موعد استحقاق صالح");
  });

  it("treats a deadline exactly at the snapshot instant as due soon, not overdue", () => {
    const result = prioritizeOperationalTasks([
      task("now", { due_at: "2026-11-26T12:00:00.000Z" }),
    ], NOW);
    expect(result[0].whyNow).toContain("خلال 24 ساعة");
    expect(result[0].whyNow).not.toContain("متأخرة");
  });

  it("returns no ranking when the caller supplies an invalid snapshot time", () => {
    expect(prioritizeOperationalTasks([task("one")], Number.NaN)).toEqual([]);
    expect(prioritizeOperationalTasks([task("one")], Number.MAX_SAFE_INTEGER)).toEqual([]);
  });

  it("uses task id as the stable tie-breaker when a creation timestamp is invalid", () => {
    const result = prioritizeOperationalTasks([
      task("z-invalid", { created_at: "2026-02-31T08:00:00.000Z" }),
      task("a-invalid", { created_at: "2026-02-30T08:00:00.000Z" }),
    ], NOW);
    expect(result.map(item => item.task.id)).toEqual(["a-invalid", "z-invalid"]);
  });

  it("does not count malformed due dates as overdue workload", () => {
    const result = suggestOperationalTaskAssignee([
      task("malformed", {
        assigned_to: assignee.profile_id,
        due_at: "2026-02-31T11:00:00.000Z",
      }),
    ], [assignee], NOW);
    expect(result).toMatchObject({ openTaskCount: 1, overdueTaskCount: 0, weightedLoad: 2 });
  });

  it("counts a valid overdue task in the assignee workload", () => {
    const result = suggestOperationalTaskAssignee([
      task("late", {
        assigned_to: assignee.profile_id,
        due_at: "2026-11-26T11:59:59.000Z",
      }),
    ], [assignee], NOW);
    expect(result).toMatchObject({ openTaskCount: 1, overdueTaskCount: 1, weightedLoad: 4 });
  });

  it("does not fall back to wall-clock time when assignee evaluation time is invalid", () => {
    expect(suggestOperationalTaskAssignee([task("one")], [assignee], Number.NaN)).toBeNull();
  });
});
