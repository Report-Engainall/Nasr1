-- NASR1-ORIGINAL-SPEC-IDENTITY-AND-ONYX-SYNC-EVIDENCE-011
-- Reports immutable source/import provenance. It deliberately does not pretend a stored
-- file snapshot or an import profile is evidence of a live Onyx API connection.
CREATE OR REPLACE FUNCTION public.get_onyx_snapshot_source_evidence(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_org_name text;
  v_snapshot public.onyx_snapshots%ROWTYPE;
  v_job public.import_jobs%ROWTYPE;
  v_job_found boolean := false;
  v_source_row_count bigint := 0;
  v_external_id_rows bigint := 0;
  v_external_fields jsonb := '[]'::jsonb;
  v_job_error jsonb;
BEGIN
  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required to read Onyx source evidence';
  END IF;

  SELECT o.name INTO v_org_name
  FROM public.organizations o
  WHERE o.id=v_org AND o.is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization identity is unavailable';
  END IF;

  SELECT s.* INTO v_snapshot
  FROM public.onyx_snapshots s
  WHERE s.id=p_snapshot_id AND s.organization_id=v_org AND s.status='ready';

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='ready Onyx snapshot is unavailable in the current organization';
  END IF;

  IF v_snapshot.source_import_job_id IS NOT NULL THEN
    SELECT j.* INTO v_job
    FROM public.import_jobs j
    WHERE j.id=v_snapshot.source_import_job_id AND j.organization_id=v_org;
    v_job_found := FOUND;
  END IF;

  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE
      NULLIF(pg_catalog.btrim(coalesce(r.data->>'external_id','')),'') IS NOT NULL OR
      NULLIF(pg_catalog.btrim(coalesce(r.data->>'externalId','')),'') IS NOT NULL OR
      NULLIF(pg_catalog.btrim(coalesce(r.data->>'source_id','')),'') IS NOT NULL OR
      NULLIF(pg_catalog.btrim(coalesce(r.data->>'sourceId','')),'') IS NOT NULL OR
      NULLIF(pg_catalog.btrim(coalesce(r.data->>'onyx_id','')),'') IS NOT NULL OR
      NULLIF(pg_catalog.btrim(coalesce(r.data->>'onyx_code','')),'') IS NOT NULL OR
      NULLIF(pg_catalog.btrim(coalesce(r.data->>'external_code','')),'') IS NOT NULL
    )::bigint
  INTO v_source_row_count, v_external_id_rows
  FROM public.onyx_snapshot_rows r
  WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org;

  SELECT coalesce(pg_catalog.jsonb_agg(candidate.key ORDER BY candidate.key),'[]'::jsonb)
  INTO v_external_fields
  FROM (VALUES
    ('external_id'),('externalId'),('source_id'),('sourceId'),
    ('onyx_id'),('onyx_code'),('external_code')
  ) AS candidate(key)
  WHERE EXISTS (
    SELECT 1 FROM public.onyx_snapshot_rows r
    WHERE r.snapshot_id=v_snapshot.id
      AND r.organization_id=v_org
      AND r.data ? candidate.key
      AND NULLIF(pg_catalog.btrim(coalesce(r.data->>candidate.key,'')),'') IS NOT NULL
  );

  IF v_job_found THEN
    v_job_error := to_jsonb(v_job.error_summary);
  ELSE
    v_job_error := NULL;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'organization', pg_catalog.jsonb_build_object('id',v_org,'name',v_org_name),
    'snapshot', pg_catalog.jsonb_build_object(
      'id',v_snapshot.id,
      'source_import_job_id',v_snapshot.source_import_job_id,
      'source_file_name',v_snapshot.source_file_name,
      'source_file_hash',v_snapshot.source_file_hash,
      'report_type',v_snapshot.report_type,
      'period_key',v_snapshot.period_key,
      'snapshot_version',v_snapshot.snapshot_version,
      'created_at',v_snapshot.created_at,
      'row_count',v_snapshot.row_count
    ),
    'import_job', CASE WHEN v_job_found THEN pg_catalog.jsonb_build_object(
      'id',v_job.id,
      'source_system',v_job.source_system,
      'job_type',v_job.job_type,
      'status',v_job.status,
      'file_name',v_job.file_name,
      'file_hash',v_job.file_hash,
      'period_key',v_job.period_key,
      'created_at',v_job.created_at,
      -- import_jobs has no updated_at column; do not infer a synchronization timestamp.
      'updated_at',NULL,
      'error_code',CASE WHEN pg_catalog.jsonb_typeof(v_job_error)='object' THEN v_job_error->>'code' ELSE NULL END,
      'file_hash_matches_snapshot',v_job.file_hash IS NOT DISTINCT FROM v_snapshot.source_file_hash
    ) ELSE NULL END,
    'source_identity',pg_catalog.jsonb_build_object(
      'provenance_status',CASE
        WHEN v_snapshot.source_import_job_id IS NULL THEN 'snapshot_without_import_job'
        WHEN NOT v_job_found THEN 'linked_import_job_unavailable'
        WHEN v_job.file_hash IS DISTINCT FROM v_snapshot.source_file_hash THEN 'linked_hash_mismatch'
        ELSE 'linked_import_job_hash_match'
      END,
      'source_system',CASE WHEN v_job_found THEN v_job.source_system ELSE NULL END,
      -- The import-job UUID is provenance, not an external source-record identifier.
      'source_record_id',NULL,
      'source_row_count',v_source_row_count,
      'external_id_fields_found',v_external_fields,
      'rows_with_external_id',v_external_id_rows
    ),
    'live_sync_evidence',pg_catalog.jsonb_build_object(
      'status','not_proven',
      'live_connection_proven',false,
      'message','Snapshot/import provenance alone is not evidence of a live Onyx API connection or completed synchronization.'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_onyx_snapshot_source_evidence(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_onyx_snapshot_source_evidence(uuid) TO authenticated;
