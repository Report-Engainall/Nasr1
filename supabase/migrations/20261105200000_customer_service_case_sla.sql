-- AGH-CUSTOMER-SERVICE-SLA-001
-- Tenant-scoped configurable SLA, manager assignment/escalation and linked task deadline synchronization.
ALTER TABLE public.customer_service_cases
  ADD COLUMN IF NOT EXISTS response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolution_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_level integer NOT NULL DEFAULT 0;
ALTER TABLE public.customer_service_cases
  DROP CONSTRAINT IF EXISTS customer_service_cases_escalation_level_check;
ALTER TABLE public.customer_service_cases
  ADD CONSTRAINT customer_service_cases_escalation_level_check CHECK (escalation_level BETWEEN 0 AND 10);
CREATE INDEX IF NOT EXISTS customer_service_cases_sla_queue_idx
  ON public.customer_service_cases(organization_id,status,response_due_at,resolution_due_at)
  WHERE status NOT IN ('resolved','closed');

CREATE TABLE IF NOT EXISTS public.customer_service_sla_policies (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  priority text NOT NULL CHECK (priority IN ('low','medium','high','urgent')),
  first_response_minutes integer NOT NULL CHECK (first_response_minutes BETWEEN 5 AND 43200),
  resolution_minutes integer NOT NULL CHECK (resolution_minutes BETWEEN 5 AND 43200),
  updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,priority),
  CHECK (first_response_minutes <= resolution_minutes)
);
ALTER TABLE public.customer_service_sla_policies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_service_sla_policies FROM PUBLIC,anon,authenticated;

ALTER TABLE public.customer_service_case_events
  DROP CONSTRAINT IF EXISTS customer_service_case_events_event_type_check;
ALTER TABLE public.customer_service_case_events
  ADD CONSTRAINT customer_service_case_events_event_type_check
  CHECK (event_type IN ('opened','status_changed','priority_changed','note_added','resolved','closed','reopened','assigned','sla_updated','escalated'));

CREATE OR REPLACE FUNCTION public.apply_customer_service_case_sla()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_response integer; v_resolution integer;
BEGIN
  SELECT first_response_minutes,resolution_minutes INTO v_response,v_resolution
    FROM public.customer_service_sla_policies
   WHERE organization_id=NEW.organization_id AND priority=NEW.priority;
  IF NOT FOUND THEN
    CASE NEW.priority
      WHEN 'urgent' THEN v_response:=15; v_resolution:=240;
      WHEN 'high' THEN v_response:=60; v_resolution:=1440;
      WHEN 'medium' THEN v_response:=240; v_resolution:=4320;
      ELSE v_response:=480; v_resolution:=10080;
    END CASE;
  END IF;
  NEW.response_due_at:=coalesce(NEW.response_due_at,now()+pg_catalog.make_interval(mins=>v_response));
  NEW.resolution_due_at:=coalesce(NEW.resolution_due_at,now()+pg_catalog.make_interval(mins=>v_resolution));
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_customer_service_case_sla() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS customer_service_case_sla_defaults ON public.customer_service_cases;
CREATE TRIGGER customer_service_case_sla_defaults BEFORE INSERT ON public.customer_service_cases
FOR EACH ROW EXECUTE FUNCTION public.apply_customer_service_case_sla();

CREATE OR REPLACE FUNCTION public.capture_customer_service_first_response()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
BEGIN
  IF OLD.first_response_at IS NULL AND NEW.status IN ('in_progress','waiting_customer','resolved','closed') THEN
    NEW.first_response_at:=now();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.capture_customer_service_first_response() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS customer_service_case_first_response ON public.customer_service_cases;
CREATE TRIGGER customer_service_case_first_response BEFORE UPDATE OF status ON public.customer_service_cases
FOR EACH ROW EXECUTE FUNCTION public.capture_customer_service_first_response();

