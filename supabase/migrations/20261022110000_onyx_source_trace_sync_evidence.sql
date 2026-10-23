-- NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011
-- Additive, tenant-scoped source lineage for order export and server-only Onyx attempt evidence.
-- Preparing an XLSX is not a live sync and cannot create a succeeded attempt.

CREATE TABLE IF NOT EXISTS public.onyx_live_sync_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  operation text NOT NULL CHECK (operation IN ('inventory_pull','order_push')),
  status text NOT NULL CHECK (status IN ('started','succeeded','failed')),
  snapshot_id uuid REFERENCES public.onyx_snapshots(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[0-9a-f]{64}$'),
  response_sha256 text CHECK (response_sha256 IS NULL OR response_sha256 ~ '^[0-9a-f]{64}$'),
  http_status integer CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  external_request_id text,
  error_code text,
  error_summary text,
  started_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT onyx_sync_attempt_scope_check CHECK (
    (operation='inventory_pull' AND order_id IS NULL) OR
    (operation='order_push' AND order_id IS NOT NULL)
  ),
  CONSTRAINT onyx_sync_attempt_result_check CHECK (
    (status='started' AND completed_at IS NULL AND http_status IS NULL AND response_sha256 IS NULL AND error_code IS NULL AND error_summary IS NULL)
    OR
    (status='succeeded' AND completed_at IS NOT NULL AND http_status BETWEEN 200 AND 299 AND response_sha256 ~ '^[0-9a-f]{64}$' AND error_code IS NULL)
    OR
    (status='failed' AND completed_at IS NOT NULL AND error_code IS NOT NULL AND pg_catalog.btrim(error_code) <> '')
  )
);

