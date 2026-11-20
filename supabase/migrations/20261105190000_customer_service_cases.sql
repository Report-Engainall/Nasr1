-- AGH-CUSTOMER-SERVICE-CASE-001
-- Tenant-scoped customer inquiry / complaint / service request workflow.
-- Case events are append-only; operations are server-mediated and audited.
CREATE TABLE IF NOT EXISTS public.customer_service_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  case_code text NOT NULL,
  idempotency_key text NOT NULL CHECK (pg_catalog.length(idempotency_key) BETWEEN 16 AND 128),
  case_type text NOT NULL CHECK (case_type IN ('complaint','inquiry','service_request','delivery_issue','other')),
  subject text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(subject)) BETWEEN 1 AND 200),
  description text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(description)) BETWEEN 1 AND 4000),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting_customer','resolved','closed')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resolution_note text,
  resolved_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,case_code),
  UNIQUE (organization_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS customer_service_cases_customer_history_idx
  ON public.customer_service_cases(organization_id,customer_id,created_at DESC);
CREATE INDEX IF NOT EXISTS customer_service_cases_work_queue_idx
  ON public.customer_service_cases(organization_id,status,priority,updated_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_service_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.customer_service_cases(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('opened','status_changed','priority_changed','note_added','resolved','closed','reopened')),
  old_value jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.jsonb_typeof(old_value)='object'),
  new_value jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.jsonb_typeof(new_value)='object'),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_service_case_events_history_idx
  ON public.customer_service_case_events(organization_id,case_id,created_at DESC);

