-- Target-native asynchronous order CSV export jobs.
-- Raw donor import_storage.sql is intentionally not copied: it lacks the lifecycle and security boundaries.
CREATE TABLE public.async_export_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  export_type text NOT NULL CHECK (export_type = 'orders_csv'),
  filters jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(filters) = 'object'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 120),
  request_hash text NOT NULL CHECK (request_hash ~ '^[0-9a-f]{32}$'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','processing','retry','ready','failed','cancelled','expired')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 5),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_owner text,
  lease_expires_at timestamptz,
  artifact_path text,
  file_name text,
  content_type text,
  byte_size bigint CHECK (byte_size IS NULL OR byte_size BETWEEN 0 AND 26214400),
  sha256 text CHECK (sha256 IS NULL OR sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer CHECK (row_count IS NULL OR row_count BETWEEN 0 AND 10000),
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  UNIQUE (organization_id, requested_by, idempotency_key),
  CHECK (
    (status = 'processing' AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR
    (status <> 'processing' AND lease_owner IS NULL AND lease_expires_at IS NULL)
  ),
  CHECK (
    (status = 'ready' AND artifact_path IS NOT NULL AND file_name IS NOT NULL
      AND content_type = 'text/csv' AND byte_size IS NOT NULL AND sha256 IS NOT NULL
      AND row_count IS NOT NULL AND expires_at IS NOT NULL)
    OR status <> 'ready'
  )
);

CREATE INDEX async_export_jobs_claim_idx
  ON public.async_export_jobs(status, next_attempt_at, created_at, id)
  WHERE status IN ('queued','retry');
CREATE INDEX async_export_jobs_stale_lease_idx
  ON public.async_export_jobs(lease_expires_at, created_at)
  WHERE status = 'processing';
CREATE INDEX async_export_jobs_owner_idx
  ON public.async_export_jobs(organization_id, requested_by, created_at DESC);

ALTER TABLE public.async_export_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.async_export_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.async_export_jobs TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('async-export-artifacts', 'async-export-artifacts', false, 26214400, ARRAY['text/csv']::text[])
ON CONFLICT (id) DO UPDATE
  SET public = false, file_size_limit = 26214400, allowed_mime_types = ARRAY['text/csv']::text[];

CREATE OR REPLACE FUNCTION public.request_async_export_job(
  p_export_type text,
  p_filters jsonb,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_from date;
  v_to date;
  v_filters jsonb;
  v_hash text;
  v_job public.async_export_jobs%ROWTYPE;
  v_role_allowed boolean;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated staff required for async exports';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active tenant profile required for async exports';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','accountant')
  ) INTO v_role_allowed;
  IF NOT v_role_allowed THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='admin, manager or accountant role required for order exports';
  END IF;
  IF p_export_type IS DISTINCT FROM 'orders_csv' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unsupported asynchronous export type';
  END IF;
  IF p_filters IS NULL OR pg_catalog.jsonb_typeof(p_filters) <> 'object'
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_object_keys(p_filters) AS filter_key(key)
        WHERE filter_key.key NOT IN ('date_from','date_to')
     )
     OR pg_catalog.jsonb_typeof(p_filters->'date_from') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_filters->'date_to') IS DISTINCT FROM 'string'
     OR coalesce(p_filters->>'date_from','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     OR coalesce(p_filters->>'date_to','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='order export requires exactly date_from and date_to in YYYY-MM-DD format';
  END IF;
  v_from := (p_filters->>'date_from')::date;
  v_to := (p_filters->>'date_to')::date;
  IF v_to < v_from OR v_to - v_from > 365 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='order export date range must be ordered and no longer than 366 calendar days';
  END IF;
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 120
     OR p_idempotency_key !~ '^[A-Za-z0-9:_-]+$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='valid idempotency key required for export request';
  END IF;

  v_filters := pg_catalog.jsonb_build_object('date_from',v_from::text,'date_to',v_to::text);
  v_hash := pg_catalog.md5('orders_csv|' || v_filters::text);

  SELECT * INTO v_job
    FROM public.async_export_jobs j
   WHERE j.organization_id=v_org AND j.requested_by=v_actor
     AND j.idempotency_key=p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_job.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='idempotency key reused with different export filters';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'job_id',v_job.id,'status',v_job.status,'already_requested',true,
      'created_at',v_job.created_at
    );
  END IF;

  INSERT INTO public.async_export_jobs(
    organization_id,requested_by,export_type,filters,idempotency_key,request_hash
  ) VALUES (v_org,v_actor,p_export_type,v_filters,p_idempotency_key,v_hash)
  ON CONFLICT (organization_id,requested_by,idempotency_key) DO NOTHING
  RETURNING * INTO v_job;

  IF NOT FOUND THEN
    SELECT * INTO v_job
      FROM public.async_export_jobs j
     WHERE j.organization_id=v_org AND j.requested_by=v_actor
       AND j.idempotency_key=p_idempotency_key
     FOR UPDATE;
    IF v_job.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION USING ERRCODE='23505', MESSAGE='idempotency key reused with different export filters';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'job_id',v_job.id,'status',v_job.status,'already_requested',true,
      'created_at',v_job.created_at
    );
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  ) VALUES (
    v_org,v_actor,'async_export.queued','async_export_job',v_job.id,NULL,
    pg_catalog.jsonb_build_object('export_type',v_job.export_type,'date_from',v_from,'date_to',v_to),
    pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'job_id',v_job.id,'status',v_job.status,'already_requested',false,
    'created_at',v_job.created_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_my_async_export_jobs(p_limit integer DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_allowed boolean;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated staff required for export history';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','accountant')
  ) INTO v_allowed;
  IF v_org IS NULL OR NOT v_allowed THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='export history permission denied';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='export history limit must be between 1 and 50';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'job_id',q.id,'export_type',q.export_type,'status',q.status,
      'row_count',q.row_count,'file_name',q.file_name,'byte_size',q.byte_size,
      'error_code',q.error_code,'error_message',q.error_message,
      'created_at',q.created_at,'completed_at',q.completed_at,'expires_at',q.expires_at
    ) ORDER BY q.created_at DESC,q.id
  ),'[]'::jsonb)
    INTO v_result
    FROM (
      SELECT j.* FROM public.async_export_jobs j
       WHERE j.organization_id=v_org AND j.requested_by=v_actor
       ORDER BY j.created_at DESC,j.id LIMIT p_limit
    ) q;
  RETURN v_result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_async_export_download(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_allowed boolean;
  v_job public.async_export_jobs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR p_job_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='export download permission denied';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','accountant')
  ) INTO v_allowed;
  IF v_org IS NULL OR NOT v_allowed THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='export download permission denied';
  END IF;

  SELECT j.* INTO v_job
    FROM public.async_export_jobs j
   WHERE j.id=p_job_id AND j.organization_id=v_org AND j.requested_by=v_actor
     AND j.status='ready' AND j.expires_at > pg_catalog.now()
     AND j.artifact_path IS NOT NULL
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'job_id',v_job.id,'artifact_path',v_job.artifact_path,
    'file_name',v_job.file_name,'content_type',v_job.content_type,
    'expires_at',v_job.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_my_async_export_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_allowed boolean;
  v_job public.async_export_jobs%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR p_job_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='export cancellation permission denied';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','accountant')
  ) INTO v_allowed;
  IF v_org IS NULL OR NOT v_allowed THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='export cancellation permission denied';
  END IF;

  UPDATE public.async_export_jobs j
     SET status='cancelled',updated_at=pg_catalog.now(),
         error_code=NULL,error_message=NULL
   WHERE j.id=p_job_id AND j.organization_id=v_org AND j.requested_by=v_actor
     AND j.status IN ('queued','retry')
  RETURNING * INTO v_job;
  IF FOUND THEN
    INSERT INTO public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
    ) VALUES (
      v_org,v_actor,'async_export.cancelled','async_export_job',v_job.id,
      pg_catalog.jsonb_build_object('status','queued'),
      pg_catalog.jsonb_build_object('status','cancelled'),pg_catalog.now()
    );
    RETURN pg_catalog.jsonb_build_object('job_id',v_job.id,'status',v_job.status,'cancelled',true);
  END IF;

  SELECT j.* INTO v_job
    FROM public.async_export_jobs j
   WHERE j.id=p_job_id AND j.organization_id=v_org AND j.requested_by=v_actor;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='export job not found';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'job_id',v_job.id,'status',v_job.status,'cancelled',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_my_async_export_job(p_job_id uuid,p_worker text)
