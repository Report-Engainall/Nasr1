-- AGH-TASK-BULK-ASSIGN-001
-- Atomic manager reassignment of a selected batch of open tasks.
CREATE OR REPLACE FUNCTION public.assign_operational_tasks(
  p_task_ids uuid[],
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
  v_assignee_roles text[];
  v_task public.ai_tasks%ROWTYPE;
  v_requested integer;
  v_processed integer := 0;
  v_changed integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required for bulk task assignment';
  END IF;

  IF p_task_ids IS NULL
     OR cardinality(p_task_ids) < 1
     OR cardinality(p_task_ids) > 100
     OR array_position(p_task_ids,NULL) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='select between 1 and 100 valid task IDs';
  END IF;

  SELECT count(DISTINCT task_id)::integer
  INTO v_requested
  FROM pg_catalog.unnest(p_task_ids) AS selected(task_id);

  IF v_requested <> cardinality(p_task_ids) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='duplicate task IDs are not allowed';
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
  END IF;

  -- Deterministic lock ordering reduces deadlocks. Any later validation error rolls
  -- the complete function transaction back; no partial batch is committed.
  FOR v_task IN
    SELECT t.*
    FROM public.ai_tasks t
    WHERE t.id = ANY(p_task_ids)
      AND t.organization_id = v_org
    ORDER BY t.id
    FOR UPDATE
  LOOP
    v_processed := v_processed + 1;

    IF v_task.status IN ('completed','cancelled') THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='all selected tasks must be open';
    END IF;

    IF p_assigned_to IS NOT NULL THEN
      IF v_task.task_role='accountant'
         AND NOT (v_assignee_roles && ARRAY['admin','manager','accountant']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE='22023',
          MESSAGE='selected accountant tasks require an accountant or manager assignee';
      ELSIF v_task.task_role='management'
         AND NOT (v_assignee_roles && ARRAY['admin','manager']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE='22023',
          MESSAGE='selected management tasks require a manager assignee';
      ELSIF v_task.task_role NOT IN ('accountant','management')
         AND NOT (v_assignee_roles && ARRAY['admin','manager','staff']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE='22023',
          MESSAGE='selected operational tasks require an active staff assignee';
      END IF;
    END IF;

    IF v_task.assigned_to IS DISTINCT FROM p_assigned_to THEN
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
          'status',v_task.status,
          'batch',true
        ),
        jsonb_build_object(
          'assigned_to',p_assigned_to,
          'task_role',v_task.task_role,
          'status',v_task.status,
          'batch',true
        )
      );
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  IF v_processed <> v_requested THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='one or more selected tasks are unavailable for this organization';
  END IF;

  RETURN jsonb_build_object(
    'processed_count',v_processed,
    'changed_count',v_changed,
    'assigned_to',p_assigned_to
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.assign_operational_tasks(uuid[],uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assign_operational_tasks(uuid[],uuid) TO authenticated;
COMMENT ON FUNCTION public.assign_operational_tasks(uuid[],uuid) IS
  'Atomic manager-only same-tenant reassignment/unassignment of up to 100 open tasks. Locks deterministically, validates every role, and records one audit event per changed task.';
