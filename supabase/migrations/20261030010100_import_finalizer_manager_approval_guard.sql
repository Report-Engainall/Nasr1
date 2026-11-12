-- Import finalization creates the approved, tenant-visible data snapshot.
-- Generic staff may stage and upload import data, but only an organization admin/manager may approve it.
-- Preserve the one-argument compatibility wrapper; it delegates into this guarded two-argument function.

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
  v_profile public.import_profiles%ROWTYPE;
  v_result jsonb;
  v_new_snapshot uuid;
  v_prior_snapshot public.onyx_snapshots%ROWTYPE;
  v_chunk_count integer;
  v_min_chunk integer;
  v_max_chunk integer;
  v_total_bytes bigint;
  v_bad_chunk boolean;
  v_expected_chunks integer;
  v_remaining_prior_count integer := 0;
BEGIN
  -- Resolve tenant and role before looking up the caller-supplied job/session IDs.
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT EXISTS (
     SELECT 1
       FROM public.user_roles r
      WHERE r.profile_id = v_actor
        AND r.role IN ('admin','manager')
   ) THEN
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_org::text || ':' || COALESCE(v_job.profile_id::text,'<null>') || ':' || COALESCE(v_job.period_key,'<null>'),
      0
    )
  );

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
     OR v_session.external_source_reference IS DISTINCT FROM v_job.external_source_reference
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
     OR v_job.error_summary->>'period_key' IS DISTINCT FROM v_job.period_key
     OR v_job.error_summary->>'source_system' IS DISTINCT FROM v_job.source_system
     OR v_job.error_summary->>'external_source_reference' IS DISTINCT FROM v_job.external_source_reference THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='بصمة إعدادات المعالجة أو الفترة غير مثبتة على الدفعة؛ أعد المعالجة من الملف الأصلي';
  END IF;

  -- Replacing a published snapshot means treating the incoming file as a complete dataset.
  -- Do not let a partial upload silently make previously live keys disappear from the newest snapshot.
  IF p_duplicate_action = 'replace' THEN
    IF v_job.profile_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='الاستبدال الكامل مرفوض: لا توجد هوية ملف تعريفي موثقة تثبت اكتمال المصدر؛ استخدم الدمج أو نسخة جديدة';
    END IF;

    SELECT ip.* INTO v_profile
      FROM public.import_profiles ip
     WHERE ip.id=v_job.profile_id
       AND ip.organization_id=v_org
       AND ip.status='active'
     FOR SHARE;
    IF NOT FOUND
       OR v_profile.version IS DISTINCT FROM v_job.profile_version
       OR v_profile.is_full_dataset IS DISTINCT FROM true
       OR v_job.error_summary->>'is_full_dataset' IS DISTINCT FROM 'true' THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='الاستبدال الكامل مرفوض: الملف التعريفي والدفعة لا يثبتان أن الملف يحتوي على مجموعة بيانات كاملة؛ لم تتغير اللقطة السابقة. استخدم الدمج أو نسخة جديدة';
    END IF;
  END IF;

  -- All writes made by the snapshot builder run in this RPC transaction. If it raises,
  -- job status and snapshot changes roll back together; intentional manual_review/rejected
  -- returns remain explicit terminal decisions with no ready snapshot.
  v_result := public.finalize_import_job_without_manifest_guard(p_job_id, p_duplicate_action);

  -- Only after the replacement has produced a completed ready snapshot do we retire
  -- prior snapshots in the same tenant/profile/period. A rejected/manual-review result
  -- never archives the previously live snapshot.
  IF p_duplicate_action = 'replace' AND v_result->>'status' = 'completed' THEN
    v_new_snapshot := NULLIF(v_result->>'snapshot_id','')::uuid;
    IF v_new_snapshot IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='اعتمد الاستبدال دون إعادة معرّف اللقطة؛ تم إلغاء المعاملة لحماية اللقطة السابقة';
    END IF;

    FOR v_prior_snapshot IN
      SELECT s.*
        FROM public.onyx_snapshots s
       WHERE s.organization_id=v_org
         AND s.profile_id=v_job.profile_id
         AND s.period_key IS NOT DISTINCT FROM v_job.period_key
         AND s.status='ready'
         AND s.id IS DISTINCT FROM v_new_snapshot
       ORDER BY s.snapshot_version
       FOR UPDATE
    LOOP
      UPDATE public.onyx_snapshots
         SET status='archived'
       WHERE id=v_prior_snapshot.id
         AND organization_id=v_org
         AND status='ready';

      INSERT INTO public.audit_logs(
        organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
      )
      VALUES(
        v_org,v_actor,'import.snapshot_replaced','onyx_snapshot',v_prior_snapshot.id,
        pg_catalog.jsonb_build_object(
          'status','ready','source_import_job_id',v_prior_snapshot.source_import_job_id,
          'source_file_hash',v_prior_snapshot.source_file_hash,
          'snapshot_version',v_prior_snapshot.snapshot_version,'row_count',v_prior_snapshot.row_count
        ),
        pg_catalog.jsonb_build_object(
          'status','archived','replacement_snapshot_id',v_new_snapshot,
          'replacement_import_job_id',v_job.id,'reason','explicit replace of a verified full dataset'
        ),
        pg_catalog.now()
      );
    END LOOP;

    -- Never report a successful replacement while an older snapshot for this exact
    -- tenant/profile/period is still live. Fail closed so all writes above roll back
    -- if an unexpected database invariant prevents retiring the prior snapshot.
    SELECT count(*)::integer
      INTO v_remaining_prior_count
      FROM public.onyx_snapshots s
     WHERE s.organization_id=v_org
       AND s.profile_id=v_job.profile_id
       AND s.period_key IS NOT DISTINCT FROM v_job.period_key
       AND s.status='ready'
       AND s.id IS DISTINCT FROM v_new_snapshot;
    IF v_remaining_prior_count > 0 THEN
      RAISE EXCEPTION USING ERRCODE='40001',
        MESSAGE='استبدال اللقطة لم يتم: بقيت لقطة سابقة جاهزة للفترة والملف التعريفي؛ ألغيت المعاملة لحماية البيانات الحالية';
    END IF;
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.finalize_import_job(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_import_job(uuid, text) TO authenticated;
COMMENT ON FUNCTION public.finalize_import_job(uuid, text) IS
  'Finalizes only a tenant-owned import job with a verified upload manifest; snapshot approval is restricted to an active organization admin or manager.';
