BEGIN;

-- REF-SECTION-61-TASK-STATUS-AUDIT-PARITY-001
-- Every tenant-scoped status transition is recorded once, whether caused by a user RPC
-- or by an automatic source trigger (orders, stock, invoices, quotes, import jobs, etc.).
CREATE OR REPLACE FUNCTION public.audit_operational_task_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Legacy unscoped rows are outside the tenant-visible task population. Do not
  -- fabricate an organization or emit a cross-tenant audit row for them.
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  )
  VALUES(
    NEW.organization_id,
    v_actor,
    'operational_task.status_changed',
    'ai_task',
    NEW.id,
    pg_catalog.jsonb_build_object('status',OLD.status),
    pg_catalog.jsonb_build_object(
      'status',NEW.status,
      'actor_kind',CASE WHEN v_actor IS NULL THEN 'SYSTEM' ELSE 'USER' END
    ),
    pg_catalog.now()
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_operational_task_status_transition() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS ai_tasks_audit_status_transition ON public.ai_tasks;
CREATE TRIGGER ai_tasks_audit_status_transition
AFTER UPDATE OF status ON public.ai_tasks
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.audit_operational_task_status_transition();

-- The trigger now owns status event creation. Keep the established RPC authorization,
-- tenant lock and cancellation rules while removing its former duplicate direct insert.
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

  UPDATE public.ai_tasks SET
    status=p_status,
    assigned_to=CASE WHEN p_status='in_progress' THEN coalesce(assigned_to,v_actor) ELSE assigned_to END,
    completed_at=CASE WHEN p_status='completed' THEN coalesce(completed_at,now()) ELSE NULL END,
    completed_by=CASE WHEN p_status='completed' THEN v_actor ELSE NULL END,
    resolution_note=CASE WHEN p_status='completed' THEN coalesce(v_note,resolution_note) ELSE NULL END,
    task_payload=v_payload,
    updated_at=now()
  WHERE id=v_task.id AND organization_id=v_org;

  -- Status auditing is centralized in the ai_tasks AFTER UPDATE trigger.
  -- Do not insert a second explicit event here.
  RETURN jsonb_build_object(
    'id',v_task.id,
    'status',p_status,
    'assigned_to',CASE WHEN p_status='in_progress' THEN coalesce(v_task.assigned_to,v_actor) ELSE v_task.assigned_to END,
    'cancellation_marker_cleared',v_old_status='cancelled' AND p_status='pending' AND (v_task.task_payload ? 'manager_cancellation')
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.update_operational_task_status(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.update_operational_task_status(uuid,text,text) TO authenticated;
COMMENT ON FUNCTION public.audit_operational_task_status_transition() IS
  'Append one tenant-scoped operational_task.status_changed event for every real ai_tasks status transition, including automatic source-trigger changes; actor_id is NULL and actor_kind SYSTEM when no authenticated profile is present.';

COMMIT;