ALTER TABLE public.customer_service_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_service_case_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_service_cases FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.customer_service_case_events FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_service_case(
  p_customer_id uuid,
  p_idempotency_key text,
  p_case_type text,
  p_subject text,
  p_description text,
  p_priority text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_existing public.customer_service_cases%ROWTYPE;
  v_case_id uuid;
  v_case_code text;
  v_task_id uuid;
  v_subject text:=pg_catalog.btrim(coalesce(p_subject,''));
  v_description text:=pg_catalog.btrim(coalesce(p_description,''));
  v_type text:=coalesce(p_case_type,'');
  v_priority text:=coalesce(p_priority,'medium');
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff permission is required to open a customer case';
  END IF;

  IF p_customer_id IS NULL
     OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
     OR v_type NOT IN ('complaint','inquiry','service_request','delivery_issue','other')
     OR v_priority NOT IN ('low','medium','high','urgent')
     OR v_subject='' OR pg_catalog.length(v_subject)>200
     OR v_description='' OR pg_catalog.length(v_description)>4000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer case type, priority, subject, description or request key is invalid';
  END IF;

  PERFORM 1 FROM public.customers c
   WHERE c.id=p_customer_id AND c.organization_id=v_org
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is unavailable for the active organization';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':'||p_idempotency_key,0)
  );

  SELECT cs.* INTO v_existing
    FROM public.customer_service_cases cs
   WHERE cs.organization_id=v_org AND cs.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.customer_id IS DISTINCT FROM p_customer_id
       OR v_existing.created_by IS DISTINCT FROM v_actor
       OR v_existing.case_type IS DISTINCT FROM v_type
       OR v_existing.subject IS DISTINCT FROM v_subject
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.priority IS DISTINCT FROM v_priority THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='customer case idempotency key was already used with different input';
    END IF;
    SELECT t.id INTO v_task_id FROM public.ai_tasks t
     WHERE t.organization_id=v_org
       AND t.source_event_key='customer-service-case:'||v_existing.id::text
     LIMIT 1;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing.id,'case_code',v_existing.case_code,'task_id',v_task_id,'replayed',true
    );
  END IF;

  v_case_code:='CASE-'||pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text,'-',''),1,10));
  INSERT INTO public.customer_service_cases(
    organization_id,customer_id,case_code,idempotency_key,case_type,subject,description,priority,created_by
  )
  VALUES(v_org,p_customer_id,v_case_code,p_idempotency_key,v_type,v_subject,v_description,v_priority,v_actor)
  RETURNING id INTO v_case_id;

  v_task_id:=public.upsert_operational_task(
    v_org,
    'معالجة حالة العميل: '||v_case_code,
    'حالة دعم عميل. الموضوع: '||pg_catalog.left(v_subject,180)||E'\n'||pg_catalog.left(v_description,900),
    'sales',
    CASE v_priority WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' WHEN 'low' THEN 'low' ELSE 'medium' END,
    'customer_service_case',
    'customer-service-case:'||v_case_id::text,
    'customer_service_cases',
    v_case_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'customer_id',p_customer_id,
      'case_id',v_case_id,
      'case_code',v_case_code,
      'case_type',v_type,
      'priority',v_priority,
      'status','open'
    ),
    false
  );

  INSERT INTO public.customer_service_case_events(
    organization_id,case_id,actor_id,event_type,old_value,new_value,note
  )
  VALUES(
    v_org,v_case_id,v_actor,'opened','{}'::jsonb,
    pg_catalog.jsonb_build_object('case_code',v_case_code,'case_type',v_type,'priority',v_priority,'status','open'),
    v_description
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  )
  VALUES(
    v_org,v_actor,'customer_service_case.opened','customer_service_case',v_case_id,
    pg_catalog.jsonb_build_object('case_code',v_case_code,'customer_id',p_customer_id,'case_type',v_type,'priority',v_priority,'task_id',v_task_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',v_case_id,'case_code',v_case_code,'task_id',v_task_id,'replayed',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_customer_service_case(uuid,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_service_case(uuid,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_service_cases(
  p_customer_id uuid,
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
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff permission is required to read customer cases';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id=p_customer_id AND c.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is unavailable for the active organization';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id',case_row.id,
      'case_code',case_row.case_code,
      'case_type',case_row.case_type,
      'subject',case_row.subject,
      'description',case_row.description,
      'priority',case_row.priority,
      'status',case_row.status,
      'created_at',case_row.created_at,
      'updated_at',case_row.updated_at,
      'created_by_name',coalesce(nullif(pg_catalog.btrim(creator.full_name),''),'موظف'),
      'resolution_note',case_row.resolution_note,
      'resolved_at',case_row.resolved_at,
      'closed_at',case_row.closed_at,
      'task_id',task.id,
      'assigned_to_name',coalesce(nullif(pg_catalog.btrim(assignee.full_name),''),'غير مسند'),
      'events',case_row.events
    ) ORDER BY case_row.created_at DESC,case_row.id DESC
  ),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT cs.*,
      (
        SELECT coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id',event.id,
            'event_type',event.event_type,
            'note',event.note,
            'old_value',event.old_value,
            'new_value',event.new_value,
            'actor_name',coalesce(nullif(pg_catalog.btrim(actor.full_name),''),'موظف'),
            'created_at',event.created_at
          ) ORDER BY event.created_at DESC,event.id DESC
        ),'[]'::jsonb)
        FROM (
          SELECT e.* FROM public.customer_service_case_events e
           WHERE e.organization_id=v_org AND e.case_id=cs.id
           ORDER BY e.created_at DESC,e.id DESC
           LIMIT 10
        ) event
        LEFT JOIN public.profiles actor ON actor.id=event.actor_id
      ) AS events
    FROM public.customer_service_cases cs
    WHERE cs.organization_id=v_org AND cs.customer_id=p_customer_id
    ORDER BY cs.created_at DESC,cs.id DESC
    LIMIT v_limit
  ) case_row
  LEFT JOIN public.profiles creator ON creator.id=case_row.created_by
  LEFT JOIN LATERAL (
    SELECT t.id,t.assigned_to FROM public.ai_tasks t
     WHERE t.organization_id=v_org
       AND t.source_event_key='customer-service-case:'||case_row.id::text
     ORDER BY t.created_at DESC,t.id DESC
     LIMIT 1
  ) task ON true
  LEFT JOIN public.profiles assignee ON assignee.id=task.assigned_to;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_service_cases(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_service_cases(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_customer_service_case(
  p_case_id uuid,
  p_status text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_case public.customer_service_cases%ROWTYPE;
  v_new_status text;
  v_new_priority text;
  v_note text:=nullif(pg_catalog.btrim(coalesce(p_note,'')),'');
  v_task_id uuid;
  v_old_status text;
  v_old_priority text;
  v_is_manager boolean:=public.operational_tasks_can_manage();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff permission is required to update a customer case';
  END IF;

  IF p_case_id IS NULL
     OR (p_status IS NOT NULL AND p_status NOT IN ('open','in_progress','waiting_customer','resolved','closed'))
     OR (p_priority IS NOT NULL AND p_priority NOT IN ('low','medium','high','urgent'))
     OR (p_priority IS NOT NULL AND NOT v_is_manager)
     OR (p_status IS NULL AND p_priority IS NULL AND v_note IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer case update fields or manager permission are invalid';
  END IF;

  SELECT cs.* INTO v_case
    FROM public.customer_service_cases cs
   WHERE cs.id=p_case_id AND cs.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer case is unavailable for the active organization';
  END IF;

  v_old_status:=v_case.status;
  v_old_priority:=v_case.priority;
  v_new_status:=coalesce(p_status,v_old_status);
  v_new_priority:=coalesce(p_priority,v_old_priority);

  IF v_new_status IN ('resolved','closed') AND v_note IS NULL
     AND v_case.status NOT IN ('resolved','closed') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='a resolution note is required before resolving or closing a customer case';
  END IF;

  IF v_case.status='closed' AND v_new_status<>'closed' AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='manager permission is required to reopen a closed customer case';
  END IF;

  UPDATE public.customer_service_cases
  SET status=v_new_status,
      priority=v_new_priority,
      resolution_note=CASE WHEN v_new_status IN ('resolved','closed') THEN coalesce(v_note,resolution_note)
                           WHEN v_new_status IN ('open','in_progress','waiting_customer') THEN NULL
                           ELSE resolution_note END,
      resolved_at=CASE WHEN v_new_status='resolved' THEN coalesce(resolved_at,now())
                       WHEN v_new_status IN ('open','in_progress','waiting_customer') THEN NULL
                       ELSE resolved_at END,
      closed_at=CASE WHEN v_new_status='closed' THEN coalesce(closed_at,now())
                     WHEN v_new_status<>'closed' THEN NULL
                     ELSE closed_at END,
      updated_at=now()
  WHERE id=v_case.id AND organization_id=v_org;

  IF v_old_status IS DISTINCT FROM v_new_status THEN
    INSERT INTO public.customer_service_case_events(
      organization_id,case_id,actor_id,event_type,old_value,new_value,note
    )
    VALUES(
      v_org,v_case.id,v_actor,
      CASE WHEN v_new_status='resolved' THEN 'resolved'
           WHEN v_new_status='closed' THEN 'closed'
           WHEN v_old_status IN ('resolved','closed') THEN 'reopened'
           ELSE 'status_changed' END,
      pg_catalog.jsonb_build_object('status',v_old_status),
      pg_catalog.jsonb_build_object('status',v_new_status),
      v_note
    );
  END IF;

  IF v_old_priority IS DISTINCT FROM v_new_priority THEN
    INSERT INTO public.customer_service_case_events(
      organization_id,case_id,actor_id,event_type,old_value,new_value,note
    )
    VALUES(
      v_org,v_case.id,v_actor,'priority_changed',
      pg_catalog.jsonb_build_object('priority',v_old_priority),
      pg_catalog.jsonb_build_object('priority',v_new_priority),
      v_note
    );
  END IF;

  IF v_note IS NOT NULL AND v_old_status IS NOT DISTINCT FROM v_new_status
     AND v_old_priority IS NOT DISTINCT FROM v_new_priority THEN
    INSERT INTO public.customer_service_case_events(
      organization_id,case_id,actor_id,event_type,old_value,new_value,note
    )
    VALUES(v_org,v_case.id,v_actor,'note_added','{}'::jsonb,'{}'::jsonb,v_note);
  END IF;

  SELECT t.id INTO v_task_id
    FROM public.ai_tasks t
   WHERE t.organization_id=v_org
     AND t.source_event_key='customer-service-case:'||v_case.id::text
   LIMIT 1;

  IF v_new_status IN ('resolved','closed') THEN
    UPDATE public.ai_tasks
       SET status='completed',
           completed_at=coalesce(completed_at,now()),
           completed_by=v_actor,
           resolution_note=coalesce(v_note,resolution_note),
           updated_at=now()
     WHERE organization_id=v_org
       AND source_event_key='customer-service-case:'||v_case.id::text
       AND status IN ('pending','in_progress');
  ELSE
    SELECT public.upsert_operational_task(
      v_org,
      'معالجة حالة العميل: '||v_case.case_code,
      'حالة دعم عميل. الموضوع: '||pg_catalog.left(v_case.subject,180)||E'\n'||pg_catalog.left(v_case.description,900),
      'sales',
      CASE v_new_priority WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' WHEN 'low' THEN 'low' ELSE 'medium' END,
      'customer_service_case',
      'customer-service-case:'||v_case.id::text,
      'customer_service_cases',
      v_case.id,
      NULL,
      pg_catalog.jsonb_build_object(
        'customer_id',v_case.customer_id,
        'case_id',v_case.id,
        'case_code',v_case.case_code,
        'case_type',v_case.case_type,
        'priority',v_new_priority,
        'status',v_new_status
      ),
      v_old_status IN ('resolved','closed')
    ) INTO v_task_id;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_org,v_actor,'customer_service_case.updated','customer_service_case',v_case.id,
    pg_catalog.jsonb_build_object('status',v_old_status,'priority',v_old_priority,'resolution_note',v_case.resolution_note),
    pg_catalog.jsonb_build_object('status',v_new_status,'priority',v_new_priority,'note',v_note,'task_id',v_task_id)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',v_case.id,'case_code',v_case.case_code,'status',v_new_status,'priority',v_new_priority,'task_id',v_task_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_customer_service_case(uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_customer_service_case(uuid,text,text,text) TO authenticated;

COMMENT ON TABLE public.customer_service_cases IS
  'Tenant-scoped customer complaint/inquiry/service-case workflow. Mutations are performed by authenticated RPC commands and every change is recorded in append-only case events and audit_logs.';
COMMENT ON TABLE public.customer_service_case_events IS
  'Append-only event history for customer service cases; direct browser mutation is denied.';
