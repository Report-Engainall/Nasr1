-- AGH-CUSTOMER-FOLLOWUP-TASK-001
-- Turn every scheduled Customer 360 follow-up into one assigned, actionable task.
-- The interaction row remains the source of truth; no duplicate task is created on replay.
CREATE OR REPLACE FUNCTION public.create_customer_interaction_follow_up_task()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_customer_label text;
  v_task_id uuid;
BEGIN
  IF NEW.next_follow_up_at IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT coalesce(
    nullif(pg_catalog.btrim(c.business_name),''),
    nullif(pg_catalog.btrim(c.customer_code),''),
    'العميل'
  )
  INTO v_customer_label
  FROM public.customers c
  WHERE c.id=NEW.customer_id
    AND c.organization_id=NEW.organization_id;

  IF v_customer_label IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23503',
      MESSAGE='customer interaction follow-up has no tenant-owned customer';
  END IF;

  v_task_id:=public.upsert_operational_task(
    NEW.organization_id,
    'متابعة العميل: '||pg_catalog.left(v_customer_label,120),
    'موعد متابعة مسجل في Customer 360. الموضوع: '||
      pg_catalog.left(NEW.subject,160)||
      '. راجع سجل التواصل قبل تنفيذ المتابعة.',
    'operations',
    'medium',
    'customer_follow_up',
    'customer-follow-up:'||NEW.id::text,
    'customer_interactions',
    NEW.id,
    NEW.next_follow_up_at,
    pg_catalog.jsonb_build_object(
      'customer_id',NEW.customer_id,
      'interaction_id',NEW.id,
      'interaction_type',NEW.interaction_type,
      'subject',NEW.subject,
      'next_follow_up_at',NEW.next_follow_up_at,
      'recorded_by',NEW.recorded_by,
      'follow_up_source','customer_360'
    ),
    false
  );

  -- The employee who recorded the interaction owns the next follow-up by default.
  -- Managers can later reassign it through the existing audited task command.
  UPDATE public.ai_tasks
  SET assigned_to=NEW.recorded_by,
      updated_at=now()
  WHERE id=v_task_id
    AND organization_id=NEW.organization_id
    AND status IN ('pending','in_progress')
    AND assigned_to IS DISTINCT FROM NEW.recorded_by;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_customer_interaction_follow_up_task() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS customer_interaction_follow_up_task ON public.customer_interactions;
CREATE TRIGGER customer_interaction_follow_up_task
AFTER INSERT ON public.customer_interactions
FOR EACH ROW
EXECUTE FUNCTION public.create_customer_interaction_follow_up_task();

COMMENT ON FUNCTION public.create_customer_interaction_follow_up_task() IS
  'Creates one operations task for each customer interaction with a scheduled next follow-up, assigns it to the recording employee, sets the due time and reuses the task notification trigger. No follow-up date means no task.';
