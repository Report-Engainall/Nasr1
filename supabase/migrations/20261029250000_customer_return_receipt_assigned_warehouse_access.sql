-- Permit a warehouse worker to execute physical receipt tasks assigned to their live profile.
-- Administration/review remains manager-only; staff queue visibility and receipt reads are task/tenant-scoped.
CREATE OR REPLACE FUNCTION public.can_view_assigned_customer_return_receipt_queue()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.current_profile_id() IS NOT NULL
     AND public.current_organization_id() IS NOT NULL
     AND (
       public.operational_tasks_can_manage()
       OR (
         public.is_staff()
         AND EXISTS (
           SELECT 1
             FROM public.ai_tasks t
            WHERE t.organization_id = public.current_organization_id()
              AND t.assigned_to = public.current_profile_id()
              AND t.task_role = 'warehouse'
              AND t.status IN ('pending','in_progress')
              AND t.source_entity_type = 'customer_return_requests'
              AND t.source_event_key LIKE 'customer-return-receipt:%'
         )
       )
     )
$function$;

CREATE OR REPLACE FUNCTION public.can_receive_customer_return_request(p_return_request_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR p_return_request_id IS NULL THEN
    RETURN false;
  END IF;
  IF public.operational_tasks_can_manage() THEN
    RETURN true;
  END IF;
  IF NOT public.is_staff() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.ai_tasks t
     WHERE t.organization_id = v_org
       AND t.assigned_to = v_actor
       AND t.task_role = 'warehouse'
       AND t.status IN ('pending','in_progress')
       AND t.source_entity_type = 'customer_return_requests'
       AND t.source_entity_id = p_return_request_id
       AND t.source_event_key = 'customer-return-receipt:' || p_return_request_id::text
  ) OR EXISTS (
    -- Allow the original physical receiver to safely retry their own idempotent request.
    SELECT 1
      FROM public.customer_return_receipts r
     WHERE r.organization_id = v_org
       AND r.return_request_id = p_return_request_id
       AND r.received_by = v_actor
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.can_access_customer_return_receipt_print_snapshot(p_receipt_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR p_receipt_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.operational_tasks_can_manage() THEN
    RETURN EXISTS (
      SELECT 1 FROM public.customer_return_receipts r
       WHERE r.id = p_receipt_id AND r.organization_id = v_org
    );
  END IF;
  IF NOT public.is_staff() THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.customer_return_receipts r
     WHERE r.id = p_receipt_id
       AND r.organization_id = v_org
       AND (
         r.received_by = v_actor
         OR EXISTS (
           SELECT 1 FROM public.ai_tasks t
            WHERE t.organization_id = v_org
              AND t.assigned_to = v_actor
              AND t.task_role = 'warehouse'
              AND t.status IN ('pending','in_progress','completed')
              AND t.source_entity_type = 'customer_return_requests'
              AND t.source_entity_id = r.return_request_id
              AND t.source_event_key = 'customer-return-receipt:' || r.return_request_id::text
         )
       )
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.can_list_customer_return_receipt_print_history()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.current_profile_id() IS NOT NULL
     AND public.current_organization_id() IS NOT NULL
     AND (public.operational_tasks_can_manage() OR public.is_staff())
$function$;

REVOKE ALL ON FUNCTION public.can_view_assigned_customer_return_receipt_queue() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_receive_customer_return_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_access_customer_return_receipt_print_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_list_customer_return_receipt_print_history() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_customer_return_receipt_queue(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.can_view_assigned_customer_return_receipt_queue() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='manager or assigned warehouse task permission required to view customer receipt queue';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='return receipt queue limit must be between 1 and 100';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'warehouses', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',w.id,'name',w.name,'code',w.code
      ) ORDER BY w.name,w.id)
        FROM public.warehouses w
       WHERE w.organization_id = v_org AND w.is_active
    ),'[]'::jsonb),
    'requests', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id',r.id,
        'request_number',r.request_number,
        'order_number',o.order_number,
        'customer_name',c.business_name,
        'created_at',r.created_at,
        'items',COALESCE((
          SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
            'request_item_id',pending.id,
            'product_id',pending.product_id,
            'item_code',pending.item_code_snapshot,
            'product_name',pending.product_name_snapshot,
            'unit',pending.unit_snapshot,
            'requested_quantity',pending.requested_quantity,
            'received_quantity',pending.received_quantity,
            'remaining_quantity',(pending.requested_quantity-pending.received_quantity)
          ) ORDER BY pending.created_at,pending.id)
          FROM (
            SELECT ri.*,
              COALESCE((
                SELECT pg_catalog.sum(ci.received_quantity)
                  FROM public.customer_return_receipt_items ci
                 WHERE ci.organization_id=v_org AND ci.request_item_id=ri.id
              ),0)::numeric(15,3) AS received_quantity
              FROM public.customer_return_request_items ri
             WHERE ri.organization_id=v_org AND ri.return_request_id=r.id
          ) pending
          WHERE pending.requested_quantity > pending.received_quantity
        ),'[]'::jsonb)
      ) ORDER BY r.created_at,r.id)
      FROM (
        SELECT rr.*
          FROM public.customer_return_requests rr
         WHERE rr.organization_id=v_org
           AND rr.status='approved'
           AND (
             public.operational_tasks_can_manage()
             OR EXISTS (
               SELECT 1
                 FROM public.ai_tasks t
                WHERE t.organization_id=v_org
                  AND t.assigned_to=v_actor
                  AND t.task_role='warehouse'
                  AND t.status IN ('pending','in_progress')
                  AND t.source_entity_type='customer_return_requests'
                  AND t.source_entity_id=rr.id
                  AND t.source_event_key='customer-return-receipt:' || rr.id::text
             )
           )
           AND EXISTS (
             SELECT 1
               FROM public.customer_return_request_items ri
              WHERE ri.organization_id=v_org AND ri.return_request_id=rr.id
                AND ri.requested_quantity > COALESCE((
                  SELECT pg_catalog.sum(ci.received_quantity)
                    FROM public.customer_return_receipt_items ci
                   WHERE ci.organization_id=v_org AND ci.request_item_id=ri.id
                ),0)
           )
         ORDER BY rr.created_at,rr.id
         LIMIT p_limit
      ) r
      JOIN public.orders o ON o.id=r.order_id AND o.organization_id=r.organization_id
      JOIN public.customers c ON c.id=r.customer_id AND c.organization_id=r.organization_id
    ),'[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_customer_return_receipt_queue(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_customer_return_receipt_queue(integer) TO authenticated;

