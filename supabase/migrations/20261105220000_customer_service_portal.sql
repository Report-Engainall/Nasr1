-- AGH-CUSTOMER-SERVICE-PORTAL-001
-- Customer-owned case creation, public conversation channel and customer-scoped case history.
-- Internal case events/notes remain staff-only and are never returned by customer RPCs.

CREATE OR REPLACE FUNCTION public.current_customer_can(p_capability text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_profile uuid:=public.current_profile_id();
  v_customer uuid:=public.current_customer_id();
  v_role text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_customer IS NULL THEN RETURN false; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id=v_profile AND p.auth_user_id=auth.uid()
       AND p.is_active AND p.organization_id=public.current_organization_id()
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id=v_customer AND c.profile_id=v_profile
       AND c.organization_id=public.current_organization_id()
  ) THEN RETURN true; END IF;

  SELECT m.member_role INTO v_role
    FROM public.customer_company_memberships m
   WHERE m.profile_id=v_profile AND m.customer_id=v_customer
     AND m.organization_id=public.current_organization_id()
     AND m.status='active';

  IF v_role IS NULL THEN RETURN false; END IF;
  RETURN CASE v_role
    WHEN 'buyer' THEN p_capability IN (
      'catalog.read','orders.read','orders.create','quotes.read','quotes.manage',
      'reorder.manage','addresses.read','addresses.manage','contacts.read','contacts.manage',
      'service.cases.read','service.cases.reply'
    )
    WHEN 'finance' THEN p_capability IN (
      'orders.read','invoices.read','statement.read','payments.read','contacts.read',
      'service.cases.read'
    )
    WHEN 'viewer' THEN p_capability IN (
      'catalog.read','orders.read','contacts.read','service.cases.read'
    )
    ELSE false
  END;
