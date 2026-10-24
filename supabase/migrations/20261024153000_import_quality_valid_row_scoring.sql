BEGIN;

-- A row contributes validity points only after explicit validation. Pending, invalid,
-- rejected, NULL-like, and unrecognized states fail closed instead of scoring as valid.
CREATE OR REPLACE FUNCTION public.calculate_import_job_quality(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_job public.import_jobs%ROWTYPE;
  v_profile public.import_profiles%ROWTYPE;
  v_total integer := 0;
  v_valid numeric := 0;
  v_unique numeric := 0;
  v_consistent numeric := 0;
  v_temporal numeric := 0;
  v_complete numeric := 0;
  v_key text;
  v_score integer := 0;
BEGIN
  -- Authenticate and authorize before revealing whether a requested job exists.
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='not authorized to calculate import quality';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;

  IF v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='not authorized to calculate import quality';
  END IF;

  SELECT j.* INTO v_job
    FROM public.import_jobs j
   WHERE j.id=p_job_id AND j.organization_id=v_org;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='import job not found in active organization';
  END IF;

  IF v_job.profile_id IS NOT NULL THEN
    SELECT p.* INTO v_profile
      FROM public.import_profiles p
     WHERE p.id=v_job.profile_id AND p.organization_id=v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='import profile is unavailable in the active organization';
    END IF;
  END IF;

  v_key := coalesce(v_profile.matching_key,'item_code');
  SELECT count(*)::integer,
         coalesce(avg(CASE WHEN r.status='valid' THEN 100.0 ELSE 0.0 END),0),
         CASE WHEN count(*)=0 THEN 0 ELSE count(DISTINCT nullif(btrim(coalesce(r.data->>v_key,'')),''))::numeric/count(*)*100 END,
         coalesce(avg(CASE
           WHEN (
             nullif(r.data->>'quantity','') IS NULL OR (r.data->>'quantity') ~ '^-?[0-9]+([.][0-9]+)?$'
           ) AND (
             nullif(r.data->>'revenue','') IS NULL OR (r.data->>'revenue') ~ '^-?[0-9]+([.][0-9]+)?$'
           ) AND (
             nullif(r.data->>'price','') IS NULL OR (r.data->>'price') ~ '^-?[0-9]+([.][0-9]+)?$'
           ) THEN 100.0 ELSE 0.0 END),0),
         coalesce(avg(CASE
           WHEN nullif(pg_catalog.btrim(coalesce(r.data->>'date','')),'') IS NULL THEN 100.0
           WHEN public.is_valid_import_quality_date(pg_catalog.btrim(r.data->>'date')) IS TRUE THEN 100.0
           ELSE 0.0 END),0)
    INTO v_total,v_valid,v_unique,v_consistent,v_temporal
    FROM public.import_job_rows r
   WHERE r.import_job_id=v_job.id;

  IF v_total=0 THEN
    RETURN jsonb_build_object(
      'score',0,'label','rejected',
      'components',jsonb_build_object(
        'completeness',0,'validity',0,'uniqueness',0,
        'consistency',0,'temporal_referential_integrity',0
      ),
      'total_rows',0
    );
  END IF;

  SELECT coalesce(avg(
    CASE WHEN jsonb_array_length(coalesce(v_profile.required_columns,'["item_code"]'::jsonb))=0 THEN 100.0
    ELSE (
      SELECT count(*)::numeric / jsonb_array_length(coalesce(v_profile.required_columns,'["item_code"]'::jsonb)) * 100
        FROM jsonb_array_elements_text(coalesce(v_profile.required_columns,'["item_code"]'::jsonb)) AS req(field_name)
       WHERE nullif(btrim(coalesce(r.data->>req.field_name,'')),'') IS NOT NULL
    ) END),0)
    INTO v_complete
    FROM public.import_job_rows r
   WHERE r.import_job_id=v_job.id;

  v_score := round((v_complete+v_valid+v_unique+v_consistent+v_temporal)/5.0)::integer;
  RETURN jsonb_build_object(
    'score',v_score,
    'label',CASE WHEN v_score>=90 THEN 'excellent' WHEN v_score>=75 THEN 'acceptable' WHEN v_score>=50 THEN 'warning' ELSE 'rejected' END,
    'components',jsonb_build_object(
      'completeness',round(v_complete,2),'validity',round(v_valid,2),'uniqueness',round(v_unique,2),
      'consistency',round(v_consistent,2),'temporal_referential_integrity',round(v_temporal,2)
    ),
    'total_rows',v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_import_job_quality(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_import_job_quality(uuid) TO authenticated;
COMMENT ON FUNCTION public.calculate_import_job_quality(uuid) IS
  'Calculates source quality only after an authenticated active staff profile is resolved; job and import profile lookups are scoped to that organization to avoid cross-tenant existence disclosure.';


COMMIT;
