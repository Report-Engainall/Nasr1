-- P2 API-OPS-001: authorize import quality inspection before resolving job IDs.
-- Scope both the import job and its profile to the caller's active organization so
-- a caller cannot distinguish a foreign job ID from a nonexistent one.
BEGIN;

-- Validate calendar dates rather than treating regex-shaped impossible dates as valid.
CREATE OR REPLACE FUNCTION public.is_valid_import_quality_date(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
  v_value text := pg_catalog.btrim(p_value);
  v_year integer;
  v_month integer;
  v_day integer;
  v_max_day integer;
BEGIN
  IF v_value IS NULL OR v_value = '' THEN RETURN NULL; END IF;

  IF v_value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
    v_year := pg_catalog.substr(v_value,1,4)::integer;
    v_month := pg_catalog.substr(v_value,6,2)::integer;
    v_day := pg_catalog.substr(v_value,9,2)::integer;
  ELSIF v_value ~ '^[0-9]{2}[/.-][0-9]{2}[/.-][0-9]{4}$' THEN
    IF pg_catalog.substr(v_value,3,1) <> pg_catalog.substr(v_value,6,1) THEN
      RETURN false;
    END IF;
    v_day := pg_catalog.substr(v_value,1,2)::integer;
    v_month := pg_catalog.substr(v_value,4,2)::integer;
    v_year := pg_catalog.substr(v_value,7,4)::integer;
  ELSE
    RETURN false;
  END IF;

  IF v_year < 1 OR v_month < 1 OR v_month > 12 OR v_day < 1 THEN
    RETURN false;
  END IF;

  IF v_month = 2 THEN
    v_max_day := CASE
      WHEN v_year % 400 = 0 OR (v_year % 4 = 0 AND v_year % 100 <> 0) THEN 29
      ELSE 28
    END;
  ELSIF v_month IN (4,6,9,11) THEN
    v_max_day := 30;
  ELSE
    v_max_day := 31;
  END IF;

  RETURN v_day <= v_max_day;
END;
$$;
REVOKE ALL ON FUNCTION public.is_valid_import_quality_date(text) FROM PUBLIC, anon, authenticated;


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
         coalesce(avg(CASE WHEN r.status<>'rejected' THEN 100.0 ELSE 0.0 END),0),
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
