BEGIN;

-- REF-SECTION-61-TASK-AUDIT-WINDOW-BOUNDARY-001
-- Lock status writers so the refreshed baseline and the central trigger form one
-- unambiguous capture boundary. Existing in-flight task writes finish before the lock;
-- new writes resume only after this migration commits.
LOCK TABLE public.ai_tasks IN SHARE ROW EXCLUSIVE MODE;

CREATE OR REPLACE FUNCTION public.audit_operational_task_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_candidate_actor uuid:=public.current_profile_id();
  v_actor uuid;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;
  IF NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.id INTO v_actor
  FROM public.profiles p
  WHERE p.id=v_candidate_actor
    AND p.organization_id=NEW.organization_id
    AND p.is_active
    AND (auth.uid() IS NULL OR p.auth_user_id=auth.uid());

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  )
  VALUES(
    NEW.organization_id,
    v_actor,
    'operational_task.status_changed',
    'ai_task',
    NEW.id,
    pg_catalog.jsonb_build_object(
      'status',OLD.status,
      'manager_cancellation',OLD.task_payload->'manager_cancellation'
    ),
    pg_catalog.jsonb_build_object(
      'status',NEW.status,
      'assigned_to',NEW.assigned_to,
      'resolution_note',NEW.resolution_note,
      'manager_cancellation',NEW.task_payload->'manager_cancellation',
      'manager_cancellation_cleared',OLD.status='cancelled' AND NEW.status='pending',
      'actor_kind',CASE WHEN v_actor IS NULL THEN 'SYSTEM_OR_UNRESOLVED' ELSE 'USER' END
    ),
    pg_catalog.clock_timestamp()
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_operational_task_status_transition() FROM PUBLIC,anon,authenticated;

UPDATE public.operational_task_audit_settings
SET coverage_started_at=pg_catalog.clock_timestamp()
WHERE singleton IS TRUE;

DO $block$
BEGIN
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='task audit baseline singleton is missing';
  END IF;
END
$block$;

COMMENT ON FUNCTION public.audit_operational_task_status_transition() IS
  'Append one tenant-scoped operational_task.status_changed event for each real ai_tasks status transition. Preserves assignment, resolution-note and manager-cancellation metadata. The installed baseline marks the complete observation window; pre-baseline history is excluded.';

COMMIT;