-- The case row exists before the source task is inserted by create_customer_service_case().
CREATE OR REPLACE FUNCTION public.seed_customer_service_task_deadline()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_case_id uuid; v_deadline timestamptz;
BEGIN
  IF NEW.source_event_key LIKE 'customer-service-case:%' THEN
    BEGIN
      v_case_id:=pg_catalog.substring(NEW.source_event_key FROM 23)::uuid;
    EXCEPTION WHEN invalid_text_representation THEN RETURN NEW;
    END;
    SELECT resolution_due_at INTO v_deadline FROM public.customer_service_cases
     WHERE id=v_case_id AND organization_id=NEW.organization_id;
    IF v_deadline IS NOT NULL THEN
      NEW.due_at:=coalesce(NEW.due_at,v_deadline);
      NEW.task_payload:=coalesce(NEW.task_payload,'{}'::jsonb)
        || pg_catalog.jsonb_build_object('manager_overrides',
          coalesce(NEW.task_payload->'manager_overrides','{}'::jsonb)
          || pg_catalog.jsonb_build_object('due_at',coalesce(NEW.due_at,v_deadline),'source','customer_service_case_sla','updated_at',now()));
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.seed_customer_service_task_deadline() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS customer_service_case_task_deadline_seed ON public.ai_tasks;
CREATE TRIGGER customer_service_case_task_deadline_seed BEFORE INSERT ON public.ai_tasks
FOR EACH ROW EXECUTE FUNCTION public.seed_customer_service_task_deadline();

CREATE OR REPLACE FUNCTION public.get_customer_service_case_operations(p_customer_id uuid,p_limit integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid:=public.current_organization_id();
        v_limit integer:=greatest(1,least(coalesce(p_limit,50),100)); v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.organization_id=v_org AND p.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active same-organization staff permission is required to read customer case operations';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.customers c WHERE c.id=p_customer_id AND c.organization_id=v_org) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer is unavailable for the active organization';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'case_id',c.id,'response_due_at',c.response_due_at,'resolution_due_at',c.resolution_due_at,
    'first_response_at',c.first_response_at,'escalated_at',c.escalated_at,'escalation_level',c.escalation_level,
    'task_id',t.id,'assigned_to_id',t.assigned_to,'task_due_at',t.due_at,
    'can_manage',public.operational_tasks_can_manage()
  ) ORDER BY c.created_at DESC,c.id DESC),'[]'::jsonb)
  INTO v_result
  FROM (SELECT cs.id,cs.created_at,cs.response_due_at,cs.resolution_due_at,cs.first_response_at,cs.escalated_at,cs.escalation_level
        FROM public.customer_service_cases cs WHERE cs.organization_id=v_org AND cs.customer_id=p_customer_id
        ORDER BY cs.created_at DESC,cs.id DESC LIMIT v_limit) c
  LEFT JOIN LATERAL (
    SELECT x.id,x.assigned_to,x.due_at FROM public.ai_tasks x
    WHERE x.organization_id=v_org AND x.source_event_key='customer-service-case:'||c.id::text
    ORDER BY x.created_at DESC,x.id DESC LIMIT 1
  ) t ON true;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_customer_service_case_operations(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_service_case_operations(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_service_sla_policies()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid:=public.current_organization_id(); v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage()
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.organization_id=v_org AND p.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='manager permission is required to configure customer service SLA policies';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'priority',d.priority,'first_response_minutes',coalesce(s.first_response_minutes,d.response_minutes),
    'resolution_minutes',coalesce(s.resolution_minutes,d.resolution_minutes),'configured',s.priority IS NOT NULL
  ) ORDER BY CASE d.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END),'[]'::jsonb)
  INTO v_result
  FROM (VALUES ('urgent'::text,15,240),('high'::text,60,1440),('medium'::text,240,4320),('low'::text,480,10080))
       d(priority,response_minutes,resolution_minutes)
  LEFT JOIN public.customer_service_sla_policies s ON s.organization_id=v_org AND s.priority=d.priority;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_customer_service_sla_policies() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_service_sla_policies() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_customer_service_sla_policy(p_priority text,p_first_response_minutes integer,p_resolution_minutes integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid:=public.current_organization_id(); v_old public.customer_service_sla_policies%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage()
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.organization_id=v_org AND p.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='manager permission is required to change customer service SLA policies';
  END IF;
  IF p_priority IS NULL OR p_priority NOT IN ('low','medium','high','urgent')
     OR p_first_response_minutes IS NULL OR p_resolution_minutes IS NULL
     OR p_first_response_minutes NOT BETWEEN 5 AND 43200 OR p_resolution_minutes NOT BETWEEN 5 AND 43200
     OR p_first_response_minutes>p_resolution_minutes THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='SLA minutes must be between 5 and 43200 and response must precede resolution';
  END IF;
  SELECT * INTO v_old FROM public.customer_service_sla_policies WHERE organization_id=v_org AND priority=p_priority FOR UPDATE;
  INSERT INTO public.customer_service_sla_policies(organization_id,priority,first_response_minutes,resolution_minutes,updated_by,updated_at)
  VALUES(v_org,p_priority,p_first_response_minutes,p_resolution_minutes,v_actor,now())
  ON CONFLICT(organization_id,priority) DO UPDATE SET
    first_response_minutes=EXCLUDED.first_response_minutes,resolution_minutes=EXCLUDED.resolution_minutes,
    updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'customer_service_sla.policy_changed','customer_service_sla_policy',NULL,
    CASE WHEN v_old.priority IS NULL THEN '{}'::jsonb ELSE pg_catalog.jsonb_build_object('priority',v_old.priority,'first_response_minutes',v_old.first_response_minutes,'resolution_minutes',v_old.resolution_minutes) END,
    pg_catalog.jsonb_build_object('priority',p_priority,'first_response_minutes',p_first_response_minutes,'resolution_minutes',p_resolution_minutes));
  RETURN pg_catalog.jsonb_build_object('priority',p_priority,'first_response_minutes',p_first_response_minutes,'resolution_minutes',p_resolution_minutes,'configured',true);
