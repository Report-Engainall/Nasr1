import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261024162000_stock_count_snapshot_balance_set_guard.sql",
  ),
  "utf8",
);

const start = migration.indexOf(
  "CREATE OR REPLACE FUNCTION public.complete_stock_count",
);
const end = migration.indexOf(
  "REVOKE ALL ON FUNCTION public.complete_stock_count",
  start,
);
const completion = start >= 0 && end > start ? migration.slice(start, end) : "";

describe("stock-count balance-set concurrency guard", () => {
  it("takes the inventory-balance lock before checking or locking the snapshot rows", () => {
    expect(completion).not.toBe("");
    const warehouseLock = completion.indexOf(
      "purchase-receiving-warehouse:",
    );
    const tableLock = completion.indexOf(
      "LOCK TABLE public.inventory_balances IN EXCLUSIVE MODE",
    );
    const balanceSetCheck = completion.indexOf("IF EXISTS (");
    const rowLock = completion.indexOf("FOR SHARE OF ib");

    expect(warehouseLock).toBeGreaterThan(-1);
    expect(tableLock).toBeGreaterThan(warehouseLock);
    expect(balanceSetCheck).toBeGreaterThan(tableLock);
    expect(rowLock).toBeGreaterThan(tableLock);
  });

  it("fails closed when a captured product disappears or a new balance appears", () => {
    expect(completion).toMatch(
      /inventory balance set changed after the count snapshot; cancel this session and start a new count/i,
    );
    expect(completion).toMatch(/NOT EXISTS\s*\([\s\S]*?public\.stock_count_lines/i);
    expect(completion).toMatch(/NOT EXISTS\s*\([\s\S]*?public\.inventory_balances/i);
  });

  it("preserves authenticated-only execution and privileged function boundaries", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.complete_stock_count\(p_session_id uuid\)[\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/i,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.complete_stock_count\(uuid\) FROM PUBLIC, anon/i,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.complete_stock_count\(uuid\) TO authenticated/i,
    );
  });
});
