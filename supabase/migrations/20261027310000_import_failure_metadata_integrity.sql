BEGIN;

CREATE OR REPLACE FUNCTION public.fail_import_job_safely(
  p_job_id uuid,
  p_error_summary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_job public.import_jobs%ROWTYPE;
  v_total integer := 0;
  v_failed integer := 0;
  v_snapshot uuid;
  v_safe_error_summary jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بتحديث حالة دفعة الاستيراد';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='المؤسسة النشطة غير صالحة';
  END IF;
  IF p_error_summary IS NULL
     OR pg_catalog.jsonb_typeof(p_error_summary) <> 'object'
     OR pg_catalog.octet_length(p_error_summary::text) > 20000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ملخص فشل الاستيراد غير صالح أو كبير جدًا';
  END IF;

  -- The client may describe the failure, but cannot replace the server-owned
  -- processing fingerprint, source identity, profile, period, or full-dataset decision.
  -- Only the two user-facing diagnostic fields are accepted from this payload.
  v_safe_error_summary := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'code', CASE
      WHEN pg_catalog.jsonb_typeof(p_error_summary->'code') = 'string'
      THEN pg_catalog.left(p_error_summary->>'code',120)
      ELSE NULL
    END,
    'message', CASE
      WHEN pg_catalog.jsonb_typeof(p_error_summary->'message') = 'string'
      THEN pg_catalog.left(p_error_summary->>'message',2000)
      ELSE NULL
    END
  ));

  SELECT j.* INTO v_job
    FROM public.import_jobs j
   WHERE j.id=p_job_id AND j.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='دفعة الاستيراد غير موجودة في المؤسسة النشطة';
  END IF;

  SELECT count(*)::integer,
         count(*) FILTER (WHERE r.status='rejected')::integer
    INTO v_total,v_failed
    FROM public.import_job_rows r
   WHERE r.import_job_id=v_job.id;

  IF v_job.status IN ('completed','completed_with_warnings','rejected','manual_review','ignored_duplicate','cancelled','rolled_back') THEN
    SELECT s.id INTO v_snapshot
      FROM public.onyx_snapshots s
     WHERE s.source_import_job_id=v_job.id AND s.organization_id=v_org AND s.status='ready'
     ORDER BY s.snapshot_version DESC LIMIT 1;
    RETURN pg_catalog.jsonb_build_object(
      'job_id',v_job.id,'status',v_job.status,'changed',false,'terminal',true,
      'total_rows',v_job.total_rows,'processed_rows',v_job.processed_rows,
      'failed_rows',v_job.failed_rows,'snapshot_id',v_snapshot
    );
  END IF;

  UPDATE public.import_jobs
     SET status='failed',
         total_rows=v_total,
         processed_rows=v_total,
         success_rows=greatest(v_total-v_failed,0),
         failed_rows=v_failed,
         error_summary=coalesce(v_job.error_summary,'{}'::jsonb)
           || v_safe_error_summary
           || pg_catalog.jsonb_build_object('resumable',true,'no_raw_file_retained',true)
   WHERE id=v_job.id AND organization_id=v_org;

  RETURN pg_catalog.jsonb_build_object(
    'job_id',v_job.id,'status','failed','changed',true,'terminal',false,
    'total_rows',v_total,'processed_rows',v_total,'failed_rows',v_failed,'snapshot_id',NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fail_import_job_safely(uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fail_import_job_safely(uuid,jsonb) TO authenticated;

COMMENT ON FUNCTION public.fail_import_job_safely(uuid,jsonb) IS
  'Atomically records bounded diagnostic code/message and reconciles staging counts. Client failure payloads cannot overwrite server-owned source identity, profile, processing fingerprint, period, or full-dataset metadata.';

COMMIT;