END;
$function$;
REVOKE ALL ON FUNCTION public.set_customer_service_sla_policy(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_customer_service_sla_policy(text,integer,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.manage_customer_service_case_operations(
  p_case_id uuid,p_assigned_to uuid,p_response_due_at timestamptz,p_resolution_due_at timestamptz,
  p_escalate boolean DEFAULT false,p_note text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id(); v_org uuid:=public.current_organization_id();
  v_case public.customer_service_cases%ROWTYPE; v_task public.ai_tasks%ROWTYPE;
  v_note text:=nullif(pg_catalog.btrim(coalesce(p_note,'')),'');
  v_assigned_changed boolean; v_deadlines_changed boolean; v_new_level integer;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage()
     OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.organization_id=v_org AND p.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='manager permission is required to assign, schedule or escalate customer cases';
  END IF;
  IF p_case_id IS NULL OR p_response_due_at IS NULL OR p_resolution_due_at IS NULL
     OR p_response_due_at<=now() OR p_resolution_due_at<=now() OR p_response_due_at>p_resolution_due_at
     OR (p_escalate AND (v_note IS NULL OR pg_catalog.length(v_note)>1000))
     OR (NOT p_escalate AND v_note IS NOT NULL AND pg_catalog.length(v_note)>1000) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='case deadlines or escalation note are invalid';
  END IF;
  SELECT * INTO v_case FROM public.customer_service_cases WHERE id=p_case_id AND organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer case is unavailable for the active organization'; END IF;
  IF v_case.status IN ('resolved','closed') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='completed customer cases cannot be reassigned or escalated'; END IF;
  SELECT * INTO v_task FROM public.ai_tasks WHERE organization_id=v_org AND source_event_key='customer-service-case:'||v_case.id::text FOR UPDATE;
  IF NOT FOUND OR v_task.status IN ('completed','cancelled') THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='the linked open operational task is unavailable'; END IF;

  v_assigned_changed:=v_task.assigned_to IS DISTINCT FROM p_assigned_to;
  v_deadlines_changed:=v_case.response_due_at IS DISTINCT FROM p_response_due_at OR v_case.resolution_due_at IS DISTINCT FROM p_resolution_due_at;

  -- Canonical manager task assignment validates the same-tenant active role and uses the existing notification trigger.
  PERFORM public.assign_operational_task(v_task.id,p_assigned_to);

  UPDATE public.ai_tasks SET due_at=p_resolution_due_at,
    task_payload=coalesce(task_payload,'{}'::jsonb)||pg_catalog.jsonb_build_object('manager_overrides',
      coalesce(task_payload->'manager_overrides','{}'::jsonb)||pg_catalog.jsonb_build_object(
        'due_at',p_resolution_due_at,'updated_at',now(),'updated_by',v_actor,'source','customer_service_case_sla')),
    updated_at=CASE WHEN due_at IS DISTINCT FROM p_resolution_due_at THEN now() ELSE updated_at END
  WHERE id=v_task.id AND organization_id=v_org;

  v_new_level:=CASE WHEN p_escalate THEN least(v_case.escalation_level+1,10) ELSE v_case.escalation_level END;
  UPDATE public.customer_service_cases SET response_due_at=p_response_due_at,resolution_due_at=p_resolution_due_at,
    escalation_level=v_new_level,escalated_at=CASE WHEN p_escalate THEN now() ELSE escalated_at END,
    updated_at=CASE WHEN v_deadlines_changed OR p_escalate THEN now() ELSE updated_at END
  WHERE id=v_case.id AND organization_id=v_org;

  IF v_assigned_changed THEN
    INSERT INTO public.customer_service_case_events(organization_id,case_id,actor_id,event_type,old_value,new_value,note)
    VALUES(v_org,v_case.id,v_actor,'assigned',pg_catalog.jsonb_build_object('assigned_to',v_task.assigned_to),
      pg_catalog.jsonb_build_object('assigned_to',p_assigned_to),v_note);
  END IF;
  IF v_deadlines_changed THEN
    INSERT INTO public.customer_service_case_events(organization_id,case_id,actor_id,event_type,old_value,new_value,note)
    VALUES(v_org,v_case.id,v_actor,'sla_updated',
      pg_catalog.jsonb_build_object('response_due_at',v_case.response_due_at,'resolution_due_at',v_case.resolution_due_at),
      pg_catalog.jsonb_build_object('response_due_at',p_response_due_at,'resolution_due_at',p_resolution_due_at),v_note);
    IF p_assigned_to IS NOT NULL THEN
      INSERT INTO public.notifications(organization_id,profile_id,title,body,type,is_read)
      VALUES(v_org,p_assigned_to,'تحديث مواعيد حالة العميل: '||v_case.case_code,
        'حدّث المدير مواعيد الاستجابة والمعالجة. موعد المعالجة: '||
        pg_catalog.to_char(p_resolution_due_at AT TIME ZONE 'UTC','YYYY-MM-DD HH24:MI')||' UTC.','info',false);
    END IF;
  END IF;
  IF p_escalate THEN
    INSERT INTO public.customer_service_case_events(organization_id,case_id,actor_id,event_type,old_value,new_value,note)
    VALUES(v_org,v_case.id,v_actor,'escalated',
      pg_catalog.jsonb_build_object('escalation_level',v_case.escalation_level),
      pg_catalog.jsonb_build_object('escalation_level',v_new_level,'escalated_at',now()),v_note);
    INSERT INTO public.notifications(organization_id,profile_id,title,body,type,is_read)
    SELECT DISTINCT v_org,p.id,'تصعيد حالة عميل: '||v_case.case_code,
      'صعّد المدير حالة العميل "'||pg_catalog.left(v_case.subject,120)||'". سبب التصعيد: '||pg_catalog.left(v_note,700),
      'warning',false
    FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL
      AND r.role IN ('admin','manager') AND p.id<>v_actor;
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES(v_org,v_actor,'customer_service_case.escalated','customer_service_case',v_case.id,
      pg_catalog.jsonb_build_object('escalation_level',v_case.escalation_level),
      pg_catalog.jsonb_build_object('escalation_level',v_new_level,'note',v_note));
  END IF;
  IF v_assigned_changed OR v_deadlines_changed THEN
    INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
    VALUES(v_org,v_actor,'customer_service_case.operations_updated','customer_service_case',v_case.id,
      pg_catalog.jsonb_build_object('assigned_to',v_task.assigned_to,'response_due_at',v_case.response_due_at,'resolution_due_at',v_case.resolution_due_at),
      pg_catalog.jsonb_build_object('assigned_to',p_assigned_to,'response_due_at',p_response_due_at,'resolution_due_at',p_resolution_due_at));
  END IF;
  RETURN pg_catalog.jsonb_build_object('id',v_case.id,'case_code',v_case.case_code,'task_id',v_task.id,
    'assigned_to',p_assigned_to,'response_due_at',p_response_due_at,'resolution_due_at',p_resolution_due_at,
    'escalation_level',v_new_level,'escalated',p_escalate);
END;
$function$;
REVOKE ALL ON FUNCTION public.manage_customer_service_case_operations(uuid,uuid,timestamptz,timestamptz,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.manage_customer_service_case_operations(uuid,uuid,timestamptz,timestamptz,boolean,text) TO authenticated;

COMMENT ON TABLE public.customer_service_sla_policies IS
  'Tenant-scoped manager-configurable first-response and resolution targets by priority. Existing case deadlines are immutable snapshots unless explicitly rescheduled.';
COMMENT ON FUNCTION public.manage_customer_service_case_operations(uuid,uuid,timestamptz,timestamptz,boolean,text) IS
  'Manager-only assignment/SLA/escalation command. Reuses assign_operational_task and its assignment notifications; syncs resolution deadline to the linked task and persists its manager override.';
