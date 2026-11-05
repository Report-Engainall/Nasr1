-- AGH-TASK-CANCEL-001
-- Manager-only cancellation of open operational tasks with a mandatory, audited reason.
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
  'Manager-only same-tenant cancellation of open tasks with mandatory persisted reason and audit event; completed tasks cannot be cancelled.';
