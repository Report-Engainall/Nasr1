BEGIN;

-- Keep the previous transactional snapshot builder as a private implementation.
-- The public finalization command now enforces the verified upload manifest first.
ALTER FUNCTION public.finalize_import_job(uuid, text)
  RENAME TO finalize_import_job_without_manifest_guard;

REVOKE ALL ON FUNCTION public.finalize_import_job_without_manifest_guard(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalize_import_job(p_job_id uuid, p_duplicate_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_job public.import_jobs%ROWTYPE;
  v_session public.import_upload_sessions%ROWTYPE;
  v_chunk_count integer;
  v_min_chunk integer;
  v_max_chunk integer;
  v_total_bytes bigint;
  v_bad_chunk boolean;
  v_expected_chunks integer;
BEGIN
  -- Resolve tenant and role before looking up the caller-supplied job/session IDs.
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بإنهاء الاستيراد';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='المؤسسة النشطة غير صالحة';
  END IF;

  SELECT j.* INTO v_job
    FROM public.import_jobs j
   WHERE j.id=p_job_id AND j.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='دفعة الاستيراد غير موجودة في المؤسسة النشطة';
  END IF;

  -- Cancelled/terminal jobs cannot be finalized even if partially staged rows remain.
  IF v_job.status NOT IN ('staging','failed','uploading') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='حالة الدفعة لا تسمح بالاعتماد؛ لم يتم إنشاء لقطة';
  END IF;
  IF v_job.upload_session_id IS NULL OR v_job.file_hash IS NULL OR v_job.file_size IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='دفعة الاستيراد تفتقر إلى جلسة رفع وهوية ملف موثقتين';
  END IF;

  SELECT s.* INTO v_session
    FROM public.import_upload_sessions s
   WHERE s.id=v_job.upload_session_id
     AND s.organization_id=v_org
     AND s.import_job_id=v_job.id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='جلسة الرفع لا تتبع دفعة الاستيراد والمؤسسة النشطتين';
  END IF;

  IF v_session.file_hash IS DISTINCT FROM v_job.file_hash
     OR v_session.file_size IS DISTINCT FROM v_job.file_size
     OR v_session.file_name IS DISTINCT FROM v_job.file_name
     OR v_session.profile_id IS DISTINCT FROM v_job.profile_id
     OR v_session.profile_version IS DISTINCT FROM v_job.profile_version
     OR v_session.period_key IS DISTINCT FROM v_job.period_key
     OR v_session.raw_file_retained IS DISTINCT FROM false THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='هوية الملف أو الدفعة أو إعداداتها لا تطابق جلسة الرفع';
  END IF;

  IF v_session.status <> 'uploaded' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لم يكتمل رفع الملف والتحقق من شرائحه؛ لم يتم اعتماد الاستيراد';
  END IF;

  v_expected_chunks := ceil(v_session.file_size::numeric / v_session.chunk_size_bytes)::integer;
  IF v_session.total_chunks <> v_expected_chunks
     OR v_session.total_chunks < 1
     OR v_session.verified_chunks <> v_session.total_chunks THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='عدد شرائح الملف غير مكتمل أو لا يطابق الحجم المسجل';
  END IF;

  SELECT count(*)::integer, min(c.chunk_number), max(c.chunk_number), coalesce(sum(c.byte_size),0),
         coalesce(bool_or(
           c.organization_id IS DISTINCT FROM v_org
           OR c.chunk_number < 0
           OR c.chunk_number >= v_session.total_chunks
           OR c.byte_offset <> c.chunk_number::bigint * v_session.chunk_size_bytes
           OR c.byte_size <> least(
                v_session.chunk_size_bytes,
                (v_session.file_size - c.chunk_number::bigint * v_session.chunk_size_bytes)::integer
              )
           OR c.chunk_hash !~ '^[0-9a-f]{64}$'
         ),true)
    INTO v_chunk_count, v_min_chunk, v_max_chunk, v_total_bytes, v_bad_chunk
    FROM public.import_upload_chunks c
   WHERE c.session_id=v_session.id;

  IF v_chunk_count <> v_session.total_chunks
     OR v_min_chunk <> 0
     OR v_max_chunk <> v_session.total_chunks - 1
     OR v_total_bytes <> v_session.file_size
     OR v_bad_chunk THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سجل شرائح الرفع غير متصل أو لا يطابق الملف؛ لم يتم اعتماد الاستيراد';
  END IF;

  -- Processing config is part of the resume identity: a complete manifest is not enough
  -- if column mapping or validation rules changed between attempts.
  IF coalesce(v_job.error_summary->>'processing_config_fingerprint','') !~ '^[0-9a-f]{64}$'
     OR v_job.error_summary->>'source_file_hash' IS DISTINCT FROM v_job.file_hash
     OR v_job.error_summary->>'period_key' IS DISTINCT FROM v_job.period_key THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بصمة إعدادات المعالجة أو الفترة غير مثبتة على الدفعة؛ أعد المعالجة من الملف الأصلي';
  END IF;

  -- All writes made by the snapshot builder run in this RPC transaction. If it raises,
  -- job status and snapshot changes roll back together; intentional manual_review/rejected
  -- returns remain explicit terminal decisions with no ready snapshot.
  RETURN public.finalize_import_job_without_manifest_guard(p_job_id, p_duplicate_action);
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_import_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_import_job(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.finalize_import_job(uuid, text) IS
  'Finalizes only a nonterminal tenant-owned import job with a matching complete SHA-256 upload manifest and persisted processing fingerprint; snapshot creation remains transactional.';

COMMIT;
