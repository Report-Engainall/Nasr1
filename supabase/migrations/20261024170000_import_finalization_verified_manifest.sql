BEGIN;

ALTER TABLE public.import_jobs
  ADD COLUMN IF NOT EXISTS external_source_reference text;
ALTER TABLE public.import_upload_sessions
  ADD COLUMN IF NOT EXISTS external_source_reference text;

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


-- Preserve the true final suffix in file metadata for names such as "stock.final.csv".
CREATE OR REPLACE FUNCTION public.create_import_upload_session(p_job_id uuid)
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
  v_file_type text;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='غير مصرح بإنشاء جلسة استيراد';
  END IF;

  SELECT j.* INTO v_job
    FROM public.import_jobs j
   WHERE j.id=p_job_id AND j.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND OR v_job.file_hash IS NULL OR v_job.file_size IS NULL
     OR v_job.file_size < 1 OR v_job.file_size > 104857600
     OR pg_catalog.length(v_job.file_hash) <> 64 OR v_job.file_hash ~ '[^0-9a-f]'
  THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='دفعة الاستيراد غير صالحة';
  END IF;

  IF v_job.upload_session_id IS NOT NULL THEN
    SELECT s.* INTO v_session
      FROM public.import_upload_sessions s
     WHERE s.id=v_job.upload_session_id
       AND s.organization_id=v_org
       AND s.import_job_id=v_job.id;
    IF FOUND THEN
      IF v_session.file_hash IS DISTINCT FROM v_job.file_hash
         OR v_session.file_size IS DISTINCT FROM v_job.file_size
         OR v_session.file_name IS DISTINCT FROM v_job.file_name
         OR v_session.profile_id IS DISTINCT FROM v_job.profile_id
         OR v_session.profile_version IS DISTINCT FROM v_job.profile_version
         OR v_session.period_key IS DISTINCT FROM v_job.period_key
         OR v_session.external_source_reference IS DISTINCT FROM v_job.external_source_reference THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='جلسة الرفع لا تطابق هوية دفعة الاستيراد';
      END IF;
      RETURN pg_catalog.to_jsonb(v_session);
    END IF;
  END IF;

  v_file_type := CASE
    WHEN pg_catalog.strpos(coalesce(v_job.file_name,''), '.') > 0
      THEN pg_catalog.lower(pg_catalog.reverse(pg_catalog.split_part(pg_catalog.reverse(v_job.file_name),'.',1)))
    ELSE 'unknown'
  END;

  INSERT INTO public.import_upload_sessions(
    organization_id,import_job_id,profile_id,profile_version,created_by,file_name,file_type,file_size,
    file_hash,period_key,external_source_reference,chunk_size_bytes,total_chunks,status,retention_expires_at,raw_file_retained
  )
  VALUES(
    v_org,v_job.id,v_job.profile_id,v_job.profile_version,v_actor,coalesce(v_job.file_name,'import.csv'),
    v_file_type,v_job.file_size,v_job.file_hash,v_job.period_key,v_job.external_source_reference,4194304,
    ceil(v_job.file_size::numeric/4194304)::integer,'created',pg_catalog.now()+interval '30 days',false
  )
  RETURNING * INTO v_session;

  UPDATE public.import_jobs
     SET upload_session_id=v_session.id,
         retention_expires_at=v_session.retention_expires_at,
         raw_file_retained=false
   WHERE id=v_job.id AND organization_id=v_org;

  RETURN pg_catalog.to_jsonb(v_session);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_import_upload_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_import_upload_session(uuid) TO authenticated;


-- Fail/retry bookkeeping is serialized against finalization. This prevents a lost RPC
-- response from downgrading a completed job to failed and creating another snapshot on retry.
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
           || p_error_summary
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
  'Atomically reconciles persisted staging row counts and marks a nonterminal import failed; terminal finalization/cancellation states cannot be downgraded after a lost response.';


