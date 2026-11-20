-- AGH-TASK-CANCEL-001
-- Manager cancellation survives source reconciliation until an explicit manager reopen.
CREATE OR REPLACE FUNCTION public.upsert_operational_task(
  p_org uuid,p_title text,p_description text,p_role text,p_priority text,p_type text,
  p_event_key text,p_entity_type text,p_entity_id uuid,p_due_at timestamptz DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,p_reopen boolean DEFAULT false
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
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
       AND public.ai_tasks.task_payload ? 'manager_cancellation' THEN 'cancelled'
      WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN 'pending'
      ELSE public.ai_tasks.status
    END,
    completed_at=CASE
      WHEN public.ai_tasks.status='cancelled'
       AND public.ai_tasks.task_payload ? 'manager_cancellation' THEN NULL
      WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL
      ELSE public.ai_tasks.completed_at
    END,
    completed_by=CASE
      WHEN public.ai_tasks.status='cancelled'
       AND public.ai_tasks.task_payload ? 'manager_cancellation' THEN NULL
      WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL
      ELSE public.ai_tasks.completed_by
    END,
    resolution_note=CASE
      WHEN public.ai_tasks.status='cancelled'
       AND public.ai_tasks.task_payload ? 'manager_cancellation' THEN public.ai_tasks.resolution_note
      WHEN p_reopen AND public.ai_tasks.status IN ('completed','cancelled') THEN NULL
      ELSE public.ai_tasks.resolution_note
    END,
    updated_at=now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.upsert_operational_task(uuid,text,text,text,text,text,text,text,uuid,timestamptz,jsonb,boolean) FROM PUBLIC,anon,authenticated;
COMMENT ON FUNCTION public.upsert_operational_task(uuid,text,text,text,text,text,text,text,uuid,timestamptz,jsonb,boolean) IS
  'Internal idempotent source-task upsert; preserves manager cancellation markers and cancellation state across source reconciliation.';

CREATE OR REPLACE FUNCTION public.cancel_operational_task(
  p_task_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_task public.ai_tasks%ROWTYPE;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required to cancel tasks';
  END IF;

  IF p_task_id IS NULL OR v_reason='' OR pg_catalog.length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='task ID and a cancellation reason of 1 to 1000 characters are required';
  END IF;

  SELECT t.*
  INTO v_task
  FROM public.ai_tasks t
  WHERE t.id=p_task_id
    AND t.organization_id=v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='task is unavailable for this organization';
  END IF;

  IF v_task.status IN ('completed','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='only open tasks can be cancelled';
  END IF;

  UPDATE public.ai_tasks
  SET status='cancelled',
      completed_at=NULL,
      completed_by=NULL,
      resolution_note=v_reason,
      task_payload=coalesce(task_payload,'{}'::jsonb) || jsonb_build_object(
        'manager_cancellation',
        jsonb_build_object('reason',v_reason,'cancelled_at',now(),'cancelled_by',v_actor)
      ),
      updated_at=now()
  WHERE id=v_task.id
    AND organization_id=v_org;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_org,v_actor,'operational_task.cancelled','ai_task',v_task.id,
    jsonb_build_object('status',v_task.status,'assigned_to',v_task.assigned_to),
    jsonb_build_object('status','cancelled','assigned_to',v_task.assigned_to,'cancellation_reason',v_reason)
  );

  RETURN jsonb_build_object(
    'id',v_task.id,
    'status','cancelled',
    'cancellation_reason',v_reason
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_operational_task(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_operational_task(uuid,text) TO authenticated;
COMMENT ON FUNCTION public.cancel_operational_task(uuid,text) IS
  'Manager-only same-tenant cancellation of open tasks with mandatory persisted reason and audit event; source reconciliation preserves the cancellation until manager reopen.';
