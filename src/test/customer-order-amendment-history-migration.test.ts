import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const historyMigration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261106270000_customer_order_amendment_version_snapshots.sql",
), "utf8");
const returnMigration = readFileSync(join(
  process.cwd(),
  "supabase/migrations/20261106280000_customer_order_return_command.sql",
), "utf8");
const adminSource = readFileSync(join(process.cwd(), "src/components/AdminPages.tsx"), "utf8");
const customerSource = readFileSync(join(process.cwd(), "src/components/CustomerOrders.tsx"), "utf8");

describe("customer order amendment version history", () => {
  it("captures the complete before/after line set atomically for each submitted version", () => {
    expect(historyMigration).toMatch(/CREATE TABLE public\.customer_order_amendment_line_snapshots/i);
    expect(historyMigration).toMatch(/AFTER INSERT ON public\.customer_order_amendments/i);
    expect(historyMigration).toMatch(/coalesce\(oi\.approved_quantity, oi\.quantity\)/i);
    expect(historyMigration).toMatch(/oi\.proposed_quantity/i);
    expect(historyMigration).toMatch(/v_snapshot_count <> NEW\.line_count/i);
    expect(historyMigration).toMatch(/أُلغيت عملية الإرسال بالكامل/);
    expect(historyMigration).toMatch(/UNIQUE \(amendment_id, order_item_id\)/i);
  });

  it("keeps snapshots and submitted amendment identity immutable", () => {
    expect(historyMigration).toMatch(/BEFORE UPDATE OR DELETE ON public\.customer_order_amendment_line_snapshots/i);
    expect(historyMigration).toMatch(/BEFORE UPDATE OR DELETE ON public\.customer_order_amendments/i);
    expect(historyMigration).toMatch(/OLD\.status <> 'pending_review'/i);
    expect(historyMigration).toMatch(/NEW\.status NOT IN \('approved', 'rejected'\)/i);
    expect(historyMigration).toMatch(/لا يمكن حذف نسخة تعديل الطلب من السجل التاريخي/);
  });

  it("limits snapshot reads to the parent amendment tenant/owner policy and keeps writes private", () => {
    expect(historyMigration).toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(historyMigration).toMatch(/REVOKE ALL ON TABLE public\.customer_order_amendment_line_snapshots FROM PUBLIC, anon, authenticated/i);
    expect(historyMigration).toMatch(/GRANT SELECT ON TABLE public\.customer_order_amendment_line_snapshots TO authenticated/i);
    expect(historyMigration).toMatch(/EXISTS \(\s*SELECT 1\s*FROM public\.customer_order_amendments a/i);
    expect(historyMigration).toMatch(/c\.profile_id = v_actor/i);
    expect(historyMigration).toMatch(/r\.role IN \('admin', 'manager', 'staff'\)/i);
  });

  it("returns version history with submitter/reviewer names, timestamps, reasons and all quantity lines", () => {
    expect(historyMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.list_customer_order_amendment_history\(p_order_id uuid\)/i);
    expect(historyMigration).toMatch(/SECURITY DEFINER\s+SET search_path = ''/i);
    for (const field of [
      "'submitted_by', submitter.full_name",
      "'reviewed_by', reviewer.full_name",
      "'submitted_at', a.created_at",
      "'reviewed_at', a.reviewed_at",
      "'previous_quantity', s.previous_quantity",
      "'proposed_quantity', s.proposed_quantity",
      "'review_note', a.review_note",
    ]) expect(historyMigration).toContain(field);
    expect(historyMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.list_customer_order_amendment_history\(uuid\) TO authenticated/i);
  });
});

describe("staff return-for-amendment command", () => {
  it("requires an unconfirmed pending order and an explicit bounded reason", () => {
    expect(returnMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.return_order_for_customer_amendment\(/i);
    expect(returnMigration).toMatch(/v_order\.status<>'pending'/i);
    expect(returnMigration).toMatch(/char_length\(v_reason\)<3 OR pg_catalog\.char_length\(v_reason\)>1000/i);
    expect(returnMigration).toContain("status='returned_for_adjustment'");
    expect(returnMigration).toMatch(/customer_adjustment_note=v_reason/i);
  });

  it("blocks return after staging or inventory reservation and avoids automatic financial/stock posting", () => {
    expect(returnMigration).toMatch(/oi\.proposed_quantity IS NOT NULL OR oi\.proposed_unit_price IS NOT NULL/i);
    expect(returnMigration).toMatch(/im\.movement_type IN \('reserve','sale'\)/i);
    expect(returnMigration).toMatch(/a\.status='pending_review'/i);
    expect(returnMigration).toMatch(/'inventory_unchanged',true/i);
    expect(returnMigration).toMatch(/'financial_documents_unchanged',true/i);
    expect(returnMigration).not.toMatch(/INSERT INTO public\.inventory_movements/i);
    expect(returnMigration).not.toMatch(/INSERT INTO public\.invoices/i);
  });

  it("audits the return, records its reason in status history, and notifies the customer", () => {
    expect(returnMigration).toContain("order.returned_for_customer_amendment");
    expect(returnMigration).toMatch(/INSERT INTO public\.notifications/i);
    expect(returnMigration).toMatch(/'order',v_order\.id/i);
    expect(returnMigration).toMatch(/سبب إعادة الطلب للتعديل:/i);
    expect(returnMigration).toMatch(/GRANT EXECUTE ON FUNCTION public\.return_order_for_customer_amendment\(uuid,text\) TO authenticated/i);
  });

  it("wires the reasoned return command and the customer-facing return reason/history", () => {
    expect(adminSource).toContain("return_order_for_customer_amendment");
    expect(adminSource).toContain("سبب إعادة الطلب (إلزامي)");
    expect(customerSource).toContain("سبب إعادة الطلب للتعديل");
    expect(customerSource).toContain("CustomerOrderAmendmentHistory");
  });
});
