import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261102193000_purchase_receipt_print_history.sql",
), "utf8");

describe("purchase receipt history and print authorization migration", () => {
  it("uses authenticated, active same-tenant manager/admin RPCs only", () => {
    for (const name of ["fetch_purchase_order_receipt_history", "get_purchase_receipt_print_data"]) {
      const start = migration.indexOf("CREATE OR REPLACE FUNCTION public." + name);
      expect(start).toBeGreaterThanOrEqual(0);
      const source = migration.slice(start, migration.indexOf("$function$;", start) + 11);
      expect(source).toMatch(/SECURITY DEFINER/i);
      expect(source).toMatch(/SET search_path = ''/i);
      expect(source).toMatch(/auth\.uid\(\)/i);
      expect(source).toMatch(/p\.auth_user_id = auth\.uid\(\)/i);
      expect(source).toMatch(/p\.is_active = true/i);
      expect(source).toMatch(/public\.purchase_orders_can_manage\(\)/i);
      expect(source).toMatch(/organization_id = v_org/i);
    }
  });

  it("rebuilds the print document from saved receipt item snapshots and exact source-cost reconciliation", () => {
    expect(migration).toContain("public.purchase_receipt_items");
    expect(migration).toContain("public.purchase_order_items");
    expect(migration).toContain("v_line_total IS NOT DISTINCT FROM v_receipt.received_cost");
    expect(migration).toContain("CASE WHEN v_costs_complete THEN ri.unit_cost::text ELSE NULL END");
    expect(migration).toContain("CASE WHEN v_costs_complete THEN ri.line_total::text ELSE NULL END");
    expect(migration).toContain("'received_cost', CASE WHEN v_costs_complete THEN v_receipt.received_cost::text ELSE NULL END");
    expect(migration).not.toMatch(/GRANT SELECT[^;]*purchase_receipt_items/i);
  });

  it("revokes public and anonymous execution while granting only authenticated RPC access", () => {
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.fetch_purchase_order_receipt_history\(uuid, integer, integer\)\s+FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.fetch_purchase_order_receipt_history\(uuid, integer, integer\)\s+TO authenticated/i);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.get_purchase_receipt_print_data\(uuid\) FROM PUBLIC, anon/i);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.get_purchase_receipt_print_data\(uuid\) TO authenticated/i);
  });
});
