import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase",
  "migrations",
  "20261022100000_operational_stock_count_variance_tasks.sql",
), "utf8");
const completionTrigger = migration.match(
  /CREATE OR REPLACE FUNCTION public\.operational_tasks_from_stock_count_completion\(\)[\s\S]*?\$function\$;/i,
)?.[0] ?? "";
const refreshFunction = migration.match(
  /CREATE OR REPLACE FUNCTION public\.refresh_operational_tasks\(\)[\s\S]*?\$function\$;/i,
)?.[0] ?? "";

const taskCenterSource = readFileSync(join(
  process.cwd(),
  "src",
  "components",
  "TaskCenter.tsx",
), "utf8");

describe("source-linked stock-count variance tasks", () => {
  it("uses a tenant-safe trigger after the source session is completed", () => {
    expect(completionTrigger).toMatch(/SECURITY DEFINER/i);
    expect(completionTrigger).toMatch(/SET search_path\s*=\s*''/i);
    expect(migration).toMatch(/AFTER UPDATE OF status ON public\.stock_count_sessions/i);
    expect(completionTrigger).toMatch(/NEW\.organization_id/i);
    expect(completionTrigger).toMatch(/NEW\.id/i);
  });

  it("creates one warehouse task only for non-zero persisted quantity variances", () => {
    expect(completionTrigger).toMatch(/count\(\*\) FILTER \(WHERE coalesce\(line\.variance, 0\) <> 0\)/i);
    expect(completionTrigger).toMatch(/'warehouse',\s*'medium'/i);
    expect(completionTrigger).toMatch(/'stock-count-variance:'\s*\|\|\s*NEW\.id::text/i);
    expect(completionTrigger).toMatch(/'stock_count_sessions',\s*NEW\.id/i);
    expect(completionTrigger).toMatch(/'positive_adjustment_quantity'/i);
    expect(completionTrigger).toMatch(/'negative_adjustment_quantity'/i);
    expect(completionTrigger).not.toMatch(/amount|currency|money|tax/i);
  });

  it("rebuilds tasks from saved count lines without reopening a completed task", () => {
    expect(refreshFunction).toMatch(/refresh_operational_tasks_pre_stock_count_v1\(\)/i);
    expect(refreshFunction).toMatch(/session\.status = 'completed'/i);
    expect(refreshFunction).toMatch(/HAVING count\(\*\) FILTER \(WHERE coalesce\(line\.variance, 0\) <> 0\) > 0/i);
    expect(refreshFunction).toMatch(/'stock-count-variance:'\s*\|\|\s*r\.id::text/i);
    expect(refreshFunction).toMatch(/\bfalse\s*\n\s*\);/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.refresh_operational_tasks\(\) FROM PUBLIC, anon;/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.refresh_operational_tasks\(\) TO authenticated;/i);
  });

  it("renders Arabic source labels for operational task types created by the integrated workflows", () => {
    expect(taskCenterSource).toMatch(/purchase_receipts:\s*'إيصال استلام شراء'/);
    expect(taskCenterSource).toMatch(/stock_count_sessions:\s*'جلسة جرد'/);
    expect(taskCenterSource).toMatch(/customer_return_requests:\s*'طلب إرجاع'/);
    expect(taskCenterSource).toMatch(/customer_return_credit_memos:\s*'إشعار دائن لمرتجع'/);
    expect(taskCenterSource).toMatch(/entityLabels\[task\.source_entity_type\]/);
  });
});
