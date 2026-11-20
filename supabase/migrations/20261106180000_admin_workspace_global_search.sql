-- Tenant-scoped global search. Return references and labels only, never financial values.
-- The caller must still pass the destination's existing role, RPC, and RLS checks.
BEGIN;

CREATE OR REPLACE FUNCTION public.search_admin_workspace(
  p_query text,
  p_limit integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_roles text[];
  v_query text := pg_catalog.left(pg_catalog.btrim(coalesce(p_query, '')), 120);
  v_limit integer := LEAST(50, GREATEST(1, coalesce(p_limit, 30)));
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.profiles p
        WHERE p.id = v_actor
          AND p.auth_user_id = auth.uid()
          AND p.organization_id = v_org
          AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization profile required for workspace search';
  END IF;

  SELECT coalesce(pg_catalog.array_agg(DISTINCT r.role::text), ARRAY[]::text[])
    INTO v_roles
    FROM public.user_roles r
   WHERE r.profile_id = v_actor;

  IF pg_catalog.cardinality(v_roles) = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active organization role required for workspace search';
  END IF;
  IF pg_catalog.char_length(v_query) < 2 THEN
    RETURN pg_catalog.jsonb_build_object('query', v_query, 'items', '[]'::jsonb, 'returned_count', 0);
  END IF;
  IF p_limit IS NOT NULL AND (p_limit < 1 OR p_limit > 50) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'workspace search limit must be between 1 and 50';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'kind', page.kind, 'id', page.id::text, 'title', page.title,
        'subtitle', page.subtitle, 'status', page.status,
        'route', page.route, 'created_at', page.created_at
      ) ORDER BY page.priority, page.created_at DESC NULLS LAST, page.id
    ),
    '[]'::jsonb
  )
    INTO v_items
    FROM (
      SELECT * FROM (
        SELECT
          1 AS priority, 'product'::text AS kind, p.id, p.name::text AS title,
          pg_catalog.concat_ws(' · ', nullif(p.item_code, ''), nullif(p.status::text, '')) AS subtitle,
          p.status::text AS status, '/admin/products'::text AS route, p.created_at
        FROM public.products p
        WHERE v_roles && ARRAY['admin','manager','staff']::text[]
          AND p.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(p.name), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(p.item_code, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(p.sku, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(p.barcode, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          2, 'supplier', s.id, s.name::text,
          pg_catalog.concat_ws(' · ', nullif(s.supplier_code, ''), nullif(s.status::text, '')) AS subtitle,
          s.status::text, '/admin/suppliers', s.created_at
        FROM public.suppliers s
        WHERE v_roles && ARRAY['admin','manager','staff']::text[]
          AND s.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(s.name), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(s.supplier_code, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(s.contact_name, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          3, 'customer', c.id, c.business_name::text,
          pg_catalog.concat_ws(' · ', nullif(c.customer_code, ''), nullif(c.status::text, '')) AS subtitle,
          c.status::text, '/admin/customers', c.created_at
        FROM public.customers c
        WHERE v_roles && ARRAY['admin','manager','staff','customer_manager']::text[]
          AND c.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(c.business_name), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(c.contact_name, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(c.customer_code, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(c.phone, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(c.email, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          4, 'order', o.id, o.order_code::text,
          pg_catalog.concat_ws(' · ', nullif(o.status::text, ''), nullif(c.business_name, '')) AS subtitle,
          o.status::text, '/admin/orders', o.created_at
        FROM public.orders o
        LEFT JOIN public.customers c
          ON c.id = o.customer_id AND c.organization_id = o.organization_id
        WHERE v_roles && ARRAY['admin','manager','staff']::text[]
          AND o.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(o.order_code), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(o.status::text, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(c.business_name, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          5, 'invoice', i.id, i.invoice_number::text,
          pg_catalog.concat_ws(' · ', nullif(i.status::text, ''), nullif(c.business_name, '')) AS subtitle,
          i.status::text, '/admin/finance', i.issued_at
        FROM public.customer_invoices i
        LEFT JOIN public.customers c
          ON c.id = i.customer_id AND c.organization_id = i.organization_id
        WHERE v_roles && ARRAY['admin','manager','accountant']::text[]
          AND i.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(i.invoice_number), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(i.status::text, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(c.business_name, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          6, 'purchase_order', po.id, po.purchase_order_number::text,
          pg_catalog.concat_ws(' · ', nullif(po.status, ''), nullif(s.name, '')) AS subtitle,
          po.status, '/admin/purchase-orders', po.created_at
        FROM public.purchase_orders po
        JOIN public.suppliers s
          ON s.id = po.supplier_id AND s.organization_id = po.organization_id
        WHERE v_roles && ARRAY['admin','manager']::text[]
          AND po.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(po.purchase_order_number), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(po.status, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(s.name, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          7, 'task', t.id, t.title::text,
          pg_catalog.concat_ws(' · ', nullif(t.task_role, ''), nullif(t.priority, '')) AS subtitle,
          t.status::text, '/admin/tasks', t.created_at
        FROM public.ai_tasks t
        WHERE v_roles && ARRAY['admin','manager','staff','accountant']::text[]
          AND t.organization_id = v_org
          AND public.can_view_operational_task_role(t.task_role)
          AND (
            pg_catalog.strpos(pg_catalog.lower(t.title), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(t.task_type, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(t.source_entity_type, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(t.source_entity_id::text, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          8, 'import', j.id, coalesce(nullif(j.file_name, ''), 'دفعة استيراد')::text,
          pg_catalog.concat_ws(' · ', nullif(j.status, ''), nullif(j.job_type, ''), nullif(j.period_key, '')) AS subtitle,
          j.status::text, '/admin/data', j.created_at
        FROM public.import_jobs j
        WHERE v_roles && ARRAY['admin','manager']::text[]
          AND j.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(coalesce(j.file_name, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(j.status, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(j.job_type, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(j.period_key, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          9, 'decision', d.id, d.candidate_id::text,
          pg_catalog.concat_ws(' · ', nullif(d.state::text, ''), nullif(d.rule_id, '')) AS subtitle,
          d.state::text, '/admin/intelligence', d.updated_at
        FROM public.decision_outcomes d
        WHERE v_roles && ARRAY['admin','manager']::text[]
          AND d.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(d.candidate_id), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(d.rule_id), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(d.reason, '')), pg_catalog.lower(v_query)) > 0
          )

        UNION ALL

        SELECT
          10, 'audit', a.id, a.action::text,
          pg_catalog.concat_ws(' · ', nullif(a.entity_type, ''), a.entity_id::text) AS subtitle,
          NULL::text, '/admin/audit', a.created_at
        FROM public.audit_logs a
        WHERE v_roles && ARRAY['admin','manager']::text[]
          AND a.organization_id = v_org
          AND (
            pg_catalog.strpos(pg_catalog.lower(a.action), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(coalesce(a.entity_type, '')), pg_catalog.lower(v_query)) > 0
            OR pg_catalog.strpos(pg_catalog.lower(a.entity_id::text), pg_catalog.lower(v_query)) > 0
          )
      ) matches
      ORDER BY priority, created_at DESC NULLS LAST, id
      LIMIT v_limit
    ) page;

  RETURN pg_catalog.jsonb_build_object(
    'query', v_query, 'items', v_items,
    'returned_count', pg_catalog.jsonb_array_length(v_items)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.search_admin_workspace(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_admin_workspace(text, integer) TO authenticated;
COMMENT ON FUNCTION public.search_admin_workspace(text, integer) IS
  'Bounded tenant-scoped admin search returning references and non-financial labels only; destination authorization remains authoritative.';

COMMIT;
