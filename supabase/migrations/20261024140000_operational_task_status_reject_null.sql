-- AGH-OPS-TASK-CENTER-NULL-STATUS-001
-- Reject a NULL lifecycle decision explicitly before lookup/locking/mutation.
CREATE OR REPLACE FUNCTION public.update_operational_task_status(
  p_task_id uuid,
  p_status text,
  p_resolution_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $f$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_task public.ai_tasks%ROWTYPE;
  v_old_status text;
  v_is_manager boolean:=public.operational_tasks_can_manage();
  v_roles text[];
  v_note text:=nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_resolution_note,'')),1000),'');
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated operational profile required';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('pending','in_progress','completed','cancelled') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported task status';
  END IF;
  SELECT coalesce(array_agg(r.role),'{}'::text[]) INTO v_roles
  FROM public.profiles p LEFT JOIN public.user_roles r ON r.profile_id=p.id
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active AND p.organization_id=v_org;
  IF cardinality(coalesce(v_roles,'{}'::text[]))=0 THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active profile and organization required';
  END IF;
  SELECT t.* INTO v_task
  FROM public.ai_tasks t
  WHERE t.id=p_task_id AND t.organization_id=v_org
  FOR UPDATE;
  IF NOT FOUND OR NOT public.can_view_operational_task_role(v_task.task_role) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task is unavailable for this role or organization';
  END IF;
  IF v_task.assigned_to IS NOT NULL AND v_task.assigned_to<>v_actor AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task is assigned to another user';
  END IF;
  IF v_task.status='completed' AND p_status<>'completed' AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a manager may reopen a completed task';
  END IF;
  IF p_status='cancelled' AND NOT v_is_manager THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only a manager may cancel a task';
  END IF;
  v_old_status:=v_task.status;
  UPDATE public.ai_tasks SET status=p_status,
    assigned_to=CASE WHEN p_status='in_progress' THEN coalesce(assigned_to,v_actor) ELSE assigned_to END,
    completed_at=CASE WHEN p_status='completed' THEN coalesce(completed_at,now()) ELSE NULL END,
    completed_by=CASE WHEN p_status='completed' THEN v_actor ELSE NULL END,
    resolution_note=CASE WHEN p_status='completed' THEN coalesce(v_note,resolution_note) ELSE NULL END,
    updated_at=now()
  WHERE id=v_task.id;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'operational_task.status_changed','ai_task',v_task.id,
    jsonb_build_object('status',v_old_status),
    jsonb_build_object('status',p_status,'assigned_to',CASE WHEN p_status='in_progress' THEN coalesce(v_task.assigned_to,v_actor) ELSE v_task.assigned_to END,'resolution_note',v_note));
  RETURN jsonb_build_object('id',v_task.id,'status',p_status,'assigned_to',CASE WHEN p_status='in_progress' THEN coalesce(v_task.assigned_to,v_actor) ELSE v_task.assigned_to END);
END;
$f$;
