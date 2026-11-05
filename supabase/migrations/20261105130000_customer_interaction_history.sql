-- AGH-CUSTOMER-INTERACTION-001
-- Append-only, tenant-scoped customer interaction history for Customer 360.
CREATE TABLE IF NOT EXISTS public.customer_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (pg_catalog.length(idempotency_key) BETWEEN 16 AND 128),
  interaction_type text NOT NULL CHECK (
    interaction_type IN ('call','visit','whatsapp','email','meeting','note','other')
  ),
  subject text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(subject)) BETWEEN 1 AND 200),
  details text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(details)) BETWEEN 1 AND 4000),
  interaction_at timestamptz NOT NULL DEFAULT now(),
  next_follow_up_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_interactions_customer_history_idx
  ON public.customer_interactions(organization_id,customer_id,interaction_at DESC,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS customer_interactions_org_idempotency_uidx
  ON public.customer_interactions(organization_id,idempotency_key);

ALTER TABLE public.customer_interactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_interactions FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.record_customer_interaction(
  p_customer_id uuid,
  p_idempotency_key text,
  p_interaction_type text,
  p_subject text,
  p_details text,
  p_interaction_at timestamptz DEFAULT NULL,
  p_next_follow_up_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_customer_id uuid;
  v_customer_name text;
  v_existing public.customer_interactions%ROWTYPE;
  v_id uuid;
  v_type text:=coalesce(p_interaction_type,'');
  v_subject text:=pg_catalog.btrim(coalesce(p_subject,''));
  v_details text:=pg_catalog.btrim(coalesce(p_details,''));
  v_interaction_at timestamptz:=coalesce(p_interaction_at,pg_catalog.clock_timestamp());
  v_now timestamptz:=pg_catalog.clock_timestamp();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff permission is required to record a customer interaction';
  END IF;

  IF p_customer_id IS NULL
     OR p_idempotency_key IS NULL
     OR p_idempotency_key !~ '^[A-Za-z0-9_-]{16,128}
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='an interaction cannot be recorded with a future occurrence time';
  END IF;

  IF p_next_follow_up_at IS NOT NULL AND p_next_follow_up_at<=v_now THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='next follow-up must be scheduled in the future';
  END IF;

  INSERT INTO public.customer_interactions(
    organization_id,customer_id,recorded_by,idempotency_key,interaction_type,
    subject,details,interaction_at,next_follow_up_at
  )
  VALUES(
    v_org,v_customer_id,v_actor,p_idempotency_key,v_type,v_subject,v_details,
    v_interaction_at,p_next_follow_up_at
  )
  ON CONFLICT (organization_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT i.* INTO v_existing
    FROM public.customer_interactions i
    WHERE i.organization_id=v_org
      AND i.idempotency_key=p_idempotency_key;

    IF NOT FOUND
       OR v_existing.customer_id IS DISTINCT FROM v_customer_id
       OR v_existing.recorded_by IS DISTINCT FROM v_actor
       OR v_existing.interaction_type IS DISTINCT FROM v_type
       OR v_existing.subject IS DISTINCT FROM v_subject
       OR v_existing.details IS DISTINCT FROM v_details
       OR v_existing.next_follow_up_at IS DISTINCT FROM p_next_follow_up_at
       OR (p_interaction_at IS NOT NULL AND v_existing.interaction_at IS DISTINCT FROM v_interaction_at) THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='customer interaction idempotency key was already used with different input';
    END IF;

    -- Replay returns the already-saved row; do not duplicate its task or audit event.
    RETURN v_existing.id;
  END IF;

  -- A scheduled next contact becomes a real sales task in the operational task center.
  IF p_next_follow_up_at IS NOT NULL THEN
    PERFORM public.upsert_operational_task(
      v_org,
      'متابعة العميل: '||coalesce(nullif(pg_catalog.btrim(v_customer_name),''),'عميل'),
      'موعد متابعة ناتج من سجل التواصل: '||v_subject||E'\n'||pg_catalog.left(v_details,1200),
      'sales',
      'medium',
      'customer_follow_up',
      'customer-follow-up:'||v_id::text,
      'customer_interactions',
      v_id,
      p_next_follow_up_at,
      jsonb_build_object(
        'customer_id',v_customer_id,
        'interaction_id',v_id,
        'interaction_type',v_type,
        'subject',v_subject,
        'next_follow_up_at',p_next_follow_up_at
      ),
      false
    );
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  )
  VALUES(
    v_org,v_actor,'customer.interaction_recorded','customer_interaction',v_id,
    jsonb_build_object(
      'customer_id',v_customer_id,
      'interaction_type',v_type,
      'subject',v_subject,
      'interaction_at',v_interaction_at,
      'next_follow_up_at',p_next_follow_up_at
    )
  );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_customer_interaction(uuid,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_interaction(uuid,text,text,text,text,timestamptz,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.record_customer_interaction(uuid,text,text,text,text,timestamptz,timestamptz) IS
  'Append-only staff customer interaction record scoped to the active organization; records actor and audit evidence without changing commercial or financial state.';

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
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff permission is required to read customer interaction history';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.id=p_customer_id AND c.organization_id=v_org;

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
        'recorded_by_name',coalesce(nullif(pg_catalog.btrim(profile.full_name),''),'موظف')
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
    WHERE i.organization_id=v_org AND i.customer_id=v_customer_id
    ORDER BY i.interaction_at DESC,i.created_at DESC,i.id DESC
    LIMIT v_limit
  ) history
  LEFT JOIN public.profiles profile ON profile.id=history.recorded_by;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_interaction_history(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_interaction_history(uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.get_customer_interaction_history(uuid,integer) IS
  'Returns the latest bounded customer interaction history and recorder display names for the active staff organization only.';

     OR v_type NOT IN ('call','visit','whatsapp','email','meeting','note','other')
     OR v_subject='' OR pg_catalog.length(v_subject)>200
     OR v_details='' OR pg_catalog.length(v_details)>4000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer interaction type, subject or details are invalid';
  END IF;

  IF v_interaction_at>v_now+interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='an interaction cannot be recorded with a future occurrence time';
  END IF;

  IF p_next_follow_up_at IS NOT NULL AND p_next_follow_up_at<=v_now THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='next follow-up must be scheduled in the future';
  END IF;

  SELECT c.id,c.business_name INTO v_customer_id,v_customer_name
  FROM public.customers c
  WHERE c.id=p_customer_id AND c.organization_id=v_org
  FOR KEY SHARE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is unavailable for the active organization';
  END IF;

  INSERT INTO public.customer_interactions(
    organization_id,customer_id,recorded_by,interaction_type,
    subject,details,interaction_at,next_follow_up_at
  )
  VALUES(
    v_org,v_customer_id,v_actor,v_type,v_subject,v_details,
    v_interaction_at,p_next_follow_up_at
  )
  RETURNING id INTO v_id;

  -- A scheduled next contact becomes a real sales task in the operational task center.
  IF p_next_follow_up_at IS NOT NULL THEN
    PERFORM public.upsert_operational_task(
      v_org,
      'متابعة العميل: '||coalesce(nullif(pg_catalog.btrim(v_customer_name),''),'عميل'),
      'موعد متابعة ناتج من سجل التواصل: '||v_subject||E'\n'||pg_catalog.left(v_details,1200),
      'sales',
      'medium',
      'customer_follow_up',
      'customer-follow-up:'||v_id::text,
      'customer_interactions',
      v_id,
      p_next_follow_up_at,
      jsonb_build_object(
        'customer_id',v_customer_id,
        'interaction_id',v_id,
        'interaction_type',v_type,
        'subject',v_subject,
        'next_follow_up_at',p_next_follow_up_at
      ),
      false
    );
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  )
  VALUES(
    v_org,v_actor,'customer.interaction_recorded','customer_interaction',v_id,
    jsonb_build_object(
      'customer_id',v_customer_id,
      'interaction_type',v_type,
      'subject',v_subject,
      'interaction_at',v_interaction_at,
      'next_follow_up_at',p_next_follow_up_at
    )
  );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_customer_interaction(uuid,text,text,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_interaction(uuid,text,text,text,timestamptz,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.record_customer_interaction(uuid,text,text,text,timestamptz,timestamptz) IS
  'Append-only staff customer interaction record scoped to the active organization; records actor and audit evidence without changing commercial or financial state.';

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
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff permission is required to read customer interaction history';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.id=p_customer_id AND c.organization_id=v_org;

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
        'recorded_by_name',coalesce(nullif(pg_catalog.btrim(profile.full_name),''),'موظف')
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
    WHERE i.organization_id=v_org AND i.customer_id=v_customer_id
    ORDER BY i.interaction_at DESC,i.created_at DESC,i.id DESC
    LIMIT v_limit
  ) history
  LEFT JOIN public.profiles profile ON profile.id=history.recorded_by;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_interaction_history(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_interaction_history(uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.get_customer_interaction_history(uuid,integer) IS
  'Returns the latest bounded customer interaction history and recorder display names for the active staff organization only.';

     OR v_type NOT IN ('call','visit','whatsapp','email','meeting','note','other')
     OR v_subject=''
     OR pg_catalog.length(v_subject)>200
     OR v_details=''
     OR pg_catalog.length(v_details)>4000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer interaction type, subject or details are invalid';
  END IF;

  SELECT c.id,c.business_name INTO v_customer_id,v_customer_name
  FROM public.customers c
  WHERE c.id=p_customer_id AND c.organization_id=v_org
  FOR KEY SHARE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is unavailable for the active organization';
  END IF;

  -- Resolve a committed replay before validating a follow-up date that may now be in the past.
  SELECT i.* INTO v_existing
  FROM public.customer_interactions i
  WHERE i.organization_id=v_org
    AND i.idempotency_key=p_idempotency_key;

  IF FOUND THEN
    IF v_existing.customer_id IS DISTINCT FROM v_customer_id
       OR v_existing.recorded_by IS DISTINCT FROM v_actor
       OR v_existing.interaction_type IS DISTINCT FROM v_type
       OR v_existing.subject IS DISTINCT FROM v_subject
       OR v_existing.details IS DISTINCT FROM v_details
       OR v_existing.next_follow_up_at IS DISTINCT FROM p_next_follow_up_at
       OR (p_interaction_at IS NOT NULL AND v_existing.interaction_at IS DISTINCT FROM p_interaction_at) THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='customer interaction idempotency key was already used with different input';
    END IF;
    RETURN v_existing.id;
  END IF;

  IF v_interaction_at>v_now+interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='an interaction cannot be recorded with a future occurrence time';
  END IF;

  IF p_next_follow_up_at IS NOT NULL AND p_next_follow_up_at<=v_now THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='next follow-up must be scheduled in the future';
  END IF;

  SELECT c.id,c.business_name INTO v_customer_id,v_customer_name
  FROM public.customers c
  WHERE c.id=p_customer_id AND c.organization_id=v_org
  FOR KEY SHARE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is unavailable for the active organization';
  END IF;

  INSERT INTO public.customer_interactions(
    organization_id,customer_id,recorded_by,idempotency_key,interaction_type,
    subject,details,interaction_at,next_follow_up_at
  )
  VALUES(
    v_org,v_customer_id,v_actor,p_idempotency_key,v_type,v_subject,v_details,
    v_interaction_at,p_next_follow_up_at
  )
  ON CONFLICT (organization_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT i.* INTO v_existing
    FROM public.customer_interactions i
    WHERE i.organization_id=v_org
      AND i.idempotency_key=p_idempotency_key;

    IF NOT FOUND
       OR v_existing.customer_id IS DISTINCT FROM v_customer_id
       OR v_existing.recorded_by IS DISTINCT FROM v_actor
       OR v_existing.interaction_type IS DISTINCT FROM v_type
       OR v_existing.subject IS DISTINCT FROM v_subject
       OR v_existing.details IS DISTINCT FROM v_details
       OR v_existing.next_follow_up_at IS DISTINCT FROM p_next_follow_up_at
       OR (p_interaction_at IS NOT NULL AND v_existing.interaction_at IS DISTINCT FROM v_interaction_at) THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='customer interaction idempotency key was already used with different input';
    END IF;

    -- Replay returns the already-saved row; do not duplicate its task or audit event.
    RETURN v_existing.id;
  END IF;

  -- A scheduled next contact becomes a real sales task in the operational task center.
  IF p_next_follow_up_at IS NOT NULL THEN
    PERFORM public.upsert_operational_task(
      v_org,
      'متابعة العميل: '||coalesce(nullif(pg_catalog.btrim(v_customer_name),''),'عميل'),
      'موعد متابعة ناتج من سجل التواصل: '||v_subject||E'\n'||pg_catalog.left(v_details,1200),
      'sales',
      'medium',
      'customer_follow_up',
      'customer-follow-up:'||v_id::text,
      'customer_interactions',
      v_id,
      p_next_follow_up_at,
      jsonb_build_object(
        'customer_id',v_customer_id,
        'interaction_id',v_id,
        'interaction_type',v_type,
        'subject',v_subject,
        'next_follow_up_at',p_next_follow_up_at
      ),
      false
    );
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  )
  VALUES(
    v_org,v_actor,'customer.interaction_recorded','customer_interaction',v_id,
    jsonb_build_object(
      'customer_id',v_customer_id,
      'interaction_type',v_type,
      'subject',v_subject,
      'interaction_at',v_interaction_at,
      'next_follow_up_at',p_next_follow_up_at
    )
  );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_customer_interaction(uuid,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_interaction(uuid,text,text,text,text,timestamptz,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.record_customer_interaction(uuid,text,text,text,text,timestamptz,timestamptz) IS
  'Append-only staff customer interaction record scoped to the active organization; records actor and audit evidence without changing commercial or financial state.';

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
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff permission is required to read customer interaction history';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.id=p_customer_id AND c.organization_id=v_org;

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
        'recorded_by_name',coalesce(nullif(pg_catalog.btrim(profile.full_name),''),'موظف')
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
    WHERE i.organization_id=v_org AND i.customer_id=v_customer_id
    ORDER BY i.interaction_at DESC,i.created_at DESC,i.id DESC
    LIMIT v_limit
  ) history
  LEFT JOIN public.profiles profile ON profile.id=history.recorded_by;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_interaction_history(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_interaction_history(uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.get_customer_interaction_history(uuid,integer) IS
  'Returns the latest bounded customer interaction history and recorder display names for the active staff organization only.';

     OR v_type NOT IN ('call','visit','whatsapp','email','meeting','note','other')
     OR v_subject='' OR pg_catalog.length(v_subject)>200
     OR v_details='' OR pg_catalog.length(v_details)>4000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='customer interaction type, subject or details are invalid';
  END IF;

  IF v_interaction_at>v_now+interval '5 minutes' THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='an interaction cannot be recorded with a future occurrence time';
  END IF;

  IF p_next_follow_up_at IS NOT NULL AND p_next_follow_up_at<=v_now THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='next follow-up must be scheduled in the future';
  END IF;

  SELECT c.id,c.business_name INTO v_customer_id,v_customer_name
  FROM public.customers c
  WHERE c.id=p_customer_id AND c.organization_id=v_org
  FOR KEY SHARE;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='customer is unavailable for the active organization';
  END IF;

  INSERT INTO public.customer_interactions(
    organization_id,customer_id,recorded_by,interaction_type,
    subject,details,interaction_at,next_follow_up_at
  )
  VALUES(
    v_org,v_customer_id,v_actor,v_type,v_subject,v_details,
    v_interaction_at,p_next_follow_up_at
  )
  RETURNING id INTO v_id;

  -- A scheduled next contact becomes a real sales task in the operational task center.
  IF p_next_follow_up_at IS NOT NULL THEN
    PERFORM public.upsert_operational_task(
      v_org,
      'متابعة العميل: '||coalesce(nullif(pg_catalog.btrim(v_customer_name),''),'عميل'),
      'موعد متابعة ناتج من سجل التواصل: '||v_subject||E'\n'||pg_catalog.left(v_details,1200),
      'sales',
      'medium',
      'customer_follow_up',
      'customer-follow-up:'||v_id::text,
      'customer_interactions',
      v_id,
      p_next_follow_up_at,
      jsonb_build_object(
        'customer_id',v_customer_id,
        'interaction_id',v_id,
        'interaction_type',v_type,
        'subject',v_subject,
        'next_follow_up_at',p_next_follow_up_at
      ),
      false
    );
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  )
  VALUES(
    v_org,v_actor,'customer.interaction_recorded','customer_interaction',v_id,
    jsonb_build_object(
      'customer_id',v_customer_id,
      'interaction_type',v_type,
      'subject',v_subject,
      'interaction_at',v_interaction_at,
      'next_follow_up_at',p_next_follow_up_at
    )
  );

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_customer_interaction(uuid,text,text,text,timestamptz,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_interaction(uuid,text,text,text,timestamptz,timestamptz) TO authenticated;
COMMENT ON FUNCTION public.record_customer_interaction(uuid,text,text,text,timestamptz,timestamptz) IS
  'Append-only staff customer interaction record scoped to the active organization; records actor and audit evidence without changing commercial or financial state.';

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
       SELECT 1 FROM public.profiles p
       WHERE p.id=v_actor AND p.auth_user_id=auth.uid()
         AND p.organization_id=v_org AND p.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active staff permission is required to read customer interaction history';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.id=p_customer_id AND c.organization_id=v_org;

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
        'recorded_by_name',coalesce(nullif(pg_catalog.btrim(profile.full_name),''),'موظف')
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
    WHERE i.organization_id=v_org AND i.customer_id=v_customer_id
    ORDER BY i.interaction_at DESC,i.created_at DESC,i.id DESC
    LIMIT v_limit
  ) history
  LEFT JOIN public.profiles profile ON profile.id=history.recorded_by;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_interaction_history(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_customer_interaction_history(uuid,integer) TO authenticated;
COMMENT ON FUNCTION public.get_customer_interaction_history(uuid,integer) IS
  'Returns the latest bounded customer interaction history and recorder display names for the active staff organization only.';
