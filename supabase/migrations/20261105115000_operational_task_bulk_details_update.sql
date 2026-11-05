-- AGH-TASK-BULK-DETAILS-001
-- Atomic manager update of priority and due date for a selected batch of open tasks.
CREATE OR REPLACE FUNCTION public.update_operational_tasks_details(
  p_task_ids uuid[],
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
  v_requested integer;
  v_processed integer := 0;
  v_changed integer := 0;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='administrator or manager permission required for bulk task editing';
  END IF;

  IF p_task_ids IS NULL
     OR cardinality(p_task_ids) < 1
     OR cardinality(p_task_ids) > 100
     OR array_position(p_task_ids,NULL) IS NOT NULL
     OR p_priority IS NULL
     OR p_priority NOT IN ('low','medium','high','critical') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='select 1 to 100 tasks and a supported priority';
  END IF;

  SELECT count(DISTINCT task_id)::integer
  INTO v_requested
  FROM pg_catalog.unnest(p_task_ids) AS selected(task_id);

  IF v_requested <> cardinality(p_task_ids) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='duplicate task IDs are not allowed';
  END IF;

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

    IF v_task.priority IS DISTINCT FROM p_priority
       OR v_task.due_at IS DISTINCT FROM p_due_at THEN
      UPDATE public.ai_tasks
      SET priority=p_priority,
          due_at=p_due_at,
          task_payload=coalesce(task_payload,'{}'::jsonb) || jsonb_build_object(
            'manager_overrides',jsonb_build_object(
              'priority',p_priority,
              'due_at',p_due_at,
              'updated_at',now(),
              'updated_by',v_actor,
              'batch',true
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
        jsonb_build_object(
          'priority',v_task.priority,
          'due_at',v_task.due_at,
          'batch',true
        ),
        jsonb_build_object(
          'priority',p_priority,
          'due_at',p_due_at,
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
    'priority',p_priority,
    'due_at',p_due_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_operational_tasks_details(uuid[],text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_operational_tasks_details(uuid[],text,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.update_operational_tasks_details(uuid[],text,timestamptz) IS
  'Atomic manager-only priority and due-date update for up to 100 same-tenant open tasks; deterministic row locks, manager override persistence and one audit event per changed task.';
