-- AGH-TASK-DETAIL-EDIT-001
-- Manager-only priority and due-date changes for existing open tasks.
CREATE OR REPLACE FUNCTION public.update_operational_task_details(
  p_task_id uuid,
  p_priority text,
  p_due_at timestamptz DEFAULT NULL
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
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required to edit tasks';
  END IF;

  IF p_task_id IS NULL OR p_priority IS NULL
     OR p_priority NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='task ID and supported priority are required';
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
      MESSAGE='only open tasks can be edited';
  END IF;

  IF v_task.priority IS NOT DISTINCT FROM p_priority
     AND v_task.due_at IS NOT DISTINCT FROM p_due_at THEN
    RETURN jsonb_build_object(
      'id',v_task.id,
      'priority',v_task.priority,
      'due_at',v_task.due_at,
      'changed',false
    );
  END IF;

  UPDATE public.ai_tasks
  SET priority=p_priority,
      due_at=p_due_at,
      task_payload=coalesce(task_payload,'{}'::jsonb) || jsonb_build_object(
        'manager_overrides',jsonb_build_object(
          'priority',p_priority,
          'due_at',p_due_at,
          'updated_at',now(),
          'updated_by',v_actor
        )
      ),
      updated_at=now()
  WHERE id=v_task.id
    AND organization_id=v_org;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_org,v_actor,'operational_task.details_changed','ai_task',v_task.id,
    jsonb_build_object('priority',v_task.priority,'due_at',v_task.due_at),
    jsonb_build_object('priority',p_priority,'due_at',p_due_at)
  );

  RETURN jsonb_build_object(
    'id',v_task.id,
    'priority',p_priority,
    'due_at',p_due_at,
    'changed',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_operational_task_details(uuid,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_operational_task_details(uuid,text,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.update_operational_task_details(uuid,text,timestamptz) IS
  'Manager-only tenant-scoped priority and due-date edit for open operational tasks; row-locked, idempotent and audited.';
