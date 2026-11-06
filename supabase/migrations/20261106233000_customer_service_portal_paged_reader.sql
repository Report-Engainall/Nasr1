-- Customer service portal: customer-owned keyset pages and filters.
-- Only customer-visible cases and public messages are returned.
BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_customer_service_cases_page(
  p_after_created_at timestamptz DEFAULT NULL,
  p_after_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_case_type text DEFAULT NULL
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
  v_customer uuid:=public.current_customer_id();
  v_search text:=pg_catalog.lower(pg_catalog.btrim(coalesce(p_search,'')));
  v_status text:=nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_status,''))),'');
  v_type text:=nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_case_type,''))),'');
  v_total_count integer:=0;
  v_cases jsonb:='[]'::jsonb;
  v_has_more boolean:=false;
  v_next_created_at timestamptz;
  v_next_id uuid;
  v_as_of timestamptz:=pg_catalog.now();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR public.is_staff()
     OR NOT public.current_customer_can('service.cases.read')
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor
          AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org
          AND p.is_active
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=v_actor AND r.role='customer'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer membership with case-read permission is required';
  END IF;

  PERFORM 1 FROM public.customers c
   WHERE c.id=v_customer
     AND c.organization_id=v_org
     AND c.profile_id=v_actor
     AND c.status='approved'
   FOR KEY SHARE;
  IF NOT FOUND OR public.current_customer_id() IS DISTINCT FROM v_customer THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer company membership is no longer active';
  END IF;

  IF p_limit IS NULL OR p_limit<1 OR p_limit>50 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer service case page size must be between 1 and 50';
  END IF;
  IF (p_after_created_at IS NULL) IS DISTINCT FROM (p_after_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='both customer service case cursor values must be supplied together';
  END IF;
  IF p_after_created_at IS NOT NULL AND p_after_created_at>v_as_of THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer service case cursor cannot be in the future';
  END IF;
  IF pg_catalog.char_length(v_search)>120 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer service search must contain 120 characters or fewer';
  END IF;
  IF v_status IS NOT NULL AND v_status NOT IN ('open','in_progress','waiting_customer','resolved','closed') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer service case status filter is invalid';
  END IF;
  IF v_type IS NOT NULL AND v_type NOT IN ('complaint','inquiry','service_request','delivery_issue','other') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer service case type filter is invalid';
  END IF;

  v_search:=pg_catalog.replace(v_search,pg_catalog.chr(92),'');
  v_search:=pg_catalog.regexp_replace(v_search,'[%_]','','g');
  v_search:=nullif(v_search,'');

  SELECT pg_catalog.count(*)::integer INTO v_total_count
    FROM public.customer_service_cases cs
   WHERE cs.organization_id=v_org
     AND cs.customer_id=v_customer
     AND (v_status IS NULL OR cs.status=v_status)
     AND (v_type IS NULL OR cs.case_type=v_type)
     AND (
       v_search IS NULL
       OR cs.case_code ILIKE '%' || v_search || '%'
       OR cs.subject ILIKE '%' || v_search || '%'
       OR cs.description ILIKE '%' || v_search || '%'
       OR cs.status ILIKE '%' || v_search || '%'
       OR cs.case_type ILIKE '%' || v_search || '%'
       OR cs.priority ILIKE '%' || v_search || '%'
       OR EXISTS (
         SELECT 1 FROM public.customer_service_case_messages sm
          WHERE sm.organization_id=v_org
            AND sm.customer_id=v_customer
            AND sm.case_id=cs.id
            AND sm.message ILIKE '%' || v_search || '%'
       )
     );

  WITH page_plus_one AS MATERIALIZED (
    SELECT cs.*
      FROM public.customer_service_cases cs
     WHERE cs.organization_id=v_org
       AND cs.customer_id=v_customer
       AND (v_status IS NULL OR cs.status=v_status)
       AND (v_type IS NULL OR cs.case_type=v_type)
       AND (
         v_search IS NULL
         OR cs.case_code ILIKE '%' || v_search || '%'
         OR cs.subject ILIKE '%' || v_search || '%'
         OR cs.description ILIKE '%' || v_search || '%'
         OR cs.status ILIKE '%' || v_search || '%'
         OR cs.case_type ILIKE '%' || v_search || '%'
         OR cs.priority ILIKE '%' || v_search || '%'
         OR EXISTS (
           SELECT 1 FROM public.customer_service_case_messages sm
            WHERE sm.organization_id=v_org
              AND sm.customer_id=v_customer
              AND sm.case_id=cs.id
              AND sm.message ILIKE '%' || v_search || '%'
         )
       )
       AND (
         p_after_created_at IS NULL
         OR (cs.created_at,cs.id)<(p_after_created_at,p_after_id)
       )
     ORDER BY cs.created_at DESC,cs.id DESC
     LIMIT p_limit+1
  ),
  page AS MATERIALIZED (
    SELECT * FROM page_plus_one
     ORDER BY created_at DESC,id DESC
     LIMIT p_limit
  )
  SELECT
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',p.id,
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
          'resolved_at',p.resolved_at,
          'closed_at',p.closed_at,
          'can_reply',public.current_customer_can('service.cases.reply')
            AND p.status NOT IN ('resolved','closed'),
          'messages',(
            SELECT coalesce(
              pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'id',message_row.id,
                  'message',message_row.message,
                  'author_side',message_row.author_side,
                  'author_name',coalesce(
                    nullif(pg_catalog.btrim(author.full_name),''),
                    CASE WHEN message_row.author_side='staff' THEN 'فريق الأغبري' ELSE 'عضو الشركة' END
                  ),
                  'created_at',message_row.created_at
                ) ORDER BY message_row.created_at,message_row.id
              ),'[]'::jsonb
            )
            FROM (
              SELECT m.id,m.message,m.author_side,m.author_profile_id,m.created_at
                FROM public.customer_service_case_messages m
               WHERE m.organization_id=v_org
                 AND m.case_id=p.id
                 AND m.customer_id=v_customer
               ORDER BY m.created_at DESC,m.id DESC
               LIMIT 50
            ) message_row
            LEFT JOIN public.profiles author ON author.id=message_row.author_profile_id
          )
        ) ORDER BY p.created_at DESC,p.id DESC
      ),'[]'::jsonb
    ),
    coalesce((SELECT pg_catalog.count(*)>p_limit FROM page_plus_one),false),
    (SELECT last_page.created_at FROM page last_page ORDER BY last_page.created_at ASC,last_page.id ASC LIMIT 1),
    (SELECT last_page.id FROM page last_page ORDER BY last_page.created_at ASC,last_page.id ASC LIMIT 1)
    INTO v_cases,v_has_more,v_next_created_at,v_next_id
    FROM page p;

  RETURN pg_catalog.jsonb_build_object(
    'as_of',v_as_of,
    'total_count',v_total_count,
    'page_size',p_limit,
    'has_more',v_has_more,
    'next_cursor',CASE WHEN v_has_more AND v_next_created_at IS NOT NULL
      THEN pg_catalog.jsonb_build_object('created_at',v_next_created_at,'id',v_next_id)
      ELSE NULL END,
    'cases',v_cases,
    'side_effects','NONE'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_my_customer_service_cases_page(timestamptz,uuid,integer,text,text,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_service_cases_page(timestamptz,uuid,integer,text,text,text)
  TO authenticated;
COMMENT ON FUNCTION public.get_my_customer_service_cases_page(timestamptz,uuid,integer,text,text,text) IS
  'Customer-only same-tenant paged service case read. Uses stable created_at/id keyset, validated status/type filters and search over case fields/public messages. Includes only last 50 public messages per case; no internal notes, assignee, escalation or finance data. Read-only.';

COMMIT;
