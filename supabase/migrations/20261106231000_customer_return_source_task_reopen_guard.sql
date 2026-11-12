-- A customer-cancelled return-review task remains closed across source upserts.
-- Reopening requires a new return request (new source event), not reviving an obsolete task.
BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_operational_task(
  p_org uuid,p_title text,p_description text,p_role text,p_priority text,p_type text,
  p_event_key text,p_entity_type text,p_entity_id uuid,p_due_at timestamptz DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,p_reopen boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_id uuid;
  v_title text:=pg_catalog.btrim(coalesce(p_title,''));
  v_payload jsonb:=coalesce(p_payload,'{}'::jsonb);
BEGIN
  IF p_org IS NULL OR v_title='' OR length(v_title)>240 OR p_event_key IS NULL OR length(p_event_key)>240 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid organization, title and source event key are required';
  END IF;
  IF p_role NOT IN ('sales','accountant','warehouse','purchasing','management','operations')
     OR p_priority NOT IN ('low','medium','high','critical') OR jsonb_typeof(v_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid operational task attributes';
  END IF;

  INSERT INTO public.ai_tasks(organization_id,title,description,task_type,priority,status,task_role,
    source_event_key,source_entity_type,source_entity_id,due_at,task_payload,updated_at)
  VALUES(p_org,v_title,nullif(pg_catalog.left(coalesce(p_description,''),2000),''),p_type,p_priority,'pending',p_role,
    p_event_key,p_entity_type,p_entity_id,p_due_at,v_payload,now())
  ON CONFLICT (organization_id,source_event_key) WHERE source_event_key IS NOT NULL
  DO UPDATE SET
    title=EXCLUDED.title,
    description=EXCLUDED.description,
    task_type=EXCLUDED.task_type,
    task_role=EXCLUDED.task_role,
    source_entity_type=EXCLUDED.source_entity_type,
    source_entity_id=EXCLUDED.source_entity_id,
    task_payload=EXCLUDED.task_payload
      || CASE WHEN public.ai_tasks.task_payload ? 'manager_cancellation'
        THEN jsonb_build_object('manager_cancellation',public.ai_tasks.task_payload->'manager_cancellation')
        ELSE '{}'::jsonb END
      || CASE WHEN public.ai_tasks.task_payload ? 'source_cancellation'
        THEN jsonb_build_object('source_cancellation',public.ai_tasks.task_payload->'source_cancellation')
        ELSE '{}'::jsonb END
      || CASE WHEN public.ai_tasks.task_payload ? 'manager_overrides'
        THEN jsonb_build_object('manager_overrides',public.ai_tasks.task_payload->'manager_overrides')
        ELSE '{}'::jsonb END,
    priority=CASE
      WHEN public.ai_tasks.task_payload ? 'manager_overrides'
      THEN coalesce(public.ai_tasks.task_payload->'manager_overrides'->>'priority',EXCLUDED.priority)
      ELSE EXCLUDED.priority
    END,
    due_at=CASE
      WHEN public.ai_tasks.task_payload ? 'manager_overrides'
      THEN NULLIF(public.ai_tasks.task_payload->'manager_overrides'->>'due_at','')::timestamptz
      ELSE EXCLUDED.due_at
    END,
    status=CASE
      WHEN public.ai_tasks.status='cancelled'
       AND (public.ai_tasks.task_payload ? 'manager_cancellation'
         OR public.ai_tasks.task_payload ? 'source_cancellation') THEN 'cancelled'
      WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN 'pending'
      ELSE public.ai_tasks.status
    END,
    completed_at=CASE
      WHEN public.ai_tasks.status='cancelled'
       AND (public.ai_tasks.task_payload ? 'manager_cancellation'
         OR public.ai_tasks.task_payload ? 'source_cancellation') THEN NULL
      WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL
      ELSE public.ai_tasks.completed_at
    END,
    completed_by=CASE
      WHEN public.ai_tasks.status='cancelled'
       AND (public.ai_tasks.task_payload ? 'manager_cancellation'
         OR public.ai_tasks.task_payload ? 'source_cancellation') THEN NULL
      WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL
      ELSE public.ai_tasks.completed_by
    END,
    resolution_note=CASE
      WHEN public.ai_tasks.status='cancelled'
       AND (public.ai_tasks.task_payload ? 'manager_cancellation'
         OR public.ai_tasks.task_payload ? 'source_cancellation') THEN public.ai_tasks.resolution_note
      WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL
      ELSE public.ai_tasks.resolution_note
    END,
    updated_at=now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_operational_task(uuid,text,text,text,text,text,text,text,uuid,timestamptz,jsonb,boolean)
  FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.upsert_operational_task(uuid,text,text,text,text,text,text,text,uuid,timestamptz,jsonb,boolean) IS
  'Internal idempotent source-task upsert; preserves manager cancellations, source cancellations and manager overrides across source reconciliation.';

CREATE OR REPLACE FUNCTION public.update_operational_task_status(
  p_task_id uuid,
  p_status text,
  p_resolution_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_task public.ai_tasks%ROWTYPE;
  v_old_status text;
  v_is_manager boolean:=public.operational_tasks_can_manage();
  v_roles text[];
  v_note text:=nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_resolution_note,'')),1000),'');
  v_payload jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated operational profile required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending','in_progress','completed','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported task status';
  END IF;
  SELECT coalesce(array_agg(r.role),'{}'::text[]) INTO v_roles
    FROM public.profiles p
    LEFT JOIN public.user_roles r ON r.profile_id=p.id
   WHERE p.id=v_actor
     AND p.auth_user_id=auth.uid()
     AND p.is_active
     AND p.organization_id=v_org;
  IF cardinality(coalesce(v_roles,'{}'::text[]))=0 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active profile and organization required';
  END IF;

  SELECT t.* INTO v_task
    FROM public.ai_tasks t
   WHERE t.id=p_task_id
     AND t.organization_id=v_org
   FOR UPDATE;

  IF NOT FOUND OR NOT public.can_view_operational_task_role(v_task.task_role) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task is unavailable for this role or organization';
  END IF;
  IF v_task.assigned_to IS NOT NULL AND v_task.assigned_to<>v_actor AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task is assigned to another user';
  END IF;
  IF v_task.status='cancelled'
     AND v_task.task_payload ? 'source_cancellation'
     AND p_status<>'cancelled' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='the source return request was cancelled; create a new request instead of reopening this task';
  END IF;
  IF v_task.status IN ('completed','cancelled') AND p_status NOT IN (v_task.status,'pending') AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a manager may reopen a closed task';
  END IF;
  IF v_task.status='completed' AND p_status<>'completed' AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a manager may reopen a completed task';
  END IF;
  IF v_task.status='cancelled' AND p_status<>'cancelled' AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a manager may reopen a cancelled task';
  END IF;
  IF p_status='cancelled' AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a manager may cancel a task';
  END IF;

  v_old_status:=v_task.status;
  v_payload:=coalesce(v_task.task_payload,'{}'::jsonb);
  IF v_old_status='cancelled' AND p_status='pending' AND v_payload ? 'manager_cancellation' THEN
    v_payload:=v_payload - 'manager_cancellation';
  END IF;

  UPDATE public.ai_tasks
     SET status=p_status,
         assigned_to=CASE WHEN p_status='in_progress' THEN coalesce(assigned_to,v_actor) ELSE assigned_to END,
         completed_at=CASE WHEN p_status='completed' THEN coalesce(completed_at,now()) ELSE NULL END,
         completed_by=CASE WHEN p_status='completed' THEN v_actor ELSE NULL END,
         resolution_note=CASE WHEN p_status='completed' THEN coalesce(v_note,resolution_note) ELSE NULL END,
         task_payload=v_payload,
         updated_at=now()
   WHERE id=v_task.id
     AND organization_id=v_org;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'operational_task.status_changed','ai_task',v_task.id,
    jsonb_build_object(
      'status',v_old_status,
      'manager_cancellation',v_task.task_payload->'manager_cancellation',
      'source_cancellation',v_task.task_payload->'source_cancellation'
    ),
    jsonb_build_object(
      'status',p_status,
      'assigned_to',CASE WHEN p_status='in_progress' THEN coalesce(v_task.assigned_to,v_actor) ELSE v_task.assigned_to END,
      'resolution_note',v_note,
      'manager_cancellation_cleared',v_old_status='cancelled' AND p_status='pending' AND (v_task.task_payload ? 'manager_cancellation'),
      'source_cancellation',v_payload->'source_cancellation'
    ));

  RETURN pg_catalog.jsonb_build_object(
    'id',v_task.id,
    'status',p_status,
    'assigned_to',CASE WHEN p_status='in_progress' THEN coalesce(v_task.assigned_to,v_actor) ELSE v_task.assigned_to END,
    'cancellation_marker_cleared',v_old_status='cancelled' AND p_status='pending' AND (v_task.task_payload ? 'manager_cancellation'),
    'source_cancellation_locked',v_task.task_payload ? 'source_cancellation'
  );
END;
$function$;

COMMIT;
