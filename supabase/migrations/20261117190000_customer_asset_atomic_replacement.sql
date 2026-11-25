BEGIN;

-- A replacement request is one durable operation, not an unlinked status event.
-- The request key is recorded on the immutable event so ambiguous network retries
-- return the original replacement pair instead of creating a second device.
CREATE UNIQUE INDEX IF NOT EXISTS customer_asset_replacement_request_key_unique
  ON public.customer_asset_events (organization_id, (metadata ->> 'request_key'))
  WHERE event_type = 'replacement'
    AND nullif(metadata ->> 'request_key', '') IS NOT NULL;

CREATE OR REPLACE FUNCTION public.replace_customer_asset(
  p_old_asset_id uuid,
  p_request_key text,
  p_asset_name text,
  p_reason text,
  p_product_id uuid DEFAULT NULL,
  p_source_order_id uuid DEFAULT NULL,
  p_source_invoice_id uuid DEFAULT NULL,
  p_manufacturer text DEFAULT NULL,
  p_model text DEFAULT NULL,
  p_serial_number text DEFAULT NULL,
  p_purchase_date date DEFAULT NULL,
  p_purchase_evidence_note text DEFAULT NULL,
  p_warranty_provider text DEFAULT NULL,
  p_warranty_reference text DEFAULT NULL,
  p_warranty_evidence_note text DEFAULT NULL,
  p_warranty_start_date date DEFAULT NULL,
  p_warranty_end_date date DEFAULT NULL,
  p_coverage_reference text DEFAULT NULL,
  p_coverage_start_date date DEFAULT NULL,
  p_coverage_end_date date DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_old public.customer_assets%ROWTYPE;
  v_replay public.customer_asset_events%ROWTYPE;
  v_created jsonb;
  v_new_asset_id uuid;
  v_fingerprint text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_customer_asset_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'customer asset management permission is required';
  END IF;

  IF p_old_asset_id IS NULL
     OR p_request_key IS NULL
     OR btrim(p_request_key) !~ '^[A-Za-z0-9_-]{16,128}$'
     OR p_asset_name IS NULL
     OR length(btrim(p_asset_name)) NOT BETWEEN 2 AND 180
     OR p_reason IS NULL
     OR length(btrim(p_reason)) NOT BETWEEN 5 AND 1000
     OR (p_metadata IS NOT NULL AND
         (jsonb_typeof(p_metadata) <> 'object' OR octet_length(p_metadata::text) > 8000)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'customer asset replacement request is invalid';
  END IF;

  v_fingerprint := md5(jsonb_build_object(
    'old_asset_id', p_old_asset_id,
    'asset_name', btrim(p_asset_name),
    'reason', btrim(p_reason),
    'product_id', p_product_id,
    'source_order_id', p_source_order_id,
    'source_invoice_id', p_source_invoice_id,
    'manufacturer', nullif(btrim(p_manufacturer), ''),
    'model', nullif(btrim(p_model), ''),
    'serial_number', nullif(btrim(p_serial_number), ''),
    'purchase_date', p_purchase_date,
    'purchase_evidence_note', nullif(btrim(p_purchase_evidence_note), ''),
    'warranty_provider', nullif(btrim(p_warranty_provider), ''),
    'warranty_reference', nullif(btrim(p_warranty_reference), ''),
    'warranty_evidence_note', nullif(btrim(p_warranty_evidence_note), ''),
    'warranty_start_date', p_warranty_start_date,
    'warranty_end_date', p_warranty_end_date,
    'coverage_reference', nullif(btrim(p_coverage_reference), ''),
    'coverage_start_date', p_coverage_start_date,
    'coverage_end_date', p_coverage_end_date,
    'notes', nullif(btrim(p_notes), ''),
    'metadata', coalesce(p_metadata, '{}'::jsonb)
  )::text);

  -- Serialize the same key within the tenant before checking for a prior commit.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_org::text || ':' || btrim(p_request_key), 0));

  SELECT e.* INTO v_replay
  FROM public.customer_asset_events e
  WHERE e.organization_id = v_org
    AND e.event_type = 'replacement'
    AND e.metadata ->> 'request_key' = btrim(p_request_key)
  LIMIT 1;

  IF FOUND THEN
    IF v_replay.metadata ->> 'request_fingerprint' IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'replacement request key was already used with different device details';
    END IF;
    v_new_asset_id := nullif(v_replay.metadata ->> 'new_asset_id', '')::uuid;
    IF v_new_asset_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.customer_assets a
      WHERE a.id = v_new_asset_id AND a.organization_id = v_org
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '55000',
        MESSAGE = 'the previously created replacement asset is unavailable';
    END IF;
    RETURN jsonb_build_object(
      'old_asset_id', v_replay.asset_id,
      'new_asset_id', v_new_asset_id,
      'status', 'replaced',
      'replayed', true
    );
  END IF;

  SELECT a.* INTO v_old
  FROM public.customer_assets a
  WHERE a.id = p_old_asset_id
    AND a.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'customer asset is unavailable for the active organization';
  END IF;

  IF v_old.status NOT IN ('active', 'under_maintenance', 'under_repair') THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'only an active, maintained or repaired asset can be replaced';
  END IF;

  -- Reuse the established tenant/source/evidence validation for the new asset.
  -- Any failure rolls back this entire RPC, including the old asset status change.
  v_created := public.create_customer_asset(
    p_customer_id => v_old.customer_id,
    p_asset_name => btrim(p_asset_name),
    p_reason => 'تسجيل جهاز بديل للأصل السابق',
    p_product_id => p_product_id,
    p_source_order_id => p_source_order_id,
    p_source_invoice_id => p_source_invoice_id,
    p_manufacturer => p_manufacturer,
    p_model => p_model,
    p_serial_number => p_serial_number,
    p_purchase_date => p_purchase_date,
    p_purchase_evidence_note => p_purchase_evidence_note,
    p_warranty_provider => p_warranty_provider,
    p_warranty_reference => p_warranty_reference,
    p_warranty_evidence_note => p_warranty_evidence_note,
    p_warranty_start_date => p_warranty_start_date,
    p_warranty_end_date => p_warranty_end_date,
    p_coverage_reference => p_coverage_reference,
    p_coverage_start_date => p_coverage_start_date,
    p_coverage_end_date => p_coverage_end_date,
    p_notes => p_notes,
    p_metadata => coalesce(p_metadata, '{}'::jsonb) ||
      jsonb_build_object('replacement_of_asset_id', v_old.id)
  );
  v_new_asset_id := nullif(v_created ->> 'asset_id', '')::uuid;

  IF v_new_asset_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000',
      MESSAGE = 'the replacement asset was not created';
  END IF;

  UPDATE public.customer_assets
  SET status = 'replaced', updated_by = v_actor, updated_at = now()
  WHERE id = v_old.id AND organization_id = v_org;

  INSERT INTO public.customer_asset_events(
    organization_id, asset_id, event_type, previous_customer_id, new_customer_id,
    old_status, new_status, summary, reason, details, metadata, actor_profile_id
  )
  VALUES(
    v_org, v_old.id, 'replacement', NULL, NULL,
    v_old.status, 'replaced', 'استبدال الجهاز وربط الأصل البديل',
    btrim(p_reason),
    'الأصل البديل: ' || btrim(p_asset_name) || ' · المعرّف: ' || v_new_asset_id::text,
    jsonb_build_object(
      'request_key', btrim(p_request_key),
      'request_fingerprint', v_fingerprint,
      'new_asset_id', v_new_asset_id,
      'replacement_flow_version', 1
    ),
    v_actor
  );

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  )
  VALUES(
    v_org, v_actor, 'customer_asset.replacement', 'customer_asset', v_old.id,
    jsonb_build_object('status', v_old.status, 'asset_name', v_old.asset_name),
    jsonb_build_object('status', 'replaced', 'replacement_asset_id', v_new_asset_id)
  );

  RETURN jsonb_build_object(
    'old_asset_id', v_old.id,
    'new_asset_id', v_new_asset_id,
    'status', 'replaced',
    'replayed', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.replace_customer_asset(
  uuid,text,text,text,uuid,uuid,uuid,text,text,text,date,text,text,text,text,date,date,text,date,date,text,jsonb
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.replace_customer_asset(
  uuid,text,text,text,uuid,uuid,uuid,text,text,text,date,text,text,text,text,date,date,text,date,date,text,jsonb
) TO authenticated;


-- Replacement is a linked lifecycle operation, never a generic status event.
-- This trigger makes the UI rule authoritative even when an authenticated caller
-- invokes record_customer_asset_event('replacement') directly.
CREATE OR REPLACE FUNCTION public.guard_customer_asset_replacement_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_new_asset_id uuid;
BEGIN
  IF NEW.event_type IS DISTINCT FROM 'replacement' THEN
    RETURN NEW;
  END IF;

  IF NEW.metadata IS NULL
     OR pg_catalog.jsonb_typeof(NEW.metadata) IS DISTINCT FROM 'object'
     OR pg_catalog.char_length(coalesce(NEW.metadata ->> 'request_key', '')) NOT BETWEEN 16 AND 128
     OR coalesce(NEW.metadata ->> 'request_key', '') ~ '[^A-Za-z0-9_-]'
     OR pg_catalog.char_length(coalesce(NEW.metadata ->> 'request_fingerprint', '')) <> 32
     OR coalesce(NEW.metadata ->> 'request_fingerprint', '') ~ '[^0-9a-f]'
     OR pg_catalog.char_length(coalesce(NEW.metadata ->> 'new_asset_id', '')) <> 36
     OR coalesce(NEW.metadata ->> 'new_asset_id', '') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'
     OR NEW.old_status IS NULL
     OR NEW.old_status NOT IN ('active', 'under_maintenance', 'under_repair')
     OR NEW.new_status IS DISTINCT FROM 'replaced'
     OR NEW.actor_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'replacement events must be created by the atomic linked replacement operation';
  END IF;

  v_new_asset_id := (NEW.metadata ->> 'new_asset_id')::uuid;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customer_assets old_asset
    JOIN public.customer_assets new_asset
      ON new_asset.id = v_new_asset_id
     AND new_asset.organization_id = old_asset.organization_id
     AND new_asset.customer_id = old_asset.customer_id
    WHERE old_asset.id = NEW.asset_id
      AND old_asset.organization_id = NEW.organization_id
      AND old_asset.status = 'replaced'
      AND new_asset.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'replacement event must link an active new asset to the replaced asset of the same customer';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_customer_asset_replacement_event()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_asset_replacement_event_guard ON public.customer_asset_events;
CREATE TRIGGER customer_asset_replacement_event_guard
  BEFORE INSERT ON public.customer_asset_events
  FOR EACH ROW
  WHEN (NEW.event_type = 'replacement')
  EXECUTE FUNCTION public.guard_customer_asset_replacement_event();


COMMIT;
