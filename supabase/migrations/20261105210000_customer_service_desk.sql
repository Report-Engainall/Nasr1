-- AGH-CUSTOMER-SERVICE-DESK-001
-- Organization-wide, tenant-scoped customer service work queue backed by the canonical case/task records.
CREATE OR REPLACE FUNCTION public.get_customer_service_work_queue(
  p_status text DEFAULT 'active',
  p_priority text DEFAULT NULL,
  p_assignment_filter text DEFAULT 'all',
  p_overdue_only boolean DEFAULT false,
  p_search text DEFAULT NULL,
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_search text:=pg_catalog.btrim(coalesce(p_search,''));
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff permission is required to read the customer service desk';
  END IF;

  IF p_status IS NULL OR p_status NOT IN ('active','all','open','in_progress','waiting_customer','resolved','closed')
     OR (p_priority IS NOT NULL AND p_priority NOT IN ('low','medium','high','urgent'))
     OR p_assignment_filter IS NULL OR p_assignment_filter NOT IN ('all','assigned','unassigned')
     OR (p_after_created_at IS NULL) IS DISTINCT FROM (p_after_id IS NULL)
     OR pg_catalog.length(v_search)>160 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer service queue filter or cursor is invalid';
  END IF;

  WITH filtered AS (
    SELECT
      cs.id AS case_id,
      cs.customer_id,
      c.business_name AS customer_name,
      c.customer_code,
      cs.case_code,
      cs.case_type,
      cs.subject,
      cs.description,
      cs.priority,
      cs.status,
      cs.created_at,
      cs.updated_at,
      cs.response_due_at,
      cs.resolution_due_at,
      cs.first_response_at,
      cs.escalated_at,
      cs.escalation_level,
      creator.full_name AS created_by_name,
      task.id AS task_id,
      task.assigned_to AS assigned_to_id,
      assignee.full_name AS assigned_to_name,
      task.due_at AS task_due_at
    FROM public.customer_service_cases cs
    JOIN public.customers c
      ON c.id=cs.customer_id AND c.organization_id=v_org
    LEFT JOIN public.profiles creator
      ON creator.id=cs.created_by AND creator.organization_id=v_org
    LEFT JOIN LATERAL (
      SELECT t.id,t.assigned_to,t.due_at
      FROM public.ai_tasks t
      WHERE t.organization_id=v_org
        AND t.source_event_key='customer-service-case:'||cs.id::text
      ORDER BY t.created_at DESC,t.id DESC
      LIMIT 1
    ) task ON true
    LEFT JOIN public.profiles assignee
      ON assignee.id=task.assigned_to AND assignee.organization_id=v_org
    WHERE cs.organization_id=v_org
      AND (p_status='all'
        OR (p_status='active' AND cs.status NOT IN ('resolved','closed'))
        OR cs.status=p_status)
      AND (p_priority IS NULL OR cs.priority=p_priority)
      AND (p_assignment_filter='all'
        OR (p_assignment_filter='assigned' AND task.assigned_to IS NOT NULL)
        OR (p_assignment_filter='unassigned' AND task.assigned_to IS NULL))
      AND (NOT coalesce(p_overdue_only,false)
        OR (cs.status NOT IN ('resolved','closed') AND (
          (cs.first_response_at IS NULL AND cs.response_due_at<now())
          OR cs.resolution_due_at<now()
        )))
      AND (v_search='' OR
        cs.case_code ILIKE '%'||v_search||'%' OR
        cs.subject ILIKE '%'||v_search||'%' OR
        c.business_name ILIKE '%'||v_search||'%' OR
        c.customer_code ILIKE '%'||v_search||'%')
      AND (p_after_created_at IS NULL OR (cs.created_at,cs.id)<(p_after_created_at,p_after_id))
  ),
  page_plus_one AS (
    SELECT * FROM filtered
    ORDER BY created_at DESC,case_id DESC
    LIMIT v_limit+1
  ),
  page AS (
    SELECT * FROM page_plus_one
    ORDER BY created_at DESC,case_id DESC
    LIMIT v_limit
  ),
  page_meta AS (
    SELECT count(*)>v_limit AS has_more FROM page_plus_one
  ),
  next_cursor AS (
    SELECT created_at,case_id
    FROM page
    ORDER BY created_at ASC,case_id ASC
    LIMIT 1
  ),
  summary AS (
    SELECT
      count(*) FILTER (WHERE cs.status NOT IN ('resolved','closed'))::integer AS open_count,
      count(*) FILTER (WHERE cs.status NOT IN ('resolved','closed')
        AND cs.first_response_at IS NULL AND cs.response_due_at<now())::integer AS response_overdue_count,
      count(*) FILTER (WHERE cs.status NOT IN ('resolved','closed')
        AND cs.resolution_due_at<now())::integer AS resolution_overdue_count,
      count(*) FILTER (WHERE cs.status NOT IN ('resolved','closed')
        AND task.assigned_to IS NULL)::integer AS unassigned_count,
      count(*) FILTER (WHERE cs.status NOT IN ('resolved','closed') AND cs.priority='urgent')::integer AS urgent_count,
      count(*) FILTER (WHERE cs.status NOT IN ('resolved','closed') AND cs.priority='high')::integer AS high_count
    FROM public.customer_service_cases cs
    LEFT JOIN LATERAL (
      SELECT t.assigned_to FROM public.ai_tasks t
      WHERE t.organization_id=v_org
        AND t.source_event_key='customer-service-case:'||cs.id::text
      ORDER BY t.created_at DESC,t.id DESC LIMIT 1
    ) task ON true
    WHERE cs.organization_id=v_org
  )
  SELECT pg_catalog.jsonb_build_object(
    'items',coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'case_id',p.case_id,
        'customer_id',p.customer_id,
        'customer_name',coalesce(nullif(pg_catalog.btrim(p.customer_name),''),'عميل'),
        'customer_code',coalesce(p.customer_code,''),
        'case_code',p.case_code,
        'case_type',p.case_type,
        'subject',p.subject,
        'description',p.description,
        'priority',p.priority,
        'status',p.status,
        'created_at',p.created_at,
        'updated_at',p.updated_at,
        'response_due_at',p.response_due_at,
        'resolution_due_at',p.resolution_due_at,
        'first_response_at',p.first_response_at,
        'escalated_at',p.escalated_at,
        'escalation_level',p.escalation_level,
        'created_by_name',coalesce(nullif(pg_catalog.btrim(p.created_by_name),''),'موظف'),
        'task_id',p.task_id,
        'assigned_to_id',p.assigned_to_id,
        'assigned_to_name',coalesce(nullif(pg_catalog.btrim(p.assigned_to_name),''),'غير مسند'),
        'task_due_at',p.task_due_at
      ) ORDER BY p.created_at DESC,p.case_id DESC)
      FROM page p
    ),'[]'::jsonb),
    'has_more',(SELECT has_more FROM page_meta),
    'next_cursor',CASE WHEN (SELECT has_more FROM page_meta) THEN
      (SELECT pg_catalog.jsonb_build_object('created_at',created_at,'id',case_id) FROM next_cursor)
      ELSE NULL END,
    'summary',(SELECT pg_catalog.jsonb_build_object(
      'open_count',open_count,
      'response_overdue_count',response_overdue_count,
      'resolution_overdue_count',resolution_overdue_count,
      'unassigned_count',unassigned_count,
      'urgent_count',urgent_count,
      'high_count',high_count
    ) FROM summary)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_service_work_queue(text,text,text,boolean,text,timestamptz,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_service_work_queue(text,text,text,boolean,text,timestamptz,uuid,integer) TO authenticated;

COMMENT ON FUNCTION public.get_customer_service_work_queue(text,text,text,boolean,text,timestamptz,uuid,integer) IS
  'Keyset-paginated same-tenant customer service desk. Returns case/task/customer operational data and tenant-wide overdue/unassigned counts; no finance or pricing fields.';
