CREATE OR REPLACE FUNCTION public.ensure_customer_import_profile()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_profile_id uuid;
  v_next_version integer;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = v_actor AND p.auth_user_id = auth.uid()
          AND p.organization_id = v_org AND p.is_active
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id = v_actor AND r.role IN ('admin', 'manager')
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.organizations o
        WHERE o.id = v_org AND o.is_active
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'صلاحية المدير النشط مطلوبة لتهيئة ملف استيراد العملاء';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':import-profile:customers', 0)
  );

  SELECT ip.id INTO v_profile_id
    FROM public.import_profiles ip
   WHERE ip.organization_id = v_org
     AND ip.profile_name = 'Unified Customer CSV'
     AND ip.status = 'active'
   ORDER BY ip.version DESC
   LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  SELECT coalesce(max(ip.version), 0) + 1 INTO v_next_version
    FROM public.import_profiles ip
   WHERE ip.organization_id = v_org
     AND ip.profile_name = 'Unified Customer CSV';

  INSERT INTO public.import_profiles (
    organization_id, profile_name, report_type, source, version,
    required_columns, optional_columns, ignored_columns, synonyms,
    transformation_rules, validation_rules, matching_key, merge_strategy,
    date_rules, is_full_dataset, status, created_by, published_at
  ) VALUES (
    v_org, 'Unified Customer CSV', 'tabular', 'unified', v_next_version,
    '["customer_code"]'::jsonb,
    '["business_name","customer_name","contact_name","phone","email","address","tax_number","source_customer_tier"]'::jsonb,
    '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'customer_code', 'manual_review', '{}'::jsonb, false,
    'active', v_actor, pg_catalog.now()
  )
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_customer_import_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_customer_import_profile() TO authenticated;
