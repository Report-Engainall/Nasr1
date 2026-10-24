import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261024140000_operational_task_status_reject_null.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const functionStart = migration.indexOf("CREATE OR REPLACE FUNCTION public.update_operational_task_status");
const functionEnd = migration.indexOf("$f$;", functionStart);
const functionSource = migration.slice(functionStart, functionEnd);

describe("operational task explicit lifecycle status", () => {
  it("rejects NULL and unsupported statuses with invalid-argument SQLSTATE before row lookup", () => {
    const guard = functionSource.indexOf(
      "IF p_status IS NULL OR p_status NOT IN ('pending','in_progress','completed','cancelled') THEN",
    );
    const lookup = functionSource.indexOf("SELECT t.* INTO v_task");
    const update = functionSource.indexOf("UPDATE public.ai_tasks SET status=p_status");
    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(functionEnd).toBeGreaterThan(functionStart);
    expect(guard).toBeGreaterThan(-1);
    expect(lookup).toBeGreaterThan(guard);
    expect(update).toBeGreaterThan(lookup);
    expect(functionSource).toMatch(
      /IF p_status IS NULL OR p_status NOT IN[\s\S]*?ERRCODE='22023',MESSAGE='unsupported task status'/,
    );
  });

  it("preserves active-profile, organization, role, and task-ownership checks", () => {
    expect(functionSource).toContain("public.current_profile_id()");
    expect(functionSource).toContain("public.current_organization_id()");
    expect(functionSource).toContain("p.organization_id=v_org");
    expect(functionSource).toContain("public.can_view_operational_task_role(v_task.task_role)");
    expect(functionSource).toContain("only a manager may reopen a completed task");
    expect(functionSource).toContain("only a manager may cancel a task");
  });

  it("preserves audit creation after a valid lifecycle transition", () => {
    expect(functionSource).toContain("'operational_task.status_changed'");
    expect(functionSource).toContain("INSERT INTO public.audit_logs");
    expect(functionSource).toContain("RETURN jsonb_build_object('id',v_task.id,'status',p_status");
  });
});