END;
$function$;
REVOKE ALL ON FUNCTION public.current_customer_can(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_customer_can(text) TO authenticated;

CREATE TABLE IF NOT EXISTS public.customer_service_case_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.customer_service_cases(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  author_side text NOT NULL CHECK (author_side IN ('customer','staff')),
  message text NOT NULL CHECK (
    pg_catalog.length(pg_catalog.btrim(message)) BETWEEN 1 AND 2000
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_service_case_messages_thread_idx
  ON public.customer_service_case_messages(organization_id,case_id,created_at,id);
CREATE INDEX IF NOT EXISTS customer_service_case_messages_customer_idx
  ON public.customer_service_case_messages(organization_id,customer_id,created_at DESC);
ALTER TABLE public.customer_service_case_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_service_case_messages FROM PUBLIC,anon,authenticated;

ALTER TABLE public.customer_service_case_events
  DROP CONSTRAINT IF EXISTS customer_service_case_events_event_type_check;
ALTER TABLE public.customer_service_case_events
  ADD CONSTRAINT customer_service_case_events_event_type_check
  CHECK (event_type IN (
    'opened','status_changed','priority_changed','note_added','resolved','closed','reopened',
    'assigned','sla_updated','escalated','customer_message_received','staff_reply_sent'
  ));

-- Customer messages may move a case from waiting_customer to in_progress, but that
-- transition is not a staff first response. Only authenticated staff activity starts this clock.
CREATE OR REPLACE FUNCTION public.capture_customer_service_first_response()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  IF public.is_staff()
     AND OLD.first_response_at IS NULL
     AND NEW.status IN ('in_progress','waiting_customer','resolved','closed') THEN
    NEW.first_response_at:=now();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.capture_customer_service_first_response() FROM PUBLIC,anon,authenticated;

-- The canonical case command now accepts either same-tenant active staff creating
-- a case for a customer, or an active customer buyer/owner creating a case for self.
CREATE OR REPLACE FUNCTION public.create_customer_service_case(
  p_customer_id uuid,
  p_idempotency_key text,
  p_case_type text,
  p_subject text,
  p_description text,
  p_priority text DEFAULT 'medium'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_customer_id uuid;
  v_is_staff boolean:=public.is_staff();
  v_existing public.customer_service_cases%ROWTYPE;
  v_case_id uuid;
  v_case_code text;
  v_task_id uuid;
  v_subject text:=pg_catalog.btrim(coalesce(p_subject,''));
  v_description text:=pg_catalog.btrim(coalesce(p_description,''));
  v_type text:=coalesce(p_case_type,'');
  v_priority text:=coalesce(p_priority,'medium');
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active authenticated profile required to open a customer case';
  END IF;

  IF v_is_staff THEN
    v_customer_id:=p_customer_id;
  ELSE
    v_customer_id:=public.current_customer_id();
    IF v_customer_id IS NULL
       OR v_customer_id IS DISTINCT FROM p_customer_id
       OR NOT public.current_customer_can('service.cases.reply')
       OR NOT EXISTS (
         SELECT 1 FROM public.user_roles r
          WHERE r.profile_id=v_actor AND r.role='customer'
       ) THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='active customer buyer permission is required to open a case for this company';
    END IF;
    -- Serialize against company membership revocation, then re-evaluate the caller's company scope.
    PERFORM 1 FROM public.customers c
     WHERE c.id=v_customer_id AND c.organization_id=v_org AND c.status='approved'
     FOR KEY SHARE;
    IF NOT FOUND OR public.current_customer_id() IS DISTINCT FROM v_customer_id THEN
      RAISE EXCEPTION USING ERRCODE='42501',
        MESSAGE='customer company membership is no longer active';
    END IF;
  END IF;

  IF v_customer_id IS NULL
     OR p_idempotency_key IS NULL OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}$'
     OR v_type NOT IN ('complaint','inquiry','service_request','delivery_issue','other')
     OR v_priority NOT IN ('low','medium','high','urgent')
     OR v_subject='' OR pg_catalog.length(v_subject)>200
     OR v_description='' OR pg_catalog.length(v_description)>4000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer case type, priority, subject, description or request key is invalid';
  END IF;

  PERFORM 1 FROM public.customers c
   WHERE c.id=v_customer_id AND c.organization_id=v_org
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is unavailable for the active organization';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':'||p_idempotency_key,0)
  );
  SELECT cs.* INTO v_existing
    FROM public.customer_service_cases cs
   WHERE cs.organization_id=v_org AND cs.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_existing.customer_id IS DISTINCT FROM v_customer_id
       OR v_existing.created_by IS DISTINCT FROM v_actor
       OR v_existing.case_type IS DISTINCT FROM v_type
       OR v_existing.subject IS DISTINCT FROM v_subject
       OR v_existing.description IS DISTINCT FROM v_description
       OR v_existing.priority IS DISTINCT FROM v_priority THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='customer case idempotency key was already used with different input';
    END IF;
    SELECT t.id INTO v_task_id FROM public.ai_tasks t
     WHERE t.organization_id=v_org
       AND t.source_event_key='customer-service-case:'||v_existing.id::text
     LIMIT 1;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing.id,'case_code',v_existing.case_code,'task_id',v_task_id,'replayed',true
    );
  END IF;

  v_case_code:='CASE-'||pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(gen_random_uuid()::text,'-',''),1,10));
  INSERT INTO public.customer_service_cases(
    organization_id,customer_id,case_code,idempotency_key,case_type,subject,description,priority,created_by
  )
  VALUES(v_org,v_customer_id,v_case_code,p_idempotency_key,v_type,v_subject,v_description,v_priority,v_actor)
  RETURNING id INTO v_case_id;

  v_task_id:=public.upsert_operational_task(
    v_org,
    'معالجة حالة العميل: '||v_case_code,
    'حالة دعم عميل. الموضوع: '||pg_catalog.left(v_subject,180)||E'\n'||pg_catalog.left(v_description,900),
    'sales',
    CASE v_priority WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' WHEN 'low' THEN 'low' ELSE 'medium' END,
    'customer_service_case',
    'customer-service-case:'||v_case_id::text,
    'customer_service_cases',
    v_case_id,
    NULL,
    pg_catalog.jsonb_build_object(
      'customer_id',v_customer_id,'case_id',v_case_id,'case_code',v_case_code,
      'case_type',v_type,'priority',v_priority,'status','open'
    ),
    false
  );

  INSERT INTO public.customer_service_case_events(
    organization_id,case_id,actor_id,event_type,old_value,new_value,note
  )
  VALUES(
    v_org,v_case_id,v_actor,'opened','{}'::jsonb,
    pg_catalog.jsonb_build_object('case_code',v_case_code,'case_type',v_type,'priority',v_priority,'status','open'),
    v_description
  );

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(
    v_org,v_actor,'customer_service_case.opened','customer_service_case',v_case_id,
    pg_catalog.jsonb_build_object('case_code',v_case_code,'customer_id',v_customer_id,'case_type',v_type,'priority',v_priority,'task_id',v_task_id,'channel',CASE WHEN v_is_staff THEN 'staff' ELSE 'customer' END)
  );

  IF NOT v_is_staff THEN
    INSERT INTO public.notifications(organization_id,profile_id,title,body,type,is_read)
    SELECT DISTINCT v_org,p.id,
      'حالة خدمة عملاء جديدة: '||v_case_code,
      'سجّل العميل حالة "'||pg_catalog.left(v_subject,120)||'" وتحتاج إلى المتابعة.',
      'info',false
    FROM public.profiles p
    JOIN public.user_roles r ON r.profile_id=p.id
    WHERE p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL
      AND r.role IN ('admin','manager');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_case_id,'case_code',v_case_code,'task_id',v_task_id,'replayed',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.create_customer_service_case(uuid,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_customer_service_case(uuid,text,text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_customer_service_cases(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_customer uuid:=public.current_customer_id();
  v_limit integer:=greatest(1,least(coalesce(p_limit,50),100));
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR public.is_staff()
     OR NOT public.current_customer_can('service.cases.read')
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     )
     OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role='customer') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer membership with case-read permission is required';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id',cs.id,'case_code',cs.case_code,'case_type',cs.case_type,
      'subject',cs.subject,'description',cs.description,'priority',cs.priority,
      'status',cs.status,'created_at',cs.created_at,'updated_at',cs.updated_at,
      'response_due_at',cs.response_due_at,'resolution_due_at',cs.resolution_due_at,
      'first_response_at',cs.first_response_at,'resolved_at',cs.resolved_at,'closed_at',cs.closed_at,
      'messages',(
        SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'id',message_row.id,'message',message_row.message,'author_side',message_row.author_side,
          'author_name',coalesce(nullif(pg_catalog.btrim(author.full_name),''),CASE WHEN message_row.author_side='staff' THEN 'فريق الأغبري' ELSE 'عضو الشركة' END),
          'created_at',message_row.created_at
        ) ORDER BY message_row.created_at,message_row.id),'[]'::jsonb)
        FROM (
          SELECT m.id,m.message,m.author_side,m.author_profile_id,m.created_at
          FROM public.customer_service_case_messages m
          WHERE m.organization_id=v_org AND m.case_id=cs.id AND m.customer_id=v_customer
          ORDER BY m.created_at DESC,m.id DESC LIMIT 50
        ) message_row
        LEFT JOIN public.profiles author ON author.id=message_row.author_profile_id
      )
    ) ORDER BY cs.created_at DESC,cs.id DESC
  ),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT c.* FROM public.customer_service_cases c
    WHERE c.organization_id=v_org AND c.customer_id=v_customer
    ORDER BY c.created_at DESC,c.id DESC LIMIT v_limit
  ) cs;

  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_my_customer_service_cases(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_my_customer_service_cases(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_my_customer_service_case_message(p_case_id uuid,p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_customer uuid:=public.current_customer_id();
  v_message text:=pg_catalog.btrim(coalesce(p_message,''));
  v_case public.customer_service_cases%ROWTYPE;
  v_message_id uuid;
  v_new_status text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR public.is_staff()
     OR NOT public.current_customer_can('service.cases.reply')
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     )
     OR NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_actor AND r.role='customer') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active customer buyer permission is required to reply to a case';
  END IF;
  IF p_case_id IS NULL OR v_message='' OR pg_catalog.length(v_message)>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='case message must contain between 1 and 2000 characters';
  END IF;

  -- Serialize against company/member revocation, then re-check the active customer context.
  PERFORM 1 FROM public.customers c
   WHERE c.id=v_customer AND c.organization_id=v_org AND c.status='approved'
   FOR KEY SHARE;
  IF NOT FOUND OR public.current_customer_id() IS DISTINCT FROM v_customer THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer company membership is no longer active';
  END IF;

  SELECT cs.* INTO v_case FROM public.customer_service_cases cs
   WHERE cs.id=p_case_id AND cs.organization_id=v_org AND cs.customer_id=v_customer
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='case is unavailable for the active customer company';
  END IF;
  IF v_case.status IN ('resolved','closed') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='completed case cannot receive replies; open a new service case';
  END IF;

  INSERT INTO public.customer_service_case_messages(
    organization_id,case_id,customer_id,author_profile_id,author_side,message
  )
  VALUES(v_org,v_case.id,v_customer,v_actor,'customer',v_message)
  RETURNING id INTO v_message_id;

  v_new_status:=CASE WHEN v_case.status='waiting_customer' THEN 'in_progress' ELSE v_case.status END;
  UPDATE public.customer_service_cases
     SET status=v_new_status,updated_at=now()
   WHERE id=v_case.id AND organization_id=v_org;

  INSERT INTO public.customer_service_case_events(
    organization_id,case_id,actor_id,event_type,old_value,new_value,note
  )
  VALUES(
    v_org,v_case.id,v_actor,'customer_message_received',
    pg_catalog.jsonb_build_object('status',v_case.status),
    pg_catalog.jsonb_build_object('status',v_new_status,'message_id',v_message_id),
    NULL
  );

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(
    v_org,v_actor,'customer_service_case.customer_reply','customer_service_case',v_case.id,
    pg_catalog.jsonb_build_object('status',v_case.status),
    pg_catalog.jsonb_build_object('status',v_new_status,'message_id',v_message_id)
  );

  INSERT INTO public.notifications(organization_id,profile_id,title,body,type,is_read)
  SELECT DISTINCT v_org,p.id,
    'رد عميل على الحالة: '||v_case.case_code,
    'أضاف العميل ردًا جديدًا على الحالة "'||pg_catalog.left(v_case.subject,120)||'".',
    'info',false
  FROM public.profiles p
  JOIN public.user_roles r ON r.profile_id=p.id
  LEFT JOIN LATERAL (
    SELECT t.assigned_to FROM public.ai_tasks t
    WHERE t.organization_id=v_org AND t.source_event_key='customer-service-case:'||v_case.id::text
    ORDER BY t.created_at DESC,t.id DESC LIMIT 1
  ) task ON true
  WHERE p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL
    AND (p.id=task.assigned_to OR r.role IN ('admin','manager'));

  RETURN pg_catalog.jsonb_build_object(
    'id',v_message_id,'case_id',v_case.id,'case_code',v_case.case_code,
    'status',v_new_status,'created_at',now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.add_my_customer_service_case_message(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_my_customer_service_case_message(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_service_case_messages(p_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff permission is required to read case correspondence';
  END IF;
  IF p_case_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.customer_service_cases c
     WHERE c.id=p_case_id AND c.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer case is unavailable for the active organization';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',m.id,'message',m.message,'author_side',m.author_side,
    'author_name',coalesce(nullif(pg_catalog.btrim(p.full_name),''),CASE WHEN m.author_side='staff' THEN 'فريق الأغبري' ELSE 'عميل' END),
    'created_at',m.created_at
  ) ORDER BY m.created_at,m.id),'[]'::jsonb)
  INTO v_result
  FROM (
    SELECT x.* FROM public.customer_service_case_messages x
    WHERE x.organization_id=v_org AND x.case_id=p_case_id
    ORDER BY x.created_at DESC,x.id DESC LIMIT 100
  ) m
  LEFT JOIN public.profiles p ON p.id=m.author_profile_id;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_customer_service_case_messages(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_service_case_messages(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.add_customer_service_case_staff_message(p_case_id uuid,p_message text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_message text:=pg_catalog.btrim(coalesce(p_message,''));
  v_case public.customer_service_cases%ROWTYPE;
  v_message_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
          AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active same-organization staff permission is required to reply to a customer';
  END IF;
  IF p_case_id IS NULL OR v_message='' OR pg_catalog.length(v_message)>2000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer reply must contain between 1 and 2000 characters';
  END IF;

  SELECT cs.* INTO v_case FROM public.customer_service_cases cs
   WHERE cs.id=p_case_id AND cs.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer case is unavailable for the active organization';
  END IF;
  IF v_case.status IN ('resolved','closed') THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='completed case cannot receive a staff reply';
  END IF;

  INSERT INTO public.customer_service_case_messages(
    organization_id,case_id,customer_id,author_profile_id,author_side,message
  )
  VALUES(v_org,v_case.id,v_case.customer_id,v_actor,'staff',v_message)
  RETURNING id INTO v_message_id;

  UPDATE public.customer_service_cases
     SET status='waiting_customer',updated_at=now()
   WHERE id=v_case.id AND organization_id=v_org;

  INSERT INTO public.customer_service_case_events(
    organization_id,case_id,actor_id,event_type,old_value,new_value,note
  )
  VALUES(
    v_org,v_case.id,v_actor,'staff_reply_sent',
    pg_catalog.jsonb_build_object('status',v_case.status),
    pg_catalog.jsonb_build_object('status','waiting_customer','message_id',v_message_id),
    NULL
  );

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(
    v_org,v_actor,'customer_service_case.staff_reply','customer_service_case',v_case.id,
    pg_catalog.jsonb_build_object('status',v_case.status),
    pg_catalog.jsonb_build_object('status','waiting_customer','message_id',v_message_id)
  );

  INSERT INTO public.notifications(organization_id,profile_id,title,body,type,is_read)
  SELECT DISTINCT v_org,p.id,
    'رد فريق الأغبري على الحالة: '||v_case.case_code,
    'أضاف فريق الأغبري ردًا جديدًا على الحالة "'||pg_catalog.left(v_case.subject,120)||'". افتح مركز خدمة العملاء لقراءة الرد.',
    'info',false
  FROM public.profiles p
  JOIN public.user_roles r ON r.profile_id=p.id
  LEFT JOIN public.customer_company_memberships m
    ON m.profile_id=p.id AND m.customer_id=v_case.customer_id
   AND m.organization_id=v_org AND m.status='active'
  WHERE p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL
    AND r.role='customer'
    AND (p.id=(SELECT c.profile_id FROM public.customers c WHERE c.id=v_case.customer_id AND c.organization_id=v_org)
         OR m.id IS NOT NULL);

  RETURN pg_catalog.jsonb_build_object(
    'id',v_message_id,'case_id',v_case.id,'case_code',v_case.case_code,
    'status','waiting_customer','created_at',now()
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.add_customer_service_case_staff_message(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.add_customer_service_case_staff_message(uuid,text) TO authenticated;

COMMENT ON TABLE public.customer_service_case_messages IS
  'Customer-visible, append-only correspondence only. Internal manager notes, events, assignment, escalation and finance metadata remain in separate staff-only records.';
COMMENT ON FUNCTION public.get_my_customer_service_cases(integer) IS
  'Returns only the authenticated customer company own service cases and public correspondence. Internal notes, staff timeline, assignee and escalation data are excluded.';
