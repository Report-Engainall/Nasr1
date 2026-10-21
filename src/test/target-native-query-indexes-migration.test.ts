import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261021155000_target_native_import_order_query_indexes.sql"),
  "utf8",
);
const runtimeTest = readFileSync(
  join(process.cwd(), "scripts/test-import-inventory-snapshot-contract.mjs"),
  "utf8",
);

describe("target-native import and order query indexes", () => {
  it("maps donor import_rows/SKU to Nasr1 import_job_rows.data.item_code", () => {
    expect(migration).toMatch(/ON public\.import_job_rows \(import_job_id, \(\(data ->> 'item_code'\)\)\)/i);
    expect(migration).not.toMatch(/public\.import_rows\b|\bsku\b/i);
    expect(runtimeTest).toContain("import_job_rows_job_item_code_idx");
  });

  it("uses tenant-scoped, order-compatible keys for customer history and staff queues", () => {
    expect(migration).toMatch(/ON public\.orders \(organization_id, customer_id, created_at DESC, id DESC\)/i);
    expect(migration).toMatch(/ON public\.orders \(organization_id, status, created_at DESC, id DESC\)/i);
    expect(migration).toMatch(/WHERE customer_id IS NOT NULL/i);
    expect(runtimeTest).toContain("orders_customer_history_idx");
    expect(runtimeTest).toContain("orders_staff_queue_idx");
  });
});
