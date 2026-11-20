-- Lock the RPC surface to the intended public storefront reads and authenticated administration.
-- Trigger functions remain executable by PostgreSQL triggers but are not callable as PostgREST RPCs.
BEGIN;

REVOKE ALL ON FUNCTION public.capture_customer_order_amendment_lines()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_import_job()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_inventory()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_invoice()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_order()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_purchase_order()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_purchase_receipt()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_purchase_receipt_accounting()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_quote()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_return_credit_memo_journal_status()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operational_tasks_from_return_credit_memo_posting()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_prices_after_product_change()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_pricing_after_rule_change()
  FROM PUBLIC, anon, authenticated;

-- Tenant and warehouse identifiers are internal context, not public browser data.
-- SECURITY DEFINER storefront RPCs call these helpers as their owner.
REVOKE ALL ON FUNCTION public.get_public_storefront_context()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_storefront_organization_id()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.public_storefront_warehouse_id()
  FROM PUBLIC, anon, authenticated;

-- Administrative promotion reads and writes are authenticated-only; role checks inside each RPC remain authoritative.
REVOKE ALL ON FUNCTION public.get_admin_promotions()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_promotions()
  TO authenticated;

REVOKE ALL ON FUNCTION public.save_promotion(uuid,text,text,text,numeric,uuid[],uuid[],date,date,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_promotion(uuid,text,text,text,numeric,uuid[],uuid[],date,date,boolean)
  TO authenticated;

REVOKE ALL ON FUNCTION public.set_promotion_active(uuid,boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_promotion_active(uuid,boolean)
  TO authenticated;

-- Order-code generation is not an anonymous API. The sequence is fully schema-qualified.
CREATE OR REPLACE FUNCTION public.generate_order_code()
RETURNS text
LANGUAGE sql
SET search_path = ''
AS $function$
  SELECT 'ORD-' || pg_catalog.lpad(pg_catalog.nextval('public.order_code_seq'::pg_catalog.regclass)::text, 6, '0');
$function$;

REVOKE ALL ON FUNCTION public.generate_order_code()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_order_code()
  TO authenticated;

-- Explicit allow-list for intentional public storefront read contracts.
GRANT EXECUTE ON FUNCTION public.get_product_unit_conversions(uuid)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_storefront_settings()
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_announcements()
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_catalog_page(text,uuid,integer,integer,boolean)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_product_prices(uuid[],numeric)
  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_promotions()
  TO anon, authenticated;

COMMIT;
