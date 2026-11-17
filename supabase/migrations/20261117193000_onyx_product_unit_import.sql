BEGIN;

CREATE OR REPLACE FUNCTION public.ensure_onyx_product_unit_import_profile()
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
      MESSAGE = 'active admin or manager required to initialize Onyx product-unit import';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':import-profile:onyx-product-units', 0)
  );

  SELECT ip.id INTO v_profile_id
    FROM public.import_profiles ip
   WHERE ip.organization_id = v_org
     AND ip.profile_name = 'Onyx Pro Product Units'
     AND ip.report_type = 'product_units'
     AND ip.matching_key = 'product_unit_key'
     AND ip.required_columns = '["item_code","unit_code","unit_name","conversion_factor"]'::jsonb
     AND ip.status = 'active'
   ORDER BY ip.version DESC
   LIMIT 1;

  IF v_profile_id IS NOT NULL THEN
    RETURN v_profile_id;
  END IF;

  SELECT coalesce(max(ip.version), 0) + 1 INTO v_next_version
    FROM public.import_profiles ip
   WHERE ip.organization_id = v_org
     AND ip.profile_name = 'Onyx Pro Product Units';

  INSERT INTO public.import_profiles (
    organization_id, profile_name, report_type, source, version,
    required_columns, optional_columns, ignored_columns, synonyms,
    transformation_rules, validation_rules, matching_key, merge_strategy,
    date_rules, is_full_dataset, status, created_by, published_at
  ) VALUES (
    v_org, 'Onyx Pro Product Units', 'product_units', 'onyx_pro', v_next_version,
    '["item_code","unit_code","unit_name","conversion_factor"]'::jsonb,
    '["unit_name_en","is_base_unit","barcode","sales_allowed","purchase_allowed","default_sales_unit","default_purchase_unit","unit_cost_price","unit_selling_price","is_active"]'::jsonb,
    '[]'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb,
    'product_unit_key', 'manual_review', '{}'::jsonb, false,
    'active', v_actor, pg_catalog.now()
  )
  RETURNING id INTO v_profile_id;

  RETURN v_profile_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.ensure_onyx_product_unit_import_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_onyx_product_unit_import_profile() TO authenticated;

CREATE TABLE IF NOT EXISTS public.onyx_product_unit_import_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.onyx_snapshots(id) ON DELETE RESTRICT,
  source_import_job_id uuid NOT NULL REFERENCES public.import_jobs(id) ON DELETE RESTRICT,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT onyx_product_unit_import_applications_snapshot_key UNIQUE (organization_id, snapshot_id)
);

ALTER TABLE public.onyx_product_unit_import_applications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.onyx_product_unit_import_applications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.onyx_product_unit_import_applications TO service_role;

