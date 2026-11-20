-- AGH-TASK-REASSIGN-001
-- Manager-only reassignment of existing open operational tasks within the actor's tenant.
-- Assignment changes are locked, role-validated, and recorded in the canonical audit log.
CREATE OR REPLACE FUNCTION public.assign_operational_task(
  p_task_id uuid,
  p_assigned_to uuid DEFAULT NULL
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
  v_assignee_roles text[];
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required to reassign tasks';
  END IF;

  IF p_task_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='task ID is required';
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
      MESSAGE='only open tasks can be reassigned';
  END IF;

  IF p_assigned_to IS NOT NULL THEN
    SELECT coalesce(array_agg(r.role),'{}'::text[])
    INTO v_assignee_roles
    FROM public.profiles p
    LEFT JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.id=p_assigned_to
      AND p.organization_id=v_org
      AND p.is_active
      AND p.auth_user_id IS NOT NULL;

    IF cardinality(coalesce(v_assignee_roles,'{}'::text[]))=0 THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='assignee must be an active user in this organization';
    END IF;

    IF v_task.task_role='accountant'
       AND NOT (v_assignee_roles && ARRAY['admin','manager','accountant']::text[]) THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='accountant tasks require an accountant or manager assignee';
    ELSIF v_task.task_role='management'
       AND NOT (v_assignee_roles && ARRAY['admin','manager']::text[]) THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='management tasks require a manager assignee';
    ELSIF v_task.task_role NOT IN ('accountant','management')
       AND NOT (v_assignee_roles && ARRAY['admin','manager','staff']::text[]) THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='operational tasks require an active staff assignee';
    END IF;
  END IF;

  -- An identical replay is a no-op: do not churn updated_at or create duplicate audit rows.
  IF v_task.assigned_to IS NOT DISTINCT FROM p_assigned_to THEN
    RETURN jsonb_build_object(
      'id',v_task.id,
      'assigned_to',v_task.assigned_to,
      'task_role',v_task.task_role,
      'status',v_task.status,
      'changed',false
    );
  END IF;

  UPDATE public.ai_tasks
  SET assigned_to=p_assigned_to,
      updated_at=now()
  WHERE id=v_task.id
    AND organization_id=v_org;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_org,v_actor,'operational_task.assignee_changed','ai_task',v_task.id,
    jsonb_build_object(
      'assigned_to',v_task.assigned_to,
      'task_role',v_task.task_role,
      'status',v_task.status
    ),
    jsonb_build_object(
      'assigned_to',p_assigned_to,
      'task_role',v_task.task_role,
      'status',v_task.status
    )
  );

  RETURN jsonb_build_object(
    'id',v_task.id,
    'assigned_to',p_assigned_to,
    'task_role',v_task.task_role,
    'status',v_task.status,
    'changed',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_operational_task(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_operational_task(uuid,uuid) TO authenticated;
COMMENT ON FUNCTION public.assign_operational_task(uuid,uuid) IS
  'Manager-only tenant-scoped assignment/unassignment of open operational tasks; validates assignee activity and role compatibility, locks the task row, and writes an audit event.';
