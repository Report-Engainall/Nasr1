-- AGH-CUSTOMER-FOLLOWUP-LIFECYCLE-001
-- Manage the operational task linked to an immutable Customer 360 interaction.
-- The source interaction retains its originally recorded next_follow_up_at value.
CREATE TABLE IF NOT EXISTS public.customer_interaction_follow_up_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  interaction_id uuid NOT NULL REFERENCES public.customer_interactions(id) ON DELETE RESTRICT,
  task_id uuid NOT NULL REFERENCES public.ai_tasks(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (pg_catalog.length(idempotency_key) BETWEEN 16 AND 128),
  action text NOT NULL CHECK (action IN ('rescheduled','cancelled')),
  old_due_at timestamptz,
  new_due_at timestamptz,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_interaction_follow_up_event_action_check CHECK (
    (action='rescheduled' AND new_due_at IS NOT NULL)
    OR
    (action='cancelled' AND new_due_at IS NULL
      AND pg_catalog.length(pg_catalog.btrim(coalesce(reason,''))) BETWEEN 1 AND 500)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_interaction_follow_up_events_idempotency_uidx
  ON public.customer_interaction_follow_up_events(organization_id,idempotency_key);
CREATE INDEX IF NOT EXISTS customer_interaction_follow_up_events_history_idx
  ON public.customer_interaction_follow_up_events(organization_id,interaction_id,created_at DESC);

ALTER TABLE public.customer_interaction_follow_up_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_interaction_follow_up_events FROM PUBLIC,anon,authenticated;

-- Keep the follow-up task in the sales queue and preserve the recording employee assignment.
-- This also removes the older role drift where the trigger changed the task to operations.
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
    'sales',
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

  UPDATE public.ai_tasks
  SET task_role='sales',
      assigned_to=NEW.recorded_by,
      updated_at=now()
  WHERE id=v_task_id
    AND organization_id=NEW.organization_id
    AND status IN ('pending','in_progress')
    AND (task_role IS DISTINCT FROM 'sales'
      OR assigned_to IS DISTINCT FROM NEW.recorded_by);

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
  'Creates one idempotent Customer 360 follow-up task in the sales queue, assigns the recording employee and preserves the immutable interaction as the source record.';

CREATE OR REPLACE FUNCTION public.manage_customer_interaction_follow_up(
  p_interaction_id uuid,
  p_action text,
  p_new_due_at timestamptz DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_interaction public.customer_interactions%ROWTYPE;
  v_task public.ai_tasks%ROWTYPE;
  v_existing public.customer_interaction_follow_up_events%ROWTYPE;
  v_event_id uuid;
  v_reason text:=nullif(pg_catalog.btrim(coalesce(p_reason,'')),'');
  v_action text:=coalesce(p_action,'');
  v_event_action text;
  v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.operational_tasks_can_manage()
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id=v_actor
         AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org
         AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active organization manager permission is required to manage customer follow-ups';
  END IF;

  IF p_interaction_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
     OR v_action NOT IN ('reschedule','cancel')
     OR (v_action='reschedule' AND (p_new_due_at IS NULL OR p_new_due_at<=v_now))
     OR (v_action='cancel' AND (p_new_due_at IS NOT NULL OR v_reason IS NULL OR pg_catalog.length(v_reason)>500))
     OR (v_action='reschedule' AND v_reason IS NOT NULL AND pg_catalog.length(v_reason)>500) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='follow-up action, idempotency key, future due time or cancellation reason is invalid';
  END IF;

  v_event_action:=CASE WHEN v_action='reschedule' THEN 'rescheduled' ELSE 'cancelled' END;

  -- Serialize retries for the same tenant/key before reading or mutating the task.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':'||p_idempotency_key,0)
  );

  SELECT e.*
  INTO v_existing
  FROM public.customer_interaction_follow_up_events e
  WHERE e.organization_id=v_org
    AND e.idempotency_key=p_idempotency_key;

  IF FOUND THEN
    IF v_existing.interaction_id IS DISTINCT FROM p_interaction_id
       OR v_existing.actor_id IS DISTINCT FROM v_actor
       OR v_existing.action IS DISTINCT FROM v_event_action
       OR v_existing.new_due_at IS DISTINCT FROM p_new_due_at
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='customer follow-up idempotency key was already used with different input';
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing.id,
      'interaction_id',v_existing.interaction_id,
      'task_id',v_existing.task_id,
      'action',v_existing.action,
      'old_due_at',v_existing.old_due_at,
      'new_due_at',v_existing.new_due_at,
      'created_at',v_existing.created_at,
      'replayed',true
    );
  END IF;

  SELECT i.*
  INTO v_interaction
  FROM public.customer_interactions i
  WHERE i.id=p_interaction_id
    AND i.organization_id=v_org
  FOR KEY SHARE;

  IF NOT FOUND OR v_interaction.next_follow_up_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='scheduled customer interaction follow-up is unavailable for this organization';
  END IF;

  SELECT t.*
  INTO v_task
  FROM public.ai_tasks t
  WHERE t.organization_id=v_org
    AND t.task_type='customer_follow_up'
    AND t.source_entity_type='customer_interactions'
    AND t.source_entity_id=v_interaction.id
    AND t.source_event_key='customer-follow-up:'||v_interaction.id::text
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',
      MESSAGE='the operational task for this customer follow-up was not found';
  END IF;

  IF v_task.status NOT IN ('pending','in_progress') THEN
    RAISE EXCEPTION USING ERRCODE='55000',
      MESSAGE='only an open customer follow-up task can be rescheduled or cancelled';
  END IF;

  IF v_action='reschedule' AND p_new_due_at IS NOT DISTINCT FROM v_task.due_at THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='the new follow-up due time must differ from the current due time';
  END IF;

  IF v_action='reschedule' THEN
    UPDATE public.ai_tasks
    SET due_at=p_new_due_at,
        task_role='sales',
        task_payload=coalesce(task_payload,'{}'::jsonb) ||
          pg_catalog.jsonb_build_object(
            'manager_overrides',
            (CASE
              WHEN pg_catalog.jsonb_typeof(task_payload->'manager_overrides')='object'
                THEN task_payload->'manager_overrides'
              ELSE '{}'::jsonb
            END) ||
            pg_catalog.jsonb_build_object(
              'due_at',p_new_due_at,
              'updated_at',v_now,
              'updated_by',v_actor,
              'follow_up_action','rescheduled'
            ) ||
            CASE WHEN v_reason IS NOT NULL
              THEN pg_catalog.jsonb_build_object('change_reason',v_reason)
              ELSE '{}'::jsonb
            END
          ),
        updated_at=v_now
    WHERE id=v_task.id
      AND organization_id=v_org;
  ELSE
    UPDATE public.ai_tasks
    SET status='cancelled',
        completed_at=NULL,
        completed_by=NULL,
        resolution_note=v_reason,
        task_role='sales',
        task_payload=coalesce(task_payload,'{}'::jsonb) ||
          pg_catalog.jsonb_build_object(
            'manager_cancellation',
            pg_catalog.jsonb_build_object(
              'reason',v_reason,
              'cancelled_at',v_now,
              'cancelled_by',v_actor,
              'source','customer_360_follow_up'
            )
          ),
        updated_at=v_now
    WHERE id=v_task.id
      AND organization_id=v_org;
  END IF;

  INSERT INTO public.customer_interaction_follow_up_events(
    organization_id,interaction_id,task_id,actor_id,idempotency_key,
    action,old_due_at,new_due_at,reason
  )
  VALUES(
    v_org,v_interaction.id,v_task.id,v_actor,p_idempotency_key,
    v_event_action,v_task.due_at,
    CASE WHEN v_action='reschedule' THEN p_new_due_at ELSE NULL END,
    v_reason
  )
  RETURNING id INTO v_event_id;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_org,v_actor,
    CASE WHEN v_action='reschedule'
      THEN 'customer_interaction_follow_up.rescheduled'
      ELSE 'customer_interaction_follow_up.cancelled' END,
    'customer_interaction_follow_up',v_interaction.id,
    pg_catalog.jsonb_build_object(
      'task_id',v_task.id,
      'status',v_task.status,
      'due_at',v_task.due_at,
      'task_role',v_task.task_role
    ),
    pg_catalog.jsonb_build_object(
      'event_id',v_event_id,
      'task_id',v_task.id,
      'action',v_event_action,
      'status',CASE WHEN v_action='cancel' THEN 'cancelled' ELSE v_task.status END,
      'due_at',CASE WHEN v_action='reschedule' THEN p_new_due_at ELSE v_task.due_at END,
      'reason',v_reason,
      'task_role','sales'
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id',v_event_id,
    'interaction_id',v_interaction.id,
    'task_id',v_task.id,
    'action',v_event_action,
    'old_due_at',v_task.due_at,
    'new_due_at',CASE WHEN v_action='reschedule' THEN p_new_due_at ELSE NULL END,
    'created_at',v_now,
    'replayed',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.manage_customer_interaction_follow_up(uuid,text,timestamptz,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_customer_interaction_follow_up(uuid,text,timestamptz,text,text) TO authenticated;
COMMENT ON FUNCTION public.manage_customer_interaction_follow_up(uuid,text,timestamptz,text,text) IS
  'Manager-only tenant-scoped reschedule/cancel command for open Customer 360 follow-up tasks; the interaction remains immutable, task due-date overrides survive source reconciliation, cancellation requires a reason, and command retries are idempotent.';

CREATE OR REPLACE FUNCTION public.get_customer_interaction_history(
  p_customer_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_customer_id uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1
       FROM public.profiles p
       WHERE p.id=v_actor
         AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org
         AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff permission is required to read customer interaction history';
  END IF;

  SELECT c.id
  INTO v_customer_id
  FROM public.customers c
  WHERE c.id=p_customer_id
    AND c.organization_id=v_org;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is unavailable for the active organization';
  END IF;

  SELECT coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id',history.id,
        'interaction_type',history.interaction_type,
        'subject',history.subject,
        'details',history.details,
        'interaction_at',history.interaction_at,
        'next_follow_up_at',history.next_follow_up_at,
        'created_at',history.created_at,
        'recorded_by_name',coalesce(nullif(pg_catalog.btrim(profile.full_name),''),'موظف'),
        'follow_up_task_id',follow_up.id,
        'follow_up_due_at',follow_up.due_at,
        'follow_up_status',follow_up.status,
        'follow_up_cancellation_reason',follow_up.task_payload->'manager_cancellation'->>'reason',
        'follow_up_updated_at',follow_up.updated_at
      )
      ORDER BY history.interaction_at DESC,history.created_at DESC,history.id DESC
    ),
    '[]'::jsonb
  )
  INTO v_result
  FROM (
    SELECT i.id,i.recorded_by,i.interaction_type,i.subject,i.details,
           i.interaction_at,i.next_follow_up_at,i.created_at
    FROM public.customer_interactions i
    WHERE i.organization_id=v_org
      AND i.customer_id=v_customer_id
    ORDER BY i.interaction_at DESC,i.created_at DESC,i.id DESC
    LIMIT v_limit
  ) history
  LEFT JOIN public.profiles profile ON profile.id=history.recorded_by
  LEFT JOIN LATERAL (
    SELECT t.id,t.due_at,t.status,t.task_payload,t.updated_at
    FROM public.ai_tasks t
    WHERE t.organization_id=v_org
      AND t.task_type='customer_follow_up'
      AND t.source_entity_type='customer_interactions'
      AND t.source_entity_id=history.id
      AND t.source_event_key='customer-follow-up:'||history.id::text
    ORDER BY t.created_at DESC,t.id DESC
    LIMIT 1
  ) follow_up ON true;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_interaction_history(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_interaction_history(uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.get_customer_interaction_history(uuid,integer) IS
  'Returns the latest bounded Customer 360 interactions and their current linked follow-up task state, due time and cancellation reason for the active staff organization only.';