RETURNS SETOF public.async_export_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_allowed boolean;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR p_job_id IS NULL
     OR coalesce(length(btrim(p_worker)),0) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='export worker claim denied';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.profile_id=v_actor AND r.role IN ('admin','manager','accountant')
  ) INTO v_allowed;
  IF v_org IS NULL OR NOT v_allowed THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='export worker claim denied';
  END IF;

  UPDATE public.async_export_jobs j
     SET status=CASE WHEN j.attempt_count>=5 THEN 'failed' ELSE 'retry' END,
         lease_owner=NULL,lease_expires_at=NULL,
         next_attempt_at=CASE WHEN j.attempt_count>=5 THEN j.next_attempt_at ELSE pg_catalog.now() END,
         error_code=CASE WHEN j.attempt_count>=5 THEN 'MAX_ATTEMPTS' ELSE 'WORKER_LEASE_EXPIRED' END,
         error_message=CASE WHEN j.attempt_count>=5 THEN 'Export failed after retry limit' ELSE 'Worker lease expired; retry queued' END,
         updated_at=pg_catalog.now()
   WHERE j.id=p_job_id AND j.organization_id=v_org AND j.requested_by=v_actor
     AND j.status='processing' AND j.lease_expires_at<=pg_catalog.now();

  RETURN QUERY
  UPDATE public.async_export_jobs j
     SET status='processing',attempt_count=j.attempt_count+1,
         lease_owner=p_worker,
         lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>300),
         started_at=coalesce(j.started_at,pg_catalog.now()),
         error_code=NULL,error_message=NULL,updated_at=pg_catalog.now()
   WHERE j.id=p_job_id AND j.organization_id=v_org AND j.requested_by=v_actor
     AND j.status IN ('queued','retry') AND j.next_attempt_at<=pg_catalog.now()
     AND j.attempt_count<5
  RETURNING j.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_async_export_jobs(
  p_worker text,p_limit integer DEFAULT 1,p_lease_seconds integer DEFAULT 300,p_job_id uuid DEFAULT NULL
)
RETURNS SETOF public.async_export_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(pg_catalog.current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='async export queue requires trusted worker';
  END IF;
  IF coalesce(length(btrim(p_worker)),0) NOT BETWEEN 1 AND 120
     OR p_limit IS NULL OR p_limit < 1 OR p_limit > 10
     OR p_lease_seconds IS NULL OR p_lease_seconds < 30 OR p_lease_seconds > 900 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid async export worker lease or batch size';
  END IF;

  UPDATE public.async_export_jobs j
     SET status=CASE WHEN j.attempt_count>=5 THEN 'failed' ELSE 'retry' END,
         lease_owner=NULL,lease_expires_at=NULL,
         next_attempt_at=CASE WHEN j.attempt_count>=5 THEN j.next_attempt_at ELSE pg_catalog.now() END,
         error_code=CASE WHEN j.attempt_count>=5 THEN 'MAX_ATTEMPTS' ELSE 'WORKER_LEASE_EXPIRED' END,
         error_message=CASE WHEN j.attempt_count>=5 THEN 'Export failed after retry limit' ELSE 'Worker lease expired; retry queued' END,
         updated_at=pg_catalog.now()
   WHERE j.status='processing' AND j.lease_expires_at<=pg_catalog.now()
     AND (p_job_id IS NULL OR j.id=p_job_id);

  RETURN QUERY
  WITH picked AS (
    SELECT j.id FROM public.async_export_jobs j
     WHERE j.status IN ('queued','retry') AND j.next_attempt_at<=pg_catalog.now()
       AND j.attempt_count<5 AND (p_job_id IS NULL OR j.id=p_job_id)
     ORDER BY j.next_attempt_at,j.created_at,j.id
     FOR UPDATE SKIP LOCKED LIMIT p_limit
  )
  UPDATE public.async_export_jobs j
     SET status='processing',attempt_count=j.attempt_count+1,
         lease_owner=p_worker,
         lease_expires_at=pg_catalog.now()+pg_catalog.make_interval(secs=>p_lease_seconds),
         started_at=coalesce(j.started_at,pg_catalog.now()),
         error_code=NULL,error_message=NULL,updated_at=pg_catalog.now()
    FROM picked WHERE j.id=picked.id
  RETURNING j.*;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_async_export_job(
  p_job_id uuid,p_worker text,p_object_path text,p_file_name text,
  p_content_type text,p_byte_size bigint,p_sha256 text,p_row_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job public.async_export_jobs%ROWTYPE;
BEGIN
  IF coalesce(pg_catalog.current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='async export completion requires trusted worker';
  END IF;
  IF p_job_id IS NULL OR coalesce(length(btrim(p_worker)),0) NOT BETWEEN 1 AND 120
     OR p_file_name IS DISTINCT FROM 'orders.csv'
     OR p_content_type IS DISTINCT FROM 'text/csv'
     OR p_byte_size IS NULL OR p_byte_size < 1 OR p_byte_size > 26214400
     OR p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$'
     OR p_row_count IS NULL OR p_row_count < 1 OR p_row_count > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid asynchronous export artifact metadata';
  END IF;

  SELECT j.* INTO v_job
    FROM public.async_export_jobs j
   WHERE j.id=p_job_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='async export job not found';
  END IF;
  IF v_job.status<>'processing' OR v_job.lease_owner IS DISTINCT FROM p_worker
     OR v_job.lease_expires_at<=pg_catalog.now() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='async export worker lease mismatch';
  END IF;
  IF p_object_path IS DISTINCT FROM (v_job.organization_id::text || '/' || v_job.id::text || '/orders.csv') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='async export artifact path mismatch';
  END IF;

  UPDATE public.async_export_jobs j
     SET status='ready',artifact_path=p_object_path,file_name=p_file_name,
         content_type=p_content_type,byte_size=p_byte_size,sha256=p_sha256,
         row_count=p_row_count,completed_at=pg_catalog.now(),
         expires_at=pg_catalog.now()+interval '7 days',
         lease_owner=NULL,lease_expires_at=NULL,updated_at=pg_catalog.now(),
         error_code=NULL,error_message=NULL
   WHERE j.id=v_job.id
  RETURNING * INTO v_job;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  ) VALUES (
    v_job.organization_id,v_job.requested_by,'async_export.ready','async_export_job',v_job.id,
    pg_catalog.jsonb_build_object('status','processing'),
    pg_catalog.jsonb_build_object(
      'status','ready','export_type',v_job.export_type,'row_count',v_job.row_count,
      'byte_size',v_job.byte_size,'sha256',v_job.sha256,'expires_at',v_job.expires_at
    ),pg_catalog.now()
  );

  RETURN pg_catalog.jsonb_build_object(
    'job_id',v_job.id,'status',v_job.status,'row_count',v_job.row_count,
    'expires_at',v_job.expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fail_async_export_job(p_job_id uuid,p_worker text,p_error_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job public.async_export_jobs%ROWTYPE;
  v_status text;
  v_message text;
  v_delay integer;
BEGIN
  IF coalesce(pg_catalog.current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='async export failure reporting requires trusted worker';
  END IF;
  IF p_job_id IS NULL OR coalesce(length(btrim(p_worker)),0) NOT BETWEEN 1 AND 120
     OR p_error_code IS NULL OR p_error_code NOT IN (
       'SOURCE_READ_FAILED','TOO_MANY_ORDERS','TOO_MANY_ITEMS','CUSTOMER_SCOPE_FAILED',
       'NO_APPROVED_ORDERS','NO_ORDER_ITEMS','ARTIFACT_TOO_LARGE','ARTIFACT_UPLOAD_FAILED',
       'ARTIFACT_BUILD_FAILED','INVALID_JOB_FILTERS','MAX_ATTEMPTS'
     ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid asynchronous export failure code';
  END IF;
  SELECT j.* INTO v_job FROM public.async_export_jobs j WHERE j.id=p_job_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='async export job not found'; END IF;
  IF v_job.status<>'processing' OR v_job.lease_owner IS DISTINCT FROM p_worker
     OR v_job.lease_expires_at<=pg_catalog.now() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='async export worker lease mismatch';
  END IF;

  IF v_job.attempt_count>=5 THEN
    v_status:='failed'; v_delay:=0;
  ELSE
    v_status:='retry';
    v_delay:=LEAST(3600,15*pg_catalog.power(2,LEAST(GREATEST(v_job.attempt_count-1,0),8))::integer);
  END IF;
  v_message := CASE p_error_code
    WHEN 'TOO_MANY_ORDERS' THEN 'Narrow the date range and try again'
    WHEN 'TOO_MANY_ITEMS' THEN 'Narrow the date range and try again'
    WHEN 'CUSTOMER_SCOPE_FAILED' THEN 'An order customer could not be resolved inside the active organization'
    WHEN 'NO_APPROVED_ORDERS' THEN 'No approved orders matched the requested period'
    WHEN 'NO_ORDER_ITEMS' THEN 'An approved order has no exportable items'
    WHEN 'ARTIFACT_TOO_LARGE' THEN 'The export exceeded the permitted file size'
    WHEN 'ARTIFACT_UPLOAD_FAILED' THEN 'The private export artifact could not be saved'
    WHEN 'ARTIFACT_BUILD_FAILED' THEN 'The export file could not be built'
    WHEN 'INVALID_JOB_FILTERS' THEN 'The saved export filters are invalid'
    WHEN 'MAX_ATTEMPTS' THEN 'The export failed after the retry limit'
    ELSE 'Order data could not be read for this export'
  END;

  UPDATE public.async_export_jobs j
     SET status=v_status,
         next_attempt_at=CASE WHEN v_status='retry'
           THEN pg_catalog.now()+pg_catalog.make_interval(secs=>v_delay) ELSE j.next_attempt_at END,
         error_code=CASE WHEN v_status='failed' THEN 'MAX_ATTEMPTS' ELSE p_error_code END,
         error_message=v_message,
         lease_owner=NULL,lease_expires_at=NULL,updated_at=pg_catalog.now()
   WHERE j.id=v_job.id
  RETURNING * INTO v_job;
  IF v_job.status='failed' THEN
    INSERT INTO public.audit_logs(
      organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
    ) VALUES (
      v_job.organization_id,v_job.requested_by,'async_export.failed','async_export_job',v_job.id,
      pg_catalog.jsonb_build_object('status','processing'),
      pg_catalog.jsonb_build_object('status','failed','error_code',v_job.error_code),pg_catalog.now()
    );
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'job_id',v_job.id,'status',v_job.status,'attempt_count',v_job.attempt_count,
    'next_attempt_at',v_job.next_attempt_at,'error_code',v_job.error_code
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sweep_expired_async_export_jobs(p_limit integer DEFAULT 50)
RETURNS TABLE(job_id uuid, object_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_job public.async_export_jobs%ROWTYPE;
BEGIN
  IF coalesce(pg_catalog.current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='async export expiry sweep requires trusted worker';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='expiry sweep limit must be between 1 and 200';
  END IF;
  FOR v_job IN
    SELECT j.* FROM public.async_export_jobs j
     WHERE (j.status='ready' AND j.expires_at<=pg_catalog.now())
        OR (j.status='expired' AND j.artifact_path IS NOT NULL)
     ORDER BY coalesce(j.expires_at,j.created_at),j.id
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  LOOP
    IF v_job.status='ready' THEN
      UPDATE public.async_export_jobs j
         SET status='expired',updated_at=pg_catalog.now()
       WHERE j.id=v_job.id
       RETURNING * INTO v_job;
    END IF;
    job_id:=v_job.id;
    object_path:=v_job.artifact_path;
    RETURN NEXT;
  END LOOP;
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_expired_async_export_artifact(p_job_id uuid,p_object_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  IF coalesce(pg_catalog.current_setting('request.jwt.claim.role',true),'') <> 'service_role'
     AND session_user NOT IN ('postgres','supabase_admin') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='async export artifact cleanup requires trusted worker';
  END IF;
  UPDATE public.async_export_jobs j
     SET artifact_path=NULL,file_name=NULL,content_type=NULL,byte_size=NULL,sha256=NULL,updated_at=pg_catalog.now()
   WHERE j.id=p_job_id AND j.status='expired' AND j.artifact_path=p_object_path;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.request_async_export_job(text,jsonb,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.list_my_async_export_jobs(integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.get_my_async_export_download(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.cancel_my_async_export_job(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.claim_my_async_export_job(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.claim_async_export_jobs(text,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.complete_async_export_job(uuid,text,text,text,text,bigint,text,integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fail_async_export_job(uuid,text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sweep_expired_async_export_jobs(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.clear_expired_async_export_artifact(uuid,text) FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION public.request_async_export_job(text,jsonb,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_async_export_jobs(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_async_export_download(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_async_export_job(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_my_async_export_job(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_async_export_jobs(text,integer,integer,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_async_export_job(uuid,text,text,text,text,bigint,text,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_async_export_job(uuid,text,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.sweep_expired_async_export_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_expired_async_export_artifact(uuid,text) TO service_role;

COMMENT ON TABLE public.async_export_jobs IS
  'Tenant/actor-scoped asynchronous orders CSV jobs with idempotent requests, leased processing, bounded retry, private artifacts and expiry.';