DO $patch$
DECLARE
  v_definition text;
  v_old text := 'OR NOT public.operational_tasks_can_manage() THEN';
  v_new text;
  v_filter text := 'WHERE r.organization_id = v_org';
  v_filter_new text := 'WHERE r.organization_id = v_org
      AND (
        public.operational_tasks_can_manage()
        OR r.received_by = v_actor
        OR EXISTS (
          SELECT 1 FROM public.ai_tasks t
           WHERE t.organization_id = v_org
             AND t.assigned_to = v_actor
             AND t.task_role = ''warehouse''
             AND t.status IN (''pending'',''in_progress'',''completed'')
             AND t.source_entity_type = ''customer_return_requests''
             AND t.source_entity_id = r.return_request_id
             AND t.source_event_key = ''customer-return-receipt:'' || r.return_request_id::text
        )
      )';
  v_proc regprocedure;
BEGIN
  v_proc := 'public.receive_customer_return(uuid,uuid,jsonb,text,text)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_proc);
  IF (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected one manager-only permission guard in receive_customer_return';
  END IF;
  v_new := 'OR NOT public.can_receive_customer_return_request(p_return_request_id) THEN';
  v_definition := pg_catalog.replace(v_definition,v_old,v_new);
  v_definition := pg_catalog.replace(v_definition,
    'administrator or manager permission required to receive customer returns',
    'administrator, manager, or assigned warehouse task permission required to receive customer returns');
  EXECUTE v_definition;

  v_proc := 'public.get_customer_return_receipt_print_data(uuid)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_proc);
  IF (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected one manager-only permission guard in get_customer_return_receipt_print_data';
  END IF;
  v_definition := pg_catalog.replace(v_definition,
    'OR NOT public.operational_tasks_can_manage() THEN',
    'OR NOT public.can_access_customer_return_receipt_print_snapshot(p_receipt_id) THEN');
  v_definition := pg_catalog.replace(v_definition,
    'administrator or manager permission required to read a return receipt',
    'manager or assigned warehouse task permission required to read this return receipt');
  EXECUTE v_definition;

  v_proc := 'public.list_customer_return_receipt_print_history(integer,integer)'::regprocedure;
  v_definition := pg_catalog.pg_get_functiondef(v_proc);
  IF (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_old,'')))/pg_catalog.length(v_old) <> 1 THEN
    RAISE EXCEPTION 'Expected one manager-only permission guard in list_customer_return_receipt_print_history';
  END IF;
  v_definition := pg_catalog.replace(v_definition,v_old,
    'OR NOT public.can_list_customer_return_receipt_print_history() THEN');
  v_definition := pg_catalog.replace(v_definition,
    'administrator or manager permission required to list warehouse return receipt history',
    'active operational staff permission required to list return receipt history');
  IF (pg_catalog.length(v_definition)-pg_catalog.length(pg_catalog.replace(v_definition,v_filter,'')))/pg_catalog.length(v_filter) <> 1 THEN
    RAISE EXCEPTION 'Expected one organization filter in receipt history query';
  END IF;
  v_definition := pg_catalog.replace(v_definition,v_filter,v_filter_new);
  EXECUTE v_definition;
END
$patch$;

COMMENT ON FUNCTION public.list_customer_return_receipt_queue(integer) IS
  'Managers see approved return requests in their organization; warehouse staff see only requests tied to their own active assigned warehouse receipt task.';
COMMENT ON FUNCTION public.receive_customer_return(uuid,uuid,jsonb,text,text) IS
  'Physical return receiving is available to managers and to staff with the assigned warehouse task for that request. Staff may safely replay a receipt they created; tenant isolation, idempotency and stock invariants remain enforced.';
COMMENT ON FUNCTION public.get_customer_return_receipt_print_data(uuid) IS
  'Returns a tenant-scoped persisted receipt snapshot to managers, its original receiver, or the assigned warehouse task worker; no internal IDs or financial fields are returned.';
COMMENT ON FUNCTION public.list_customer_return_receipt_print_history(integer,integer) IS
  'Managers see tenant receipt history; staff see only receipts they issued or receipts for a warehouse task assigned to their profile.';