CREATE OR REPLACE FUNCTION public.apply_onyx_product_unit_snapshot(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_snapshot public.onyx_snapshots%rowtype;
  v_prior public.onyx_product_unit_import_applications%rowtype;
  v_row public.onyx_snapshot_rows%rowtype;
  v_product_id uuid;
  v_product_matches integer;
  v_base_unit text;
  v_item_code text;
  v_unit_code text;
  v_unit_name text;
  v_factor_text text;
  v_factor numeric;
  v_base_flag text;
  v_is_base boolean;
  v_product_units jsonb := '{}'::jsonb;
  v_merged jsonb;
  v_existing_name boolean;
  v_existing_factor integer;
  v_product_ids uuid[] := ARRAY[]::uuid[];
  v_seen_source_keys text[] := ARRAY[]::text[];
  v_seen_unit_names text[] := ARRAY[]::text[];
  v_source_key text;
  v_name_key text;
  v_row_count integer := 0;
  v_rows_applied integer := 0;
  v_units_created integer := 0;
  v_units_updated integer := 0;
  v_units_unchanged integer := 0;
  v_base_rows_skipped integer := 0;
  v_rejected integer := 0;
  v_metadata_pending integer := 0;
  v_errors jsonb := '[]'::jsonb;
  v_error_reason text;
  v_product_key text;
  v_units jsonb;
  v_result jsonb;
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
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active admin or manager required to apply Onyx product units';
  END IF;

  IF p_snapshot_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product-unit snapshot id is required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':onyx-product-unit-snapshot:' || p_snapshot_id::text, 0)
  );

  SELECT a.* INTO v_prior
    FROM public.onyx_product_unit_import_applications a
   WHERE a.organization_id = v_org AND a.snapshot_id = p_snapshot_id
   FOR UPDATE;

  IF FOUND THEN
    RETURN v_prior.result || pg_catalog.jsonb_build_object('idempotent_replay', true);
  END IF;

  SELECT s.* INTO v_snapshot
    FROM public.onyx_snapshots s
   WHERE s.id = p_snapshot_id
     AND s.organization_id = v_org
     AND s.status = 'ready'
     AND s.report_type = 'product_units'
   FOR SHARE;

  IF NOT FOUND OR coalesce(v_snapshot.data_quality_score, 0) < 75 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'only a ready ProductUnits snapshot with quality score 75 or higher can be applied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.import_jobs j
     WHERE j.id = v_snapshot.source_import_job_id
       AND j.organization_id = v_org
       AND j.job_type = 'product_units'
       AND j.status IN ('completed', 'completed_with_warnings')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'snapshot source job is not an accepted ProductUnits import';
  END IF;

  SELECT count(*)::integer INTO v_row_count
    FROM public.onyx_snapshot_rows r
   WHERE r.snapshot_id = v_snapshot.id
     AND r.organization_id = v_org;

  IF v_row_count = 0 OR v_row_count <> v_snapshot.row_count OR v_row_count > 5000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'snapshot row count is empty, inconsistent, or exceeds the 5000-row application limit';
  END IF;

  FOR v_row IN
    SELECT r.* FROM public.onyx_snapshot_rows r
     WHERE r.snapshot_id = v_snapshot.id
       AND r.organization_id = v_org
     ORDER BY r.row_number, r.id
  LOOP
    v_error_reason := NULL;

    IF v_row.status IS NULL OR v_row.status NOT IN ('valid', 'warning') THEN
      v_error_reason := 'source_row_not_valid';
    ELSE
      v_item_code := pg_catalog.upper(pg_catalog.btrim(coalesce(v_row.data->>'item_code', v_row.canonical_key, '')));
      v_unit_code := pg_catalog.upper(pg_catalog.btrim(coalesce(v_row.data->>'unit_code', '')));
      v_unit_name := pg_catalog.btrim(coalesce(v_row.data->>'unit_name', ''));
      v_factor_text := pg_catalog.btrim(coalesce(v_row.data->>'conversion_factor', ''));
      v_base_flag := pg_catalog.lower(pg_catalog.btrim(coalesce(v_row.data->>'is_base_unit', '')));

      IF v_item_code = '' OR pg_catalog.length(v_item_code) > 100
         OR v_unit_code = '' OR pg_catalog.length(v_unit_code) > 80
         OR v_unit_name = '' OR pg_catalog.length(v_unit_name) > 40 THEN
        v_error_reason := 'product_code_unit_code_or_unit_name_missing_or_invalid';
      ELSIF v_factor_text = '' OR v_factor_text !~ '^[0-9]{1,7}([.]0+)?$' THEN
        v_error_reason := 'conversion_factor_must_be_a_positive_integer';
      ELSE
        v_factor := v_factor_text::numeric;
        IF v_base_flag IN ('true', '1', 'yes', 'y', 'نعم', 'نعم، وحدة أساسية') THEN
          v_is_base := true;
        ELSIF v_base_flag IN ('false', '0', 'no', 'n', 'لا', '') THEN
          v_is_base := false;
        ELSE
          v_error_reason := 'is_base_unit_flag_is_not_a_recognized_boolean';
        END IF;

        IF v_error_reason IS NULL THEN
          SELECT count(*)::integer,
                 (pg_catalog.array_agg(p.id ORDER BY p.id))[1],
                 (pg_catalog.array_agg(p.unit ORDER BY p.id))[1]
            INTO v_product_matches, v_product_id, v_base_unit
            FROM public.products p
           WHERE p.organization_id = v_org
             AND pg_catalog.upper(pg_catalog.btrim(p.item_code)) = v_item_code;
          IF coalesce(v_product_matches, 0) = 0 THEN
            v_error_reason := 'product_code_not_found_apply_products_snapshot_first';
          ELSIF v_product_matches <> 1 THEN
            v_error_reason := 'product_code_matches_multiple_products_in_organization';
          ELSIF pg_catalog.lower(v_unit_name) = pg_catalog.lower(pg_catalog.btrim(v_base_unit)) THEN
            IF v_factor = 1 THEN
              v_is_base := true;
            ELSE
              v_error_reason := 'base_unit_row_must_have_conversion_factor_one';
            END IF;
          ELSIF v_is_base THEN
            v_error_reason := 'declared_base_unit_does_not_match_product_base_unit';
          ELSIF v_factor < 2 OR v_factor > 1000000 OR v_factor <> pg_catalog.trunc(v_factor) THEN
            v_error_reason := 'alternate_unit_factor_must_be_an_integer_between_2_and_1000000';
          END IF;

          IF v_error_reason IS NULL AND v_is_base THEN
            v_base_rows_skipped := v_base_rows_skipped + 1;
          ELSIF v_error_reason IS NULL THEN
            v_source_key := v_product_id::text || ':' || v_unit_code;
            v_name_key := v_product_id::text || ':' || pg_catalog.lower(v_unit_name);

            IF v_source_key = ANY(v_seen_source_keys) THEN
              v_error_reason := 'duplicate_product_unit_code_in_source_workbook';
            ELSIF v_name_key = ANY(v_seen_unit_names) THEN
              v_error_reason := 'duplicate_product_unit_name_in_source_workbook';
            ELSE
              v_seen_source_keys := pg_catalog.array_append(v_seen_source_keys, v_source_key);
              v_seen_unit_names := pg_catalog.array_append(v_seen_unit_names, v_name_key);

              v_product_key := v_product_id::text;
              IF NOT (v_product_units ? v_product_key) THEN
                SELECT coalesce(
                  pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                      'unit_name', u.unit_name,
                      'base_units_per_unit', u.base_units_per_unit
                    ) ORDER BY pg_catalog.lower(u.unit_name)
                  ),
                  '[]'::jsonb
                )
                INTO v_merged
                FROM public.product_unit_conversions u
                WHERE u.organization_id = v_org AND u.product_id = v_product_id;
              ELSE
                v_merged := v_product_units->v_product_key;
              END IF;

              SELECT EXISTS (
                SELECT 1
                  FROM pg_catalog.jsonb_array_elements(v_merged) unit_row
                 WHERE pg_catalog.lower(unit_row->>'unit_name') = pg_catalog.lower(v_unit_name)
              ) INTO v_existing_name;

              v_existing_factor := NULL;
              IF v_existing_name THEN
                SELECT nullif(unit_row->>'base_units_per_unit', '')::integer
                  INTO v_existing_factor
                  FROM pg_catalog.jsonb_array_elements(v_merged) unit_row
                 WHERE pg_catalog.lower(unit_row->>'unit_name') = pg_catalog.lower(v_unit_name)
                 LIMIT 1;
                IF v_existing_factor = v_factor::integer THEN
                  v_units_unchanged := v_units_unchanged + 1;
                ELSE
                  v_units_updated := v_units_updated + 1;
                END IF;
              ELSE
                IF pg_catalog.jsonb_array_length(v_merged) >= 20 THEN
                  v_error_reason := 'product_already_has_twenty_alternate_units';
                ELSE
                  v_units_created := v_units_created + 1;
                END IF;
              END IF;

              IF v_error_reason IS NULL THEN
                SELECT coalesce(
                  pg_catalog.jsonb_agg(unit_row ORDER BY pg_catalog.lower(unit_row->>'unit_name')),
                  '[]'::jsonb
                )
                INTO v_merged
                FROM pg_catalog.jsonb_array_elements(v_merged) unit_row
                WHERE pg_catalog.lower(unit_row->>'unit_name') <> pg_catalog.lower(v_unit_name);

                v_merged := v_merged || pg_catalog.jsonb_build_array(
                  pg_catalog.jsonb_build_object(
                    'unit_name', v_unit_name,
                    'base_units_per_unit', v_factor::integer
                  )
                );
                v_product_units := pg_catalog.jsonb_set(
                  v_product_units,
                  ARRAY[v_product_key],
                  v_merged,
                  true
                );
                IF NOT (v_product_id = ANY(v_product_ids)) THEN
                  v_product_ids := pg_catalog.array_append(v_product_ids, v_product_id);
                END IF;
                v_rows_applied := v_rows_applied + 1;

                IF nullif(pg_catalog.btrim(coalesce(v_row.data->>'unit_cost_price', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'unit_selling_price', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'barcode', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'sales_allowed', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'purchase_allowed', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'default_sales_unit', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'default_purchase_unit', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'unit_name_en', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'is_active', '')), '') IS NOT NULL THEN
                  v_metadata_pending := v_metadata_pending + 1;
                  IF pg_catalog.jsonb_array_length(v_errors) < 50 THEN
                    v_errors := v_errors || pg_catalog.jsonb_build_array(
                      pg_catalog.jsonb_build_object(
                        'row_number', v_row.row_number,
                        'reason', 'unit_conversion_applied_but_source_price_barcode_and_usage_flags_remain_review_only'
                      )
                    );
                  END IF;
                END IF;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_error_reason IS NOT NULL THEN
      v_rejected := v_rejected + 1;
      IF pg_catalog.jsonb_array_length(v_errors) < 50 THEN
        v_errors := v_errors || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'row_number', v_row.row_number,
            'reason', v_error_reason
          )
        );
      END IF;
    END IF;
  END LOOP;

  IF v_rows_applied = 0 AND v_base_rows_skipped = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'no valid ProductUnits rows matched active products; approve Products first and correct the rejected rows';
  END IF;

  FOREACH v_product_id IN ARRAY v_product_ids LOOP
    PERFORM public.save_product_unit_conversions(v_product_id, v_product_units->v_product_id::text);
  END LOOP;

  v_result := pg_catalog.jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'status', 'applied',
    'source_rows', v_row_count,
    'product_count', pg_catalog.cardinality(v_product_ids),
    'unit_rows_applied', v_rows_applied,
    'units_created', v_units_created,
    'units_updated', v_units_updated,
    'units_unchanged', v_units_unchanged,
    'base_unit_rows_skipped', v_base_rows_skipped,
    'metadata_rows_pending_review', v_metadata_pending,
    'rejected', v_rejected,
    'row_errors_truncated', v_rejected + v_metadata_pending > pg_catalog.jsonb_array_length(v_errors),
    'row_errors', v_errors,
    'idempotent_replay', false
  );

  INSERT INTO public.onyx_product_unit_import_applications (
    organization_id, snapshot_id, source_import_job_id, created_by, result
  ) VALUES (
    v_org, p_snapshot_id, v_snapshot.source_import_job_id, v_actor, v_result
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_actor, 'catalog.product_units_imported', 'onyx_snapshot', p_snapshot_id, '{}'::jsonb, v_result
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_onyx_product_unit_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_onyx_product_unit_snapshot(uuid) TO authenticated;

COMMENT ON FUNCTION public.ensure_onyx_product_unit_import_profile() IS
  'Creates an organization-scoped immutable Onyx ProductUnits import profile; it stages conversion rows only.';
COMMENT ON FUNCTION public.apply_onyx_product_unit_snapshot(uuid) IS
  'Applies ready ProductUnits snapshots with strict product resolution, integer conversion validation, merge-preservation of existing alternate units, replay protection and audit history. Source unit pricing/barcodes/usage flags remain review-only.';

COMMIT;
 THEN
        v_error_reason := 'conversion_factor_must_be_a_positive_integer';
      ELSE
        v_factor := v_factor_text::numeric;
        IF v_base_flag IN ('true', '1', 'yes', 'y', 'نعم', 'نعم، وحدة أساسية') THEN
          v_is_base := true;
        ELSIF v_base_flag IN ('false', '0', 'no', 'n', 'لا', '') THEN
          v_is_base := false;
        ELSE
          v_error_reason := 'is_base_unit_flag_is_not_a_recognized_boolean';
        END IF;

        IF v_error_reason IS NULL THEN
          SELECT count(*)::integer,
                 (pg_catalog.array_agg(p.id ORDER BY p.id))[1],
                 (pg_catalog.array_agg(p.unit ORDER BY p.id))[1]
            INTO v_product_matches, v_product_id, v_base_unit
            FROM public.products p
           WHERE p.organization_id = v_org
             AND pg_catalog.upper(pg_catalog.btrim(p.item_code)) = v_item_code;
          IF coalesce(v_product_matches, 0) = 0 THEN
            v_error_reason := 'product_code_not_found_apply_products_snapshot_first';
          ELSIF v_product_matches <> 1 THEN
            v_error_reason := 'product_code_matches_multiple_products_in_organization';
          ELSIF pg_catalog.lower(v_unit_name) = pg_catalog.lower(pg_catalog.btrim(v_base_unit)) THEN
            IF v_factor = 1 THEN
              v_is_base := true;
            ELSE
              v_error_reason := 'base_unit_row_must_have_conversion_factor_one';
            END IF;
          ELSIF v_is_base THEN
            v_error_reason := 'declared_base_unit_does_not_match_product_base_unit';
          ELSIF v_factor < 2 OR v_factor > 1000000 OR v_factor <> pg_catalog.trunc(v_factor) THEN
            v_error_reason := 'alternate_unit_factor_must_be_an_integer_between_2_and_1000000';
          END IF;

          IF v_error_reason IS NULL AND v_is_base THEN
            v_base_rows_skipped := v_base_rows_skipped + 1;
          ELSIF v_error_reason IS NULL THEN
            v_source_key := v_product_id::text || ':' || v_unit_code;
            v_name_key := v_product_id::text || ':' || pg_catalog.lower(v_unit_name);

            IF v_source_key = ANY(v_seen_source_keys) THEN
              v_error_reason := 'duplicate_product_unit_code_in_source_workbook';
            ELSIF v_name_key = ANY(v_seen_unit_names) THEN
              v_error_reason := 'duplicate_product_unit_name_in_source_workbook';
            ELSE
              v_seen_source_keys := pg_catalog.array_append(v_seen_source_keys, v_source_key);
              v_seen_unit_names := pg_catalog.array_append(v_seen_unit_names, v_name_key);

              v_product_key := v_product_id::text;
              IF NOT (v_product_units ? v_product_key) THEN
                SELECT coalesce(
                  pg_catalog.jsonb_agg(
                    pg_catalog.jsonb_build_object(
                      'unit_name', u.unit_name,
                      'base_units_per_unit', u.base_units_per_unit
                    ) ORDER BY pg_catalog.lower(u.unit_name)
                  ),
                  '[]'::jsonb
                )
                INTO v_merged
                FROM public.product_unit_conversions u
                WHERE u.organization_id = v_org AND u.product_id = v_product_id;
              ELSE
                v_merged := v_product_units->v_product_key;
              END IF;

              SELECT EXISTS (
                SELECT 1
                  FROM pg_catalog.jsonb_array_elements(v_merged) unit_row
                 WHERE pg_catalog.lower(unit_row->>'unit_name') = pg_catalog.lower(v_unit_name)
              ) INTO v_existing_name;

              IF v_existing_name THEN
                v_units_updated := v_units_updated + 1;
              ELSE
                IF pg_catalog.jsonb_array_length(v_merged) >= 20 THEN
                  v_error_reason := 'product_already_has_twenty_alternate_units';
                ELSE
                  v_units_created := v_units_created + 1;
                END IF;
              END IF;

              IF v_error_reason IS NULL THEN
                SELECT coalesce(
                  pg_catalog.jsonb_agg(unit_row ORDER BY pg_catalog.lower(unit_row->>'unit_name')),
                  '[]'::jsonb
                )
                INTO v_merged
                FROM pg_catalog.jsonb_array_elements(v_merged) unit_row
                WHERE pg_catalog.lower(unit_row->>'unit_name') <> pg_catalog.lower(v_unit_name);

                v_merged := v_merged || pg_catalog.jsonb_build_array(
                  pg_catalog.jsonb_build_object(
                    'unit_name', v_unit_name,
                    'base_units_per_unit', v_factor::integer
                  )
                );
                v_product_units := pg_catalog.jsonb_set(
                  v_product_units,
                  ARRAY[v_product_key],
                  v_merged,
                  true
                );
                IF NOT (v_product_id = ANY(v_product_ids)) THEN
                  v_product_ids := pg_catalog.array_append(v_product_ids, v_product_id);
                END IF;
                v_rows_applied := v_rows_applied + 1;

                IF nullif(pg_catalog.btrim(coalesce(v_row.data->>'unit_cost_price', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'unit_selling_price', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'barcode', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'sales_allowed', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'purchase_allowed', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'default_sales_unit', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'default_purchase_unit', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'unit_name_en', '')), '') IS NOT NULL
                   OR nullif(pg_catalog.btrim(coalesce(v_row.data->>'is_active', '')), '') IS NOT NULL THEN
                  v_metadata_pending := v_metadata_pending + 1;
                  IF pg_catalog.jsonb_array_length(v_errors) < 50 THEN
                    v_errors := v_errors || pg_catalog.jsonb_build_array(
                      pg_catalog.jsonb_build_object(
                        'row_number', v_row.row_number,
                        'reason', 'unit_conversion_applied_but_source_price_barcode_and_usage_flags_remain_review_only'
                      )
                    );
                  END IF;
                END IF;
              END IF;
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;

    IF v_error_reason IS NOT NULL THEN
      v_rejected := v_rejected + 1;
      IF pg_catalog.jsonb_array_length(v_errors) < 50 THEN
        v_errors := v_errors || pg_catalog.jsonb_build_array(
          pg_catalog.jsonb_build_object(
            'row_number', v_row.row_number,
            'reason', v_error_reason
          )
        );
      END IF;
    END IF;
  END LOOP;

  IF v_rows_applied = 0 AND v_base_rows_skipped = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'no valid ProductUnits rows matched active products; approve Products first and correct the rejected rows';
  END IF;

  FOREACH v_product_id IN ARRAY v_product_ids LOOP
    PERFORM public.save_product_unit_conversions(v_product_id, v_product_units->v_product_id::text);
  END LOOP;

  v_result := pg_catalog.jsonb_build_object(
    'snapshot_id', p_snapshot_id,
    'status', 'applied',
    'source_rows', v_row_count,
    'product_count', pg_catalog.cardinality(v_product_ids),
    'unit_rows_applied', v_rows_applied,
    'units_created', v_units_created,
    'units_updated', v_units_updated,
    'base_unit_rows_skipped', v_base_rows_skipped,
    'metadata_rows_pending_review', v_metadata_pending,
    'rejected', v_rejected,
    'row_errors_truncated', v_rejected + v_metadata_pending > pg_catalog.jsonb_array_length(v_errors),
    'row_errors', v_errors,
    'idempotent_replay', false
  );

  INSERT INTO public.onyx_product_unit_import_applications (
    organization_id, snapshot_id, source_import_job_id, created_by, result
  ) VALUES (
    v_org, p_snapshot_id, v_snapshot.source_import_job_id, v_actor, v_result
  );

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_actor, 'catalog.product_units_imported', 'onyx_snapshot', p_snapshot_id, '{}'::jsonb, v_result
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.apply_onyx_product_unit_snapshot(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_onyx_product_unit_snapshot(uuid) TO authenticated;

COMMENT ON FUNCTION public.ensure_onyx_product_unit_import_profile() IS
  'Creates an organization-scoped immutable Onyx ProductUnits import profile; it stages conversion rows only.';
COMMENT ON FUNCTION public.apply_onyx_product_unit_snapshot(uuid) IS
  'Applies ready ProductUnits snapshots with strict product resolution, integer conversion validation, merge-preservation of existing alternate units, replay protection and audit history. Source unit pricing/barcodes/usage flags remain review-only.';

COMMIT;
