import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const cancelSql = read("supabase/migrations/20261106250000_customer_order_preconfirmation_cancellation.sql");
const amendSql = read("supabase/migrations/20261106260000_customer_pending_order_amendments.sql");
const historySql = read("supabase/migrations/20261106270000_customer_order_amendment_version_snapshots.sql");
const customerUi = read("src/components/CustomerOrders.tsx");

describe("P1 customer order lifecycle acceptance contract", () => {
  it("allows cancellation only by the order owner before staff review and requires reason plus idempotency", () => {
    const start = cancelSql.indexOf("CREATE OR REPLACE FUNCTION public.cancel_customer_order(");
    const end = cancelSql.indexOf("$function$;", start);
    const body = cancelSql.slice(start, end);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path=''");
    expect(body).toContain("p.auth_user_id=auth.uid() AND p.is_active");
    expect(body).toContain("c.id=v_customer_id AND c.organization_id=v_org AND c.status='approved'");
    expect(body).toContain("FOR SHARE");
    expect(body).toContain("o.customer_id=v_customer_id");
    expect(body).toContain("FOR UPDATE");
    expect(body).toContain("char_length(v_reason)<3 OR pg_catalog.char_length(v_reason)>500");
    expect(body).toContain("v_key !~ '^[A-Za-z0-9_-]{16,128}$'");
    expect(body).toContain("v_order.created_by IS DISTINCT FROM v_actor");
    expect(body).toContain("v_order.status NOT IN ('draft','pending')");
    expect(body).toContain("quantity_review_required");
    expect(body).toContain("proposed_quantity IS NOT NULL OR oi.proposed_unit_price IS NOT NULL");
    expect(body).toContain("movement_type IN ('reserve','sale')");
    expect(body).toContain("INSERT INTO public.customer_order_cancellations");
    expect(body).toContain("INSERT INTO public.audit_logs");
    expect(body).toContain("INSERT INTO public.notifications");
    expect(body).not.toContain("INSERT INTO public.inventory_movements");
    expect(body).not.toContain("INSERT INTO public.journal_entries");
    expect(body).not.toContain("INSERT INTO public.invoices");
    expect(cancelSql).toContain("GRANT EXECUTE ON FUNCTION public.cancel_customer_order(uuid,text,text) TO authenticated");
  });

  it("allows pre-review quantity amendments only, preserves server prices, and refuses edits after staging", () => {
    const start = amendSql.indexOf("CREATE OR REPLACE FUNCTION public.submit_customer_order_amendment(");
    const end = amendSql.indexOf("$function$;", start);
    const body = amendSql.slice(start, end);
    expect(body).toContain("v_order.status NOT IN ('pending','returned','needs_customer_amendment','returned_for_adjustment')");
    expect(body).toContain("v_order.status='pending' AND coalesce(v_order.quantity_review_required,false)");
    expect(body).toContain("movement_type IN ('reserve','sale')");
    expect(body).toContain("v_existing_count<>v_line_count");
    expect(body).toContain("key_row.key NOT IN ('item_id','quantity')");
    expect(body).toContain("v_current_price := coalesce(v_item.approved_unit_price,v_item.unit_price_snapshot)");
    expect(body).toContain("proposed_unit_price=round(v_current_price,2)");
    expect(body).toContain("quantity_review_required=true");
    expect(body).toContain("INSERT INTO public.customer_order_amendments");
    expect(body).toContain("INSERT INTO public.audit_logs");
    expect(body).not.toContain("INSERT INTO public.inventory_movements");
    expect(body).not.toContain("INSERT INTO public.journal_entries");
    expect(body).not.toContain("INSERT INTO public.invoices");
    expect(amendSql).toContain("GRANT EXECUTE ON FUNCTION public.submit_customer_order_amendment(uuid,jsonb,text,text) TO authenticated");
  });

  it("retains versioned before/after quantities and staff actor/date/reason history", () => {
    expect(historySql).toContain("CREATE TABLE public.customer_order_amendment_line_snapshots");
    expect(historySql).toContain("BEFORE UPDATE OR DELETE ON public.customer_order_amendment_line_snapshots");
    expect(historySql).toContain("'previous_quantity'");
    expect(historySql).toContain("'proposed_quantity'");
    expect(historySql).toContain("CREATE OR REPLACE FUNCTION public.list_customer_order_amendment_history");
    expect(historySql).toContain("'submitted_by'");
    expect(historySql).toContain("'reviewed_by'");
    expect(customerUi).toContain("cancel_customer_order");
    expect(customerUi).toContain("submit_customer_order_amendment");
    expect(customerUi).toContain("CustomerOrderAmendmentHistory");
    expect(customerUi).toContain("سبب إعادة الطلب للتعديل");
  });
});