ALTER TABLE public.onyx_live_sync_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.onyx_live_sync_attempts FROM PUBLIC, anon, authenticated, service_role;
CREATE INDEX IF NOT EXISTS onyx_live_sync_attempt_org_time_idx
  ON public.onyx_live_sync_attempts(organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS onyx_live_sync_attempt_snapshot_time_idx
  ON public.onyx_live_sync_attempts(organization_id, snapshot_id, started_at DESC);
CREATE INDEX IF NOT EXISTS onyx_live_sync_attempt_order_time_idx
  ON public.onyx_live_sync_attempts(organization_id, order_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.record_onyx_live_sync_attempt(
  p_operation text,
  p_status text,
  p_organization_id uuid,
  p_snapshot_id uuid,
  p_order_id uuid,
  p_attempt_id uuid,
  p_request_sha256 text,
  p_http_status integer,
  p_external_request_id text,
  p_response_sha256 text,
  p_error_code text,
  p_error_summary text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_attempt public.onyx_live_sync_attempts%ROWTYPE;
  v_id uuid;
BEGIN
  -- Avoid auth.role(): isolated PostgreSQL acceptance environments may not install that helper.
  -- The active PostgREST role must be service_role, and this RPC is not executable by browser roles.
  IF pg_catalog.current_setting('role', true) IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Onyx provider worker role required';
  END IF;
  IF p_operation NOT IN ('inventory_pull','order_push') OR p_status NOT IN ('started','succeeded','failed') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid Onyx operation or attempt status';
  END IF;
  IF p_organization_id IS NULL OR p_request_sha256 IS NULL OR p_request_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='organization and SHA-256 request fingerprint are required';
  END IF;
  IF (p_operation='inventory_pull' AND p_order_id IS NOT NULL)
     OR (p_operation='order_push' AND p_order_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Onyx operation scope is invalid';
  END IF;
  SELECT o.* INTO v_org FROM public.organizations o WHERE o.id=p_organization_id AND o.is_active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active Onyx organization is unavailable';
  END IF;
  IF p_snapshot_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.onyx_snapshots s
    WHERE s.id=p_snapshot_id AND s.organization_id=p_organization_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Onyx snapshot is unavailable in the requested organization';
  END IF;
  IF p_order_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id=p_order_id AND o.organization_id=p_organization_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Onyx order is unavailable in the requested organization';
  END IF;
  IF p_http_status IS NOT NULL AND p_http_status NOT BETWEEN 100 AND 599 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid provider HTTP status';
  END IF;
  IF p_external_request_id IS NOT NULL AND pg_catalog.char_length(p_external_request_id)>256 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='provider request identifier is too long';
  END IF;
  IF p_error_code IS NOT NULL AND pg_catalog.char_length(p_error_code)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='provider error code is too long';
  END IF;
  IF p_error_summary IS NOT NULL AND pg_catalog.char_length(p_error_summary)>512 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='provider error summary is too long';
  END IF;

  IF p_status='started' THEN
    IF p_attempt_id IS NOT NULL OR p_http_status IS NOT NULL OR p_response_sha256 IS NOT NULL
       OR p_error_code IS NOT NULL OR p_error_summary IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a new Onyx attempt must start without a result';
    END IF;
    INSERT INTO public.onyx_live_sync_attempts(
      organization_id,operation,status,snapshot_id,order_id,request_sha256,external_request_id
    ) VALUES (
      p_organization_id,p_operation,'started',p_snapshot_id,p_order_id,p_request_sha256,p_external_request_id
    ) RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  IF p_attempt_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='attempt id is required to finalize an Onyx attempt';
  END IF;
  SELECT a.* INTO v_attempt FROM public.onyx_live_sync_attempts a
  WHERE a.id=p_attempt_id AND a.organization_id=p_organization_id
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.operation<>p_operation THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Onyx attempt is unavailable in the requested organization';
  END IF;
  -- The request fingerprint is immutable provenance, not a caller-controlled finalization field.
  IF v_attempt.request_sha256 IS DISTINCT FROM p_request_sha256 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Onyx request fingerprint does not match the persisted attempt';
  END IF;
  -- A selected snapshot can never be silently reassigned. Inventory pulls may bind their
  -- resulting snapshot exactly once when the attempt began without one; order pushes may not.
  IF v_attempt.snapshot_id IS NOT NULL
     AND p_snapshot_id IS NOT NULL
     AND v_attempt.snapshot_id IS DISTINCT FROM p_snapshot_id THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Onyx attempt snapshot is already bound to a different snapshot';
  END IF;
  IF v_attempt.snapshot_id IS NULL
     AND p_snapshot_id IS NOT NULL
     AND p_operation <> 'inventory_pull' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only an inventory pull may bind its resulting snapshot during finalization';
  END IF;
  IF p_status='succeeded' AND (
    p_http_status IS NULL OR p_http_status NOT BETWEEN 200 AND 299
    OR p_response_sha256 IS NULL OR p_response_sha256 !~ '^[0-9a-f]{64}$'
    OR p_error_code IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a successful attempt requires a 2xx response and a response SHA-256';
  END IF;
  IF p_status='failed' AND (p_error_code IS NULL OR pg_catalog.btrim(p_error_code)='') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='a failed attempt requires a stable error code';
  END IF;

  -- Idempotent finalization: an identical retry returns the same record; a changed result is rejected.
  IF v_attempt.status<>'started' THEN
    IF v_attempt.status=p_status
       AND v_attempt.snapshot_id IS NOT DISTINCT FROM coalesce(p_snapshot_id,v_attempt.snapshot_id)
       AND v_attempt.http_status IS NOT DISTINCT FROM p_http_status
       AND v_attempt.external_request_id IS NOT DISTINCT FROM coalesce(p_external_request_id,v_attempt.external_request_id)
       AND v_attempt.response_sha256 IS NOT DISTINCT FROM p_response_sha256
       AND v_attempt.error_code IS NOT DISTINCT FROM p_error_code
       AND v_attempt.error_summary IS NOT DISTINCT FROM p_error_summary THEN
      RETURN v_attempt.id;
    END IF;
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='Onyx attempt is already finalized with a different result';
  END IF;

  UPDATE public.onyx_live_sync_attempts
  SET status=p_status,
      snapshot_id=coalesce(p_snapshot_id,snapshot_id),
      http_status=p_http_status,
      external_request_id=coalesce(p_external_request_id,external_request_id),
      response_sha256=p_response_sha256,
      error_code=p_error_code,
      error_summary=CASE WHEN p_error_summary IS NULL THEN NULL ELSE pg_catalog.left(p_error_summary,512) END,
      completed_at=pg_catalog.clock_timestamp()
  WHERE id=v_attempt.id AND organization_id=p_organization_id AND status='started';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='Onyx attempt finalization lost its state lock';
  END IF;
  RETURN v_attempt.id;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_onyx_live_sync_attempt(text,text,uuid,uuid,uuid,uuid,text,integer,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_onyx_live_sync_attempt(text,text,uuid,uuid,uuid,uuid,text,integer,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_onyx_live_sync_attempt_evidence(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_snapshot public.onyx_snapshots%ROWTYPE;
  v_last jsonb;
  v_latest_success jsonb;
  v_snapshot_success jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required to read Onyx sync evidence';
  END IF;
  SELECT s.* INTO v_snapshot
  FROM public.onyx_snapshots s
  WHERE s.id=p_snapshot_id AND s.organization_id=v_org AND s.status='ready';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ready Onyx snapshot is unavailable in the current organization';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id',a.id,'organization_id',a.organization_id,'operation',a.operation,'status',a.status,
    'snapshot_id',a.snapshot_id,'order_id',a.order_id,'request_sha256',a.request_sha256,
    'response_sha256',a.response_sha256,'http_status',a.http_status,
    'external_request_id',a.external_request_id,'error_code',a.error_code,'error_summary',a.error_summary,
    'started_at',a.started_at,'completed_at',a.completed_at
  ) INTO v_last
  FROM public.onyx_live_sync_attempts a
  WHERE a.organization_id=v_org AND a.operation='inventory_pull'
    AND a.snapshot_id=p_snapshot_id
  ORDER BY a.started_at DESC,a.id DESC LIMIT 1;

  SELECT pg_catalog.jsonb_build_object(
    'id',a.id,'organization_id',a.organization_id,'operation',a.operation,'status',a.status,
    'snapshot_id',a.snapshot_id,'order_id',a.order_id,'request_sha256',a.request_sha256,
    'response_sha256',a.response_sha256,'http_status',a.http_status,
    'external_request_id',a.external_request_id,'started_at',a.started_at,'completed_at',a.completed_at
  ) INTO v_latest_success
  FROM public.onyx_live_sync_attempts a
  WHERE a.organization_id=v_org AND a.status='succeeded'
  ORDER BY a.completed_at DESC,a.id DESC LIMIT 1;

  SELECT pg_catalog.jsonb_build_object(
    'id',a.id,'operation',a.operation,'status',a.status,'snapshot_id',a.snapshot_id,'order_id',a.order_id,
    'http_status',a.http_status,'request_sha256',a.request_sha256,'response_sha256',a.response_sha256,
    'external_request_id',a.external_request_id,'error_code',a.error_code,'error_summary',a.error_summary,
    'started_at',a.started_at,'completed_at',a.completed_at
  ) INTO v_snapshot_success
  FROM public.onyx_live_sync_attempts a
  WHERE a.organization_id=v_org AND a.operation='inventory_pull'
    AND a.status='succeeded' AND a.snapshot_id=p_snapshot_id
  ORDER BY a.completed_at DESC,a.id DESC LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'organization_id',v_org,'snapshot_id',v_snapshot.id,
    'last_sync_attempt',v_last,
    'latest_successful_connection',v_latest_success,
    'snapshot_sync_proven',v_snapshot_success IS NOT NULL,
    'snapshot_sync_success',v_snapshot_success,
    'live_connection_proven',v_latest_success IS NOT NULL,
    'live_connection_message',CASE WHEN v_latest_success IS NULL
      THEN 'No successful server-recorded Onyx provider response is available; snapshot metadata is not live-sync proof.'
      ELSE 'A server-recorded Onyx provider response succeeded at the recorded timestamp; this is historical evidence, not a real-time health guarantee.' END
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.get_onyx_live_sync_attempt_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_onyx_live_sync_attempt_evidence(uuid) TO authenticated;

CREATE TABLE IF NOT EXISTS public.onyx_order_export_requests (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_key uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  source_snapshot_id uuid,
  item_count integer NOT NULL CHECK (item_count BETWEEN 1 AND 500),
  audit_id uuid REFERENCES public.audit_logs(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  PRIMARY KEY (organization_id,actor_profile_id,request_key),
  UNIQUE (audit_id)
);
ALTER TABLE public.onyx_order_export_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.onyx_order_export_requests FROM PUBLIC, anon, authenticated, service_role;

-- Replace the two-argument version with an extended signature whose trailing defaults keep
-- legacy two-argument callers source-compatible; current UI sends a stable request key.
DROP FUNCTION IF EXISTS public.record_onyx_order_export(uuid,integer);
CREATE OR REPLACE FUNCTION public.record_onyx_order_export(
  p_order_id uuid,
  p_item_count integer,
  p_source_snapshot_id uuid DEFAULT NULL,
  p_request_key uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_order public.orders%ROWTYPE;
  v_snapshot public.onyx_snapshots%ROWTYPE;
  v_job public.import_jobs%ROWTYPE;
  v_job_found boolean := false;
  v_item record;
  v_match_count integer;
  v_row_number integer;
  v_row_hash text;
  v_row_status text;
  v_external_ids jsonb;
  v_external_ids_truncated boolean;
  v_item_mappings jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_matched integer := 0;
  v_unmatched integer := 0;
  v_ambiguous integer := 0;
  v_non_valid integer := 0;
  v_snapshot_not_selected integer := 0;
  v_trace_status text;
  v_trace jsonb;
  v_last_attempt jsonb;
  v_latest_success jsonb;
  v_snapshot_success jsonb;
  v_request_key uuid := coalesce(p_request_key,gen_random_uuid());
  v_existing public.onyx_order_export_requests%ROWTYPE;
  v_claimed uuid;
  v_audit_id uuid;
  v_org_name text;
  v_live_connection_proven boolean := false;
  v_snapshot_sync_proven boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='staff permission required to prepare an Onyx export';
  END IF;
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization is required';
  END IF;
  SELECT o.* INTO v_order FROM public.orders o
  WHERE o.id=p_order_id AND o.organization_id=v_org FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='order not found in the active organization';
  END IF;
  IF p_item_count IS NULL OR p_item_count NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='export requires between 1 and 500 order items';
  END IF;
  IF v_order.status NOT IN ('confirmed','processing','shipped','delivered')
     OR coalesce(v_order.quantity_review_required,false) THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='only approved orders may be prepared for Onyx export';
  END IF;
  SELECT count(*)::integer INTO v_total FROM public.order_items oi WHERE oi.order_id=v_order.id;
  IF v_total<1 OR p_item_count<>v_total THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='export item count does not match the persisted order';
  END IF;
  IF p_source_snapshot_id IS NOT NULL THEN
    SELECT s.* INTO v_snapshot
    FROM public.onyx_snapshots s
    WHERE s.id=p_source_snapshot_id AND s.organization_id=v_org
      AND s.status='ready' AND s.report_type IN ('inventory','inventory_stock');
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ready Onyx inventory snapshot is unavailable in the current organization';
    END IF;
    IF v_snapshot.source_import_job_id IS NOT NULL THEN
      SELECT j.* INTO v_job
      FROM public.import_jobs j
      WHERE j.id=v_snapshot.source_import_job_id AND j.organization_id=v_org;
      v_job_found := FOUND;
    END IF;
  END IF;

  -- Claim an organization/actor-scoped request key before writing audit. A replay cannot
  -- create a second audit event, and reusing the key for a different payload is rejected.
  INSERT INTO public.onyx_order_export_requests(
    organization_id,actor_profile_id,request_key,order_id,source_snapshot_id,item_count
  ) VALUES (v_org,v_actor,v_request_key,v_order.id,p_source_snapshot_id,p_item_count)
  ON CONFLICT (organization_id,actor_profile_id,request_key) DO NOTHING
  RETURNING request_key INTO v_claimed;
  IF v_claimed IS NULL THEN
    SELECT r.* INTO v_existing FROM public.onyx_order_export_requests r
    WHERE r.organization_id=v_org AND r.actor_profile_id=v_actor AND r.request_key=v_request_key
    FOR UPDATE;
    IF NOT FOUND OR v_existing.order_id<>v_order.id
       OR v_existing.source_snapshot_id IS DISTINCT FROM p_source_snapshot_id
       OR v_existing.item_count<>p_item_count THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='export request key is already bound to a different order or source snapshot';
    END IF;
    IF v_existing.audit_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='export audit is incomplete; retry with the same request key';
    END IF;
    RETURN v_existing.audit_id;
  END IF;

  IF p_source_snapshot_id IS NULL THEN
    v_snapshot_not_selected:=v_total;
    v_trace_status:='snapshot_not_selected';
  ELSE
    FOR v_item IN
      SELECT oi.id,oi.product_id,
        coalesce(nullif(pg_catalog.btrim(oi.item_code),''),nullif(pg_catalog.btrim(p.item_code),'')) AS resolved_item_code
      FROM public.order_items oi
      LEFT JOIN public.products p ON p.id=oi.product_id AND p.organization_id=v_org
      WHERE oi.order_id=v_order.id
      ORDER BY oi.id
    LOOP
      v_match_count:=0;
      v_row_number:=NULL; v_row_hash:=NULL; v_row_status:=NULL;
      v_external_ids:='{}'::jsonb; v_external_ids_truncated:=false;
      IF v_item.resolved_item_code IS NOT NULL THEN
        SELECT count(*)::integer INTO v_match_count
        FROM public.onyx_snapshot_rows r
        WHERE r.organization_id=v_org AND r.snapshot_id=v_snapshot.id
          AND coalesce(nullif(r.data->>'item_code',''),r.canonical_key)=v_item.resolved_item_code;
      END IF;
      IF v_match_count=1 THEN
        SELECT r.row_number,r.row_hash,r.status,
          (SELECT coalesce(pg_catalog.jsonb_object_agg(candidate.key,pg_catalog.left(pg_catalog.btrim(r.data->>candidate.key),256) ORDER BY candidate.key),'{}'::jsonb)
           FROM (VALUES ('external_id'),('externalId'),('source_id'),('sourceId'),('onyx_id'),('onyx_code'),('external_code')) AS candidate(key)
           WHERE r.data ? candidate.key AND nullif(pg_catalog.btrim(r.data->>candidate.key),'') IS NOT NULL),
          EXISTS (
            SELECT 1 FROM (VALUES ('external_id'),('externalId'),('source_id'),('sourceId'),('onyx_id'),('onyx_code'),('external_code')) AS candidate(key)
            WHERE r.data ? candidate.key AND nullif(pg_catalog.btrim(r.data->>candidate.key),'') IS NOT NULL
              AND pg_catalog.char_length(pg_catalog.btrim(r.data->>candidate.key))>256
          )
        INTO v_row_number,v_row_hash,v_row_status,v_external_ids,v_external_ids_truncated
        FROM public.onyx_snapshot_rows r
        WHERE r.organization_id=v_org AND r.snapshot_id=v_snapshot.id
          AND coalesce(nullif(r.data->>'item_code',''),r.canonical_key)=v_item.resolved_item_code;
      END IF;

      IF v_match_count=0 THEN
        v_unmatched:=v_unmatched+1;
      ELSIF v_match_count>1 THEN
        v_ambiguous:=v_ambiguous+1;
      ELSIF v_row_status IS DISTINCT FROM 'valid' THEN
        v_non_valid:=v_non_valid+1;
      ELSE
        v_matched:=v_matched+1;
      END IF;

      v_item_mappings:=v_item_mappings || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'order_item_id',v_item.id,
        'product_id',CASE WHEN EXISTS(SELECT 1 FROM public.products p WHERE p.id=v_item.product_id AND p.organization_id=v_org) THEN v_item.product_id ELSE NULL END,
        'item_code',v_item.resolved_item_code,
        'source_mapping_status',CASE
          WHEN v_match_count=0 THEN 'unmatched'
          WHEN v_match_count>1 THEN 'ambiguous'
          WHEN v_row_status IS DISTINCT FROM 'valid' THEN 'matched_non_valid_row'
          ELSE 'matched' END,
        'source_row_count',v_match_count,
        'source_row_number',CASE WHEN v_match_count=1 THEN v_row_number ELSE NULL END,
        'source_row_status',CASE WHEN v_match_count=1 THEN v_row_status ELSE NULL END,
        'source_row_hash',CASE WHEN v_match_count=1 THEN v_row_hash ELSE NULL END,
        'external_ids',CASE WHEN v_match_count=1 THEN v_external_ids ELSE '{}'::jsonb END,
        'external_ids_truncated',CASE WHEN v_match_count=1 THEN v_external_ids_truncated ELSE false END
      ));
    END LOOP;

    IF v_snapshot.source_import_job_id IS NULL THEN
      v_trace_status:='snapshot_without_import_job';
    ELSIF NOT v_job_found THEN
      v_trace_status:='linked_import_job_unavailable';
    ELSIF v_job.file_hash IS DISTINCT FROM v_snapshot.source_file_hash THEN
      v_trace_status:='linked_hash_mismatch';
    ELSIF v_matched=v_total THEN
      v_trace_status:='linked_complete';
    ELSIF v_matched=0 AND v_unmatched+v_ambiguous+v_non_valid=v_total THEN
      v_trace_status:='no_item_matches';
    ELSE
      v_trace_status:='linked_partial';
    END IF;
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'id',a.id,'operation',a.operation,'status',a.status,'snapshot_id',a.snapshot_id,'order_id',a.order_id,
    'request_sha256',a.request_sha256,'response_sha256',a.response_sha256,'http_status',a.http_status,
    'external_request_id',a.external_request_id,'error_code',a.error_code,'error_summary',a.error_summary,
    'started_at',a.started_at,'completed_at',a.completed_at
  ) INTO v_last_attempt
  FROM public.onyx_live_sync_attempts a
  WHERE a.organization_id=v_org AND (
    (a.operation='inventory_pull' AND (
      (p_source_snapshot_id IS NULL AND a.snapshot_id IS NULL)
      OR a.snapshot_id=p_source_snapshot_id
    ))
    OR (a.operation='order_push' AND a.order_id=v_order.id)
  )
  ORDER BY a.started_at DESC,a.id DESC LIMIT 1;

  SELECT pg_catalog.jsonb_build_object(
    'id',a.id,'operation',a.operation,'status',a.status,'snapshot_id',a.snapshot_id,'order_id',a.order_id,
    'http_status',a.http_status,'request_sha256',a.request_sha256,'response_sha256',a.response_sha256,
    'external_request_id',a.external_request_id,'error_code',a.error_code,'error_summary',a.error_summary,
    'started_at',a.started_at,'completed_at',a.completed_at
  ) INTO v_latest_success
  FROM public.onyx_live_sync_attempts a
  WHERE a.organization_id=v_org AND a.status='succeeded'
  ORDER BY a.completed_at DESC,a.id DESC LIMIT 1;

  IF p_source_snapshot_id IS NOT NULL THEN
    SELECT pg_catalog.jsonb_build_object(
      'id',a.id,'snapshot_id',a.snapshot_id,'http_status',a.http_status,
      'request_sha256',a.request_sha256,'response_sha256',a.response_sha256,
      'external_request_id',a.external_request_id,'started_at',a.started_at,'completed_at',a.completed_at
    ) INTO v_snapshot_success
    FROM public.onyx_live_sync_attempts a
    WHERE a.organization_id=v_org AND a.operation='inventory_pull'
      AND a.status='succeeded' AND a.snapshot_id=p_source_snapshot_id
    ORDER BY a.completed_at DESC,a.id DESC LIMIT 1;
  END IF;
  v_live_connection_proven:=v_latest_success IS NOT NULL;
  v_snapshot_sync_proven:=v_snapshot_success IS NOT NULL;

  SELECT o.name INTO v_org_name FROM public.organizations o WHERE o.id=v_org AND o.is_active;
  v_trace:=pg_catalog.jsonb_build_object(
    'organization_id',v_org,
    'snapshot_id',p_source_snapshot_id,
    'source_trace_status',v_trace_status,
    'snapshot',CASE WHEN p_source_snapshot_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
      'id',v_snapshot.id,'source_import_job_id',v_snapshot.source_import_job_id,
      'source_file_hash',v_snapshot.source_file_hash,'source_file_name',v_snapshot.source_file_name,
      'report_type',v_snapshot.report_type,'period_key',v_snapshot.period_key,
      'snapshot_version',v_snapshot.snapshot_version,'created_at',v_snapshot.created_at
    ) END,
    'import_job',CASE WHEN p_source_snapshot_id IS NULL OR NOT v_job_found THEN NULL ELSE pg_catalog.jsonb_build_object(
      'id',v_job.id,'source_system',v_job.source_system,'job_type',v_job.job_type,'status',v_job.status,
      'file_hash',v_job.file_hash,'error_code',CASE WHEN pg_catalog.jsonb_typeof(to_jsonb(v_job.error_summary))='object' THEN v_job.error_summary->>'code' ELSE NULL END,
      'file_hash_matches_snapshot',v_job.file_hash IS NOT DISTINCT FROM v_snapshot.source_file_hash
    ) END,
    'item_counts',pg_catalog.jsonb_build_object(
      'total',v_total,'matched',v_matched,'unmatched',v_unmatched,'ambiguous',v_ambiguous,
      'non_valid',v_non_valid,'snapshot_not_selected',v_snapshot_not_selected
    ),
    'item_mappings',v_item_mappings,
    'last_sync_attempt',v_last_attempt,
    'live_sync_evidence',pg_catalog.jsonb_build_object(
      'status',CASE WHEN v_live_connection_proven THEN 'proven' ELSE 'not_proven' END,
      'live_connection_proven',v_live_connection_proven,
      'latest_successful_attempt_id',coalesce(v_latest_success->>'id',NULL),
      'latest_successful_at',coalesce(v_latest_success->>'completed_at',NULL),
      'snapshot_sync_proven',v_snapshot_sync_proven,
      'snapshot_sync_success',v_snapshot_success,
      'message',CASE WHEN v_live_connection_proven
        THEN 'A server-recorded provider response succeeded at the recorded timestamp; it does not prove current real-time availability.'
        ELSE 'No server-recorded successful Onyx provider response is available. A saved snapshot or prepared XLSX is not live-sync proof.' END
    )
  );

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  ) VALUES (
    v_org,v_actor,'onyx_export.prepared','order',v_order.id,NULL,
    pg_catalog.jsonb_build_object(
      'format','xlsx','profile','onyx-order-27/v1','column_count',27,'item_count',v_total,
      'order_number',v_order.order_number,'order_status',v_order.status,
      'compatibility_verified',false,'download_completion_verified',false,'target_import_verified',false,
      'live_sync_triggered',false,'request_key',v_request_key,'generated_at',pg_catalog.clock_timestamp(),
      'organization_id',v_org,'source_trace',v_trace
    ),pg_catalog.clock_timestamp()
  ) RETURNING id INTO v_audit_id;

  UPDATE public.onyx_order_export_requests
  SET audit_id=v_audit_id
  WHERE organization_id=v_org AND actor_profile_id=v_actor AND request_key=v_request_key AND audit_id IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='could not bind export request to the audit event';
  END IF;
  RETURN v_audit_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.record_onyx_order_export(uuid,integer,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_onyx_order_export(uuid,integer,uuid,uuid) TO authenticated;

COMMENT ON TABLE public.onyx_live_sync_attempts IS
  'Service-role-only, append/result-locked evidence of an actual provider request; no browser role may create a successful connection record.';
COMMENT ON FUNCTION public.record_onyx_live_sync_attempt(text,text,uuid,uuid,uuid,uuid,text,integer,text,text,text,text) IS
  'Service-role-only state machine for redacted Onyx live request evidence. A success requires a 2xx response plus request and response SHA-256 fingerprints.';
COMMENT ON FUNCTION public.record_onyx_order_export(uuid,integer,uuid,uuid) IS
  'Tenant-scoped, idempotent Onyx XLSX preparation audit with source snapshot and external-ID line mapping. It never asserts download completion, target import acceptance, or live sync.';
