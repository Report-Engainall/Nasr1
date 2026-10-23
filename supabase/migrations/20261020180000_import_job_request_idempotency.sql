-- Request/attempt-scoped idempotency for import job creation.
-- File hash remains business identity; a fresh request_key is required for an
-- intentional replace, merge, or new_version operation.

CREATE TABLE IF NOT EXISTS public.import_job_request_keys (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  request_payload jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(request_payload) = 'object'),
  import_job_id uuid REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  PRIMARY KEY (organization_id, actor_profile_id, request_key),
  UNIQUE (import_job_id)
);

ALTER TABLE public.import_job_request_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.import_job_request_keys FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.create_import_job_idempotent(
  p_request_key uuid,
  p_file_name text,
  p_file_hash text,
  p_file_size bigint,
  p_job_type text,
  p_profile_id uuid DEFAULT NULL,
  p_period_key text DEFAULT NULL,
  p_source_system text DEFAULT 'manual',
  p_intent text DEFAULT 'new_version'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_payload jsonb;
  v_claimed_key uuid;
  v_existing public.import_job_request_keys%ROWTYPE;
  v_job jsonb;
  v_job_id uuid;
  v_period_key text := NULLIF(pg_catalog.left(COALESCE(p_period_key, ''), 120), '');
  v_source_system text := pg_catalog.left(COALESCE(NULLIF(p_source_system, ''), 'manual'), 80);
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'إذن استيراد البيانات مطلوب';
  END IF;
  IF p_request_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'مفتاح محاولة الاستيراد مطلوب';
  END IF;
  IF COALESCE(p_intent, '') NOT IN ('replace', 'merge', 'new_version') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'نية استيراد غير صالحة';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles AS p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'المؤسسة المرتبطة بالحساب غير صالحة';
  END IF;

  -- Match the canonical create_import_job normalization contract. The nested RPC
  -- remains the single owner of profile validation/defaulting and job creation.
  v_payload := pg_catalog.jsonb_build_object(
    'file_name', p_file_name,
    'file_hash', p_file_hash,
    'file_size', p_file_size,
    'job_type', p_job_type,
    'requested_profile_id', p_profile_id,
    'period_key', v_period_key,
    'source_system', v_source_system,
    'intent', p_intent
  );

  INSERT INTO public.import_job_request_keys (
    organization_id, actor_profile_id, request_key, request_payload
  )
  VALUES (v_org, v_actor, p_request_key, v_payload)
  ON CONFLICT (organization_id, actor_profile_id, request_key) DO NOTHING
  RETURNING request_key INTO v_claimed_key;

  IF v_claimed_key IS NULL THEN
    -- A concurrent insert for the same scoped key waits on the unique constraint;
    -- after it commits, lock/read the completed claim and return its original job.
    SELECT k.* INTO v_existing
      FROM public.import_job_request_keys AS k
     WHERE k.organization_id = v_org
       AND k.actor_profile_id = v_actor
       AND k.request_key = p_request_key
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '40001',
        MESSAGE = 'تعذر حسم مفتاح محاولة الاستيراد؛ أعد المحاولة بالمفتاح نفسه';
    END IF;
    IF v_existing.request_payload IS DISTINCT FROM v_payload THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'مفتاح محاولة الاستيراد مستخدم لعملية أو حمولة مختلفة';
    END IF;
    IF v_existing.import_job_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001',
        MESSAGE = 'محاولة الاستيراد لم تكتمل؛ أعد المحاولة بالمفتاح نفسه';
    END IF;
    SELECT pg_catalog.to_jsonb(j) INTO v_job
      FROM public.import_jobs AS j
     WHERE j.id = v_existing.import_job_id
       AND j.organization_id = v_org
       AND j.created_by = v_actor;
    IF v_job IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '40001',
        MESSAGE = 'تعذر استرجاع دفعة الاستيراد المرتبطة بمفتاح المحاولة';
    END IF;
    RETURN v_job;
  END IF;

  -- This call creates the job and resolves the current import profile atomically
  -- inside the same transaction as the request-key claim.
  v_job := public.create_import_job(
    p_file_name,
    p_file_hash,
    p_file_size,
    p_job_type,
    p_profile_id,
    v_period_key,
    v_source_system
  );
  v_job_id := (v_job ->> 'id')::uuid;
  IF v_job_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001',
      MESSAGE = 'تعذر إنشاء دفعة الاستيراد';
  END IF;

  UPDATE public.import_job_request_keys
     SET import_job_id = v_job_id
   WHERE organization_id = v_org
     AND actor_profile_id = v_actor
     AND request_key = p_request_key
     AND request_payload = v_payload
     AND import_job_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'تعذر تثبيت دفعة الاستيراد لمفتاح المحاولة';
  END IF;

  RETURN v_job;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_import_job_idempotent(uuid,text,text,bigint,text,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_import_job_idempotent(uuid,text,text,bigint,text,uuid,text,text,text) TO authenticated;

COMMENT ON TABLE public.import_job_request_keys IS
  'Private organization/profile-scoped request idempotency for import-job creation. File identity and deliberate duplicate-action intent remain separate.';
COMMENT ON FUNCTION public.create_import_job_idempotent(uuid,text,text,bigint,text,uuid,text,text,text) IS
  'Atomically claims an actor-scoped request key, delegates canonical job creation, and replays the same job for identical retries.';