-- Explicit rollback archives only the latest ready snapshot for an import job.
-- Snapshot rows and import rows are retained for audit/replay; no live catalog/stock rows are deleted.
CREATE OR REPLACE FUNCTION public.rollback_import_snapshot(
  p_job_id uuid,
  p_reason text
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
  v_snapshot public.onyx_snapshots%ROWTYPE;
  v_latest public.onyx_snapshots%ROWTYPE;
  v_reason text := pg_catalog.btrim(coalesce(p_reason,''));
  v_audit_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='تسجيل الدخول مطلوب للتراجع عن لقطة الاستيراد';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_org IS NULL OR NOT public.is_staff()
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id=v_actor AND r.role IN ('admin','manager')
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='التراجع عن لقطة الاستيراد متاح للمدير أو مدير النظام فقط';
  END IF;

  IF pg_catalog.length(v_reason) < 3 OR pg_catalog.length(v_reason) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='سبب التراجع مطلوب ويجب أن يكون بين 3 و1000 حرف';
  END IF;

  SELECT j.* INTO v_job
    FROM public.import_jobs j
   WHERE j.id=p_job_id AND j.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='دفعة الاستيراد غير موجودة في المؤسسة النشطة';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_org::text || ':' || COALESCE(v_job.profile_id::text,'<null>') || ':' || COALESCE(v_job.period_key,'<null>'),
      0
    )
  );

  IF v_job.status='rolled_back' THEN
    SELECT s.* INTO v_snapshot
      FROM public.onyx_snapshots s
     WHERE s.source_import_job_id=v_job.id
       AND s.organization_id=v_org
       AND s.status='archived'
     ORDER BY s.snapshot_version DESC
     LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='الدفعة معلّمة كمتراجع عنها لكن لم تُعثر على اللقطة المؤرشفة؛ يلزم تدقيق يدوي';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'job_id',v_job.id,'snapshot_id',v_snapshot.id,'status','rolled_back',
      'snapshot_status','archived','rolled_back',false,'already_rolled_back',true,
      'snapshot_version',v_snapshot.snapshot_version
    );
  END IF;

  IF v_job.status NOT IN ('completed','completed_with_warnings') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='لا يمكن التراجع إلا عن دفعة اعتمدت لقطة بنجاح';
  END IF;

  SELECT s.* INTO v_snapshot
    FROM public.onyx_snapshots s
   WHERE s.source_import_job_id=v_job.id
     AND s.organization_id=v_org
     AND s.status='ready'
   ORDER BY s.snapshot_version DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='لا توجد لقطة جاهزة مرتبطة بهذه الدفعة';
  END IF;

  SELECT s.* INTO v_latest
    FROM public.onyx_snapshots s
   WHERE s.organization_id=v_org
     AND s.profile_id IS NOT DISTINCT FROM v_snapshot.profile_id
     AND s.period_key IS NOT DISTINCT FROM v_snapshot.period_key
     AND s.status='ready'
   ORDER BY s.snapshot_version DESC
   LIMIT 1
   FOR UPDATE;
  IF NOT FOUND OR v_latest.id IS DISTINCT FROM v_snapshot.id THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='توجد لقطة أحدث جاهزة لهذه الفترة والملف التعريفي؛ لا يمكن أرشفة لقطة أقدم قبل معالجة اللقطة الأحدث';
  END IF;

  UPDATE public.onyx_snapshots
     SET status='archived'
   WHERE id=v_snapshot.id
     AND organization_id=v_org
     AND status='ready'
   RETURNING * INTO v_snapshot;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001', MESSAGE='تغيرت حالة اللقطة أثناء التراجع؛ لم يتم اعتماد التراجع';
  END IF;

  UPDATE public.import_jobs
     SET status='rolled_back',
         error_summary=coalesce(error_summary,'{}'::jsonb)
           || pg_catalog.jsonb_build_object(
             'rollback_status','completed',
             'rollback_reason',v_reason,
             'rollback_actor_profile_id',v_actor,
             'rollback_snapshot_id',v_snapshot.id,
             'rollback_at',pg_catalog.now(),
             'no_snapshot_rows_deleted',true
           )
   WHERE id=v_job.id AND organization_id=v_org;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value,created_at
  )
  VALUES(
    v_org,v_actor,'import.snapshot_rolled_back','onyx_snapshot',v_snapshot.id,
    pg_catalog.jsonb_build_object(
      'status','ready','source_import_job_id',v_job.id,
      'source_file_hash',v_snapshot.source_file_hash,
      'snapshot_version',v_snapshot.snapshot_version,
      'row_count',v_snapshot.row_count
    ),
    pg_catalog.jsonb_build_object(
      'status','archived','source_import_job_id',v_job.id,
      'reason',v_reason,'snapshot_rows_retained',true
    ),
    pg_catalog.now()
  )
  RETURNING id INTO v_audit_id;

  RETURN pg_catalog.jsonb_build_object(
    'job_id',v_job.id,'snapshot_id',v_snapshot.id,'status','rolled_back',
    'snapshot_status','archived','rolled_back',true,'already_rolled_back',false,
    'snapshot_version',v_snapshot.snapshot_version,'audit_id',v_audit_id,
    'snapshot_rows_retained',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.rollback_import_snapshot(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rollback_import_snapshot(uuid,text) TO authenticated;

COMMENT ON FUNCTION public.rollback_import_snapshot(uuid,text) IS
  'Archives only the newest ready tenant-owned snapshot for a completed import, retains all imported/snapshot rows and writes an audit event; repeated requests replay the rolled-back result.';


-- Identity-aware overload: external source references participate in the server-side
-- idempotency payload and are persisted before the request-key claim commits.
CREATE OR REPLACE FUNCTION public.create_import_job_idempotent(
  p_request_key uuid,
  p_file_name text,
  p_file_hash text,
  p_file_size bigint,
  p_job_type text,
  p_external_source_reference text,
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
  v_job_row public.import_jobs%ROWTYPE;
  v_period_key text := NULLIF(pg_catalog.left(COALESCE(p_period_key, ''), 120), '');
  v_source_system text := pg_catalog.left(COALESCE(NULLIF(p_source_system, ''), 'manual'), 80);
  v_external_source_reference text := NULLIF(pg_catalog.btrim(COALESCE(p_external_source_reference, '')), '');
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
  IF pg_catalog.length(v_external_source_reference) > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'مرجع المصدر الخارجي لا يتجاوز 200 حرف';
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

  v_payload := pg_catalog.jsonb_build_object(
    'file_name', p_file_name,
    'file_hash', p_file_hash,
    'file_size', p_file_size,
    'job_type', p_job_type,
    'requested_profile_id', p_profile_id,
    'period_key', v_period_key,
    'source_system', v_source_system,
    'external_source_reference', v_external_source_reference,
    'intent', p_intent
  );

  INSERT INTO public.import_job_request_keys (
    organization_id, actor_profile_id, request_key, request_payload
  )
  VALUES (v_org, v_actor, p_request_key, v_payload)
  ON CONFLICT (organization_id, actor_profile_id, request_key) DO NOTHING
  RETURNING request_key INTO v_claimed_key;

  IF v_claimed_key IS NULL THEN
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

  UPDATE public.import_jobs
     SET external_source_reference = v_external_source_reference
   WHERE id = v_job_id
     AND organization_id = v_org
     AND created_by = v_actor
  RETURNING * INTO v_job_row;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '40001',
      MESSAGE = 'تعذر تثبيت هوية المصدر الخارجي على دفعة الاستيراد';
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

  RETURN pg_catalog.to_jsonb(v_job_row);
END;
$function$;

REVOKE ALL ON FUNCTION public.create_import_job_idempotent(uuid,text,text,bigint,text,text,uuid,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_import_job_idempotent(uuid,text,text,bigint,text,text,uuid,text,text,text) TO authenticated;
COMMENT ON FUNCTION public.create_import_job_idempotent(uuid,text,text,bigint,text,text,uuid,text,text,text) IS
  'Atomically creates/replays one import batch per tenant/actor/request key while binding the external source reference into the request payload and persisted job metadata.';

COMMIT;
