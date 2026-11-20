-- NASR1-ORIGINAL-SPEC-ONYX-INVENTORY-RECONCILIATION-005
-- Target-native preview/apply/compensating rollback for a warehouse-scoped Onyx snapshot.
-- Never copy the donor schema: the source here is onyx_snapshots/onyx_snapshot_rows and
-- the stock authority is inventory_balances plus inventory_movements.

CREATE TABLE IF NOT EXISTS public.onyx_inventory_reconciliation_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL REFERENCES public.onyx_snapshots(id) ON DELETE RESTRICT,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'previewed' CHECK (status IN ('previewed','applied','rolled_back','cancelled')),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  apply_idempotency_key text CHECK (apply_idempotency_key IS NULL OR apply_idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  rollback_idempotency_key text CHECK (rollback_idempotency_key IS NULL OR rollback_idempotency_key ~ '^[A-Za-z0-9_-]{16,128}$'),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  snapshot_source_hash text NOT NULL,
  snapshot_report_type text NOT NULL,
  snapshot_metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_row_count integer NOT NULL CHECK (snapshot_row_count > 0),
  source_row_count integer NOT NULL DEFAULT 0 CHECK (source_row_count >= 0),
  adjusted_lines integer NOT NULL DEFAULT 0 CHECK (adjusted_lines >= 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  applied_at timestamptz,
  rolled_back_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rolled_back_at timestamptz,
  rollback_reason text CHECK (rollback_reason IS NULL OR char_length(rollback_reason) BETWEEN 1 AND 1000),
  CONSTRAINT onyx_inventory_reconciliation_org_idempotency_unique UNIQUE (organization_id,idempotency_key),
  CONSTRAINT onyx_inventory_reconciliation_terminal_state CHECK (
    (status='previewed' AND applied_at IS NULL AND rolled_back_at IS NULL)
    OR (status='applied' AND applied_at IS NOT NULL AND rolled_back_at IS NULL)
    OR (status='rolled_back' AND applied_at IS NOT NULL AND rolled_back_at IS NOT NULL)
    OR (status='cancelled' AND rolled_back_at IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS onyx_inventory_reconciliation_org_created_idx
  ON public.onyx_inventory_reconciliation_commands(organization_id,created_at DESC);
CREATE INDEX IF NOT EXISTS onyx_inventory_reconciliation_snapshot_idx
  ON public.onyx_inventory_reconciliation_commands(organization_id,snapshot_id,created_at DESC);

CREATE TABLE IF NOT EXISTS public.onyx_inventory_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  command_id uuid NOT NULL REFERENCES public.onyx_inventory_reconciliation_commands(id) ON DELETE RESTRICT,
  snapshot_row_id uuid NOT NULL REFERENCES public.onyx_snapshot_rows(id) ON DELETE RESTRICT,
  source_row_hash text NOT NULL,
  item_code text NOT NULL CHECK (char_length(item_code) BETWEEN 1 AND 200),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  source_quantity numeric(15,3) NOT NULL CHECK (source_quantity >= 0),
  baseline_balance_exists boolean NOT NULL,
  baseline_quantity_on_hand numeric(15,3) NOT NULL CHECK (baseline_quantity_on_hand >= 0),
  baseline_quantity_reserved numeric(15,3) NOT NULL CHECK (baseline_quantity_reserved >= 0),
  baseline_last_movement_at timestamptz,
  baseline_updated_at timestamptz,
  baseline_movement_count bigint NOT NULL CHECK (baseline_movement_count >= 0),
  baseline_latest_movement_at timestamptz,
  applied_delta numeric(15,3),
  applied_quantity_on_hand numeric(15,3),
  applied_quantity_reserved numeric(15,3),
  applied_last_movement_at timestamptz,
  applied_updated_at timestamptz,
  applied_movement_id uuid,
  applied_movement_created_at timestamptz,
  rollback_movement_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  rolled_back_at timestamptz,
  CONSTRAINT onyx_inventory_reconciliation_command_product_unique UNIQUE(command_id,product_id),
  CONSTRAINT onyx_inventory_reconciliation_command_row_unique UNIQUE(command_id,snapshot_row_id)
);
CREATE INDEX IF NOT EXISTS onyx_inventory_reconciliation_items_command_product_idx
  ON public.onyx_inventory_reconciliation_items(command_id,product_id);

ALTER TABLE public.onyx_inventory_reconciliation_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onyx_inventory_reconciliation_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.onyx_inventory_reconciliation_commands FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.onyx_inventory_reconciliation_items FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.onyx_inventory_reconciliation_commands TO service_role;
GRANT ALL ON TABLE public.onyx_inventory_reconciliation_items TO service_role;

CREATE OR REPLACE FUNCTION public.get_onyx_reconciliation_warehouses()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid; v_result jsonb;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff organization required to read reconciliation warehouses';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,'code',w.code) ORDER BY w.name,w.id),'[]'::jsonb)
    INTO v_result FROM public.warehouses w
   WHERE w.organization_id=v_org AND w.is_active;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_onyx_reconciliation_warehouses() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_onyx_reconciliation_warehouses() TO authenticated;

CREATE OR REPLACE FUNCTION public.preview_onyx_inventory_reconciliation(
  p_snapshot_id uuid,
  p_warehouse_id uuid,
  p_idempotency_key text,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_snapshot public.onyx_snapshots%ROWTYPE;
  v_warehouse public.warehouses%ROWTYPE;
  v_existing public.onyx_inventory_reconciliation_commands%ROWTYPE;
  v_command public.onyx_inventory_reconciliation_commands%ROWTYPE;
  v_source public.onyx_snapshot_rows%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_key text:=pg_catalog.btrim(COALESCE(p_idempotency_key,''));
  v_reason text:=NULLIF(pg_catalog.btrim(COALESCE(p_reason,'')),'');
  v_code text;
  v_quantity_text text;
  v_quantity numeric(15,3);
  v_balance_exists boolean;
  v_on_hand numeric(15,3);
  v_reserved numeric(15,3);
  v_last_movement_at timestamptz;
  v_updated_at timestamptz;
  v_movement_count bigint;
  v_latest_movement_at timestamptz;
  v_snapshot_actual_rows integer;
  v_unscoped_rows integer;
  v_selected_rows integer:=0;
  v_has_metadata_scope boolean;
  v_has_row_scope boolean;
  v_row_matches boolean;
  v_seen_codes text[]:=ARRAY[]::text[];
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='administrator or manager permission required to preview Onyx stock reconciliation';
  END IF;
  IF p_snapshot_id IS NULL OR p_warehouse_id IS NULL
     OR v_key !~ '^[A-Za-z0-9_-]{16,128}$'
     OR v_reason IS NULL OR pg_catalog.char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='snapshot, warehouse, valid idempotency key, and a reason are required';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_org::text||':onyx-reconcile-preview:'||v_key,0));
  SELECT c.* INTO v_existing FROM public.onyx_inventory_reconciliation_commands c
   WHERE c.organization_id=v_org AND c.idempotency_key=v_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.snapshot_id IS DISTINCT FROM p_snapshot_id
       OR v_existing.warehouse_id IS DISTINCT FROM p_warehouse_id
       OR v_existing.reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='idempotency key was reused with a different Onyx reconciliation payload';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'command_id',v_existing.id,'snapshot_id',v_existing.snapshot_id,'warehouse_id',v_existing.warehouse_id,
      'status',v_existing.status,'source_row_count',v_existing.source_row_count,'adjusted_lines',v_existing.adjusted_lines,
      'created_at',v_existing.created_at,'applied_at',v_existing.applied_at,'rolled_back_at',v_existing.rolled_back_at,
      'idempotent_replay',true
    );
  END IF;

  SELECT w.* INTO v_warehouse FROM public.warehouses w
   WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active warehouse is unavailable in the current organization';
  END IF;
  SELECT s.* INTO v_snapshot FROM public.onyx_snapshots s
   WHERE s.id=p_snapshot_id AND s.organization_id=v_org AND s.status='ready' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='ready Onyx snapshot is unavailable in the current organization';
  END IF;
  SELECT pg_catalog.count(*)::integer INTO v_snapshot_actual_rows
    FROM public.onyx_snapshot_rows r WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org;
  IF v_snapshot_actual_rows<1 OR v_snapshot_actual_rows IS DISTINCT FROM v_snapshot.row_count THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx snapshot row count does not match its stored source manifest';
  END IF;
  IF v_snapshot.report_type !~* '(inventory|stock|مخزون|رصيد)' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only an inventory/stock Onyx snapshot can change stock balances';
  END IF;

  v_has_metadata_scope :=
    NULLIF(pg_catalog.btrim(COALESCE(v_snapshot.metrics->>'warehouse_id','')),'') IS NOT NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(v_snapshot.metrics->>'warehouse_code','')),'') IS NOT NULL
    OR NULLIF(pg_catalog.btrim(COALESCE(v_snapshot.metrics->>'warehouse_name','')),'') IS NOT NULL;
  IF v_has_metadata_scope THEN
    IF (NULLIF(pg_catalog.btrim(COALESCE(v_snapshot.metrics->>'warehouse_id','')),'') IS NOT NULL
        AND v_snapshot.metrics->>'warehouse_id' IS DISTINCT FROM v_warehouse.id::text)
       OR (NULLIF(pg_catalog.btrim(COALESCE(v_snapshot.metrics->>'warehouse_code','')),'') IS NOT NULL
        AND v_snapshot.metrics->>'warehouse_code' IS DISTINCT FROM v_warehouse.code)
       OR (NULLIF(pg_catalog.btrim(COALESCE(v_snapshot.metrics->>'warehouse_name','')),'') IS NOT NULL
        AND pg_catalog.lower(pg_catalog.btrim(v_snapshot.metrics->>'warehouse_name')) IS DISTINCT FROM pg_catalog.lower(v_warehouse.name)) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx snapshot warehouse metadata does not match the selected warehouse';
    END IF;
  ELSE
    SELECT pg_catalog.count(*) FILTER (WHERE
      NULLIF(pg_catalog.btrim(COALESCE(r.data->>'warehouse_id','')),'') IS NULL
      AND NULLIF(pg_catalog.btrim(COALESCE(r.data->>'warehouse_code','')),'') IS NULL
      AND NULLIF(pg_catalog.btrim(COALESCE(r.data->>'warehouse_name','')),'') IS NULL)::integer
      INTO v_unscoped_rows
      FROM public.onyx_snapshot_rows r WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org;
    IF COALESCE(v_unscoped_rows,0)>0 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx source is not warehouse-scoped; aggregate stock cannot be assigned safely to one warehouse';
    END IF;
  END IF;

  INSERT INTO public.onyx_inventory_reconciliation_commands(
    organization_id,snapshot_id,warehouse_id,status,idempotency_key,reason,
    snapshot_source_hash,snapshot_report_type,snapshot_metrics,snapshot_row_count,created_by
  ) VALUES(v_org,v_snapshot.id,v_warehouse.id,'previewed',v_key,v_reason,
    v_snapshot.source_file_hash,v_snapshot.report_type,v_snapshot.metrics,v_snapshot_actual_rows,v_actor)
  RETURNING * INTO v_command;

  FOR v_source IN
    SELECT r.* FROM public.onyx_snapshot_rows r
     WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org
     ORDER BY r.row_number,r.id
  LOOP
    v_has_row_scope :=
      NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_id','')),'') IS NOT NULL
      OR NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_code','')),'') IS NOT NULL
      OR NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_name','')),'') IS NOT NULL;

    IF v_has_metadata_scope THEN
      IF v_has_row_scope AND (
        (NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_id','')),'') IS NOT NULL AND v_source.data->>'warehouse_id' IS DISTINCT FROM v_warehouse.id::text)
        OR (NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_code','')),'') IS NOT NULL AND v_source.data->>'warehouse_code' IS DISTINCT FROM v_warehouse.code)
        OR (NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_name','')),'') IS NOT NULL AND pg_catalog.lower(pg_catalog.btrim(v_source.data->>'warehouse_name')) IS DISTINCT FROM pg_catalog.lower(v_warehouse.name))
      ) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx snapshot metadata conflicts with a source row warehouse marker';
      END IF;
      v_row_matches:=true;
    ELSE
      v_row_matches:=v_has_row_scope
        AND (NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_id','')),'') IS NULL OR v_source.data->>'warehouse_id'=v_warehouse.id::text)
        AND (NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_code','')),'') IS NULL OR (v_warehouse.code IS NOT NULL AND v_source.data->>'warehouse_code'=v_warehouse.code))
        AND (NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'warehouse_name','')),'') IS NULL OR pg_catalog.lower(pg_catalog.btrim(v_source.data->>'warehouse_name'))=pg_catalog.lower(v_warehouse.name));
      IF v_row_matches IS DISTINCT FROM true THEN CONTINUE; END IF;
    END IF;

    IF v_source.status NOT IN ('valid','warning') THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='selected Onyx warehouse contains a row that is not valid for stock reconciliation';
    END IF;
    v_code:=NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'item_code',v_source.canonical_key,'')),'');
    v_quantity_text:=NULLIF(pg_catalog.btrim(COALESCE(v_source.data->>'quantity','')),'');
    IF v_code IS NULL OR pg_catalog.char_length(v_code)>200 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx stock row is missing a bounded canonical item_code';
    END IF;
    IF v_quantity_text IS NULL OR v_quantity_text !~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,3})?$' THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx stock quantity must be a non-negative decimal with at most three fractional digits';
    END IF;
    v_quantity:=v_quantity_text::numeric(15,3);
    IF v_code=ANY(v_seen_codes) THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='duplicate item_code exists in the selected Onyx warehouse rows';
    END IF;
    v_seen_codes:=pg_catalog.array_append(v_seen_codes,v_code);

    SELECT p.* INTO v_product FROM public.products p
     WHERE p.organization_id=v_org AND p.item_code=v_code AND p.status='active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx item_code does not resolve to one active product in the current organization';
    END IF;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
     WHERE ib.product_id=v_product.id AND ib.warehouse_id=v_warehouse.id;
    v_balance_exists:=FOUND;
    IF v_balance_exists THEN
      v_on_hand:=v_balance.quantity_on_hand;
      v_reserved:=v_balance.quantity_reserved;
      v_last_movement_at:=v_balance.last_movement_at;
      v_updated_at:=v_balance.updated_at;
    ELSE
      v_on_hand:=0;
      v_reserved:=0;
      v_last_movement_at:=NULL;
      v_updated_at:=NULL;
    END IF;
    SELECT pg_catalog.count(*)::bigint,pg_catalog.max(m.created_at)
      INTO v_movement_count,v_latest_movement_at
      FROM public.inventory_movements m
     WHERE m.product_id=v_product.id AND m.warehouse_id=v_warehouse.id;
    IF NOT v_balance_exists AND v_movement_count>0 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='stock balance is missing while movement history exists; manual review is required';
    END IF;
    IF v_quantity<v_reserved THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx target stock is below currently reserved quantity';
    END IF;
    INSERT INTO public.onyx_inventory_reconciliation_items(
      organization_id,command_id,snapshot_row_id,source_row_hash,item_code,product_id,source_quantity,
      baseline_balance_exists,baseline_quantity_on_hand,baseline_quantity_reserved,
      baseline_last_movement_at,baseline_updated_at,baseline_movement_count,baseline_latest_movement_at
    ) VALUES(v_org,v_command.id,v_source.id,v_source.row_hash,v_code,v_product.id,v_quantity,
      v_balance_exists,v_on_hand,v_reserved,v_last_movement_at,v_updated_at,v_movement_count,v_latest_movement_at);
    v_selected_rows:=v_selected_rows+1;
    IF v_selected_rows>5000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx reconciliation is limited to 5000 source rows per command';
    END IF;
  END LOOP;

  IF v_selected_rows=0 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='no valid Onyx rows could be proven to belong to the selected warehouse';
  END IF;
  UPDATE public.onyx_inventory_reconciliation_commands
     SET source_row_count=v_selected_rows WHERE id=v_command.id;
  RETURN pg_catalog.jsonb_build_object(
    'command_id',v_command.id,'snapshot_id',v_snapshot.id,'warehouse_id',v_warehouse.id,
    'status','previewed','source_row_count',v_selected_rows,'adjusted_lines',0,
    'created_at',v_command.created_at,'applied_at',NULL,'rolled_back_at',NULL,'idempotent_replay',false
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.preview_onyx_inventory_reconciliation(uuid,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_onyx_inventory_reconciliation(uuid,uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_onyx_inventory_reconciliation(p_command_id uuid,p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_command public.onyx_inventory_reconciliation_commands%ROWTYPE;
  v_snapshot public.onyx_snapshots%ROWTYPE;
  v_item public.onyx_inventory_reconciliation_items%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_key text:=pg_catalog.btrim(COALESCE(p_idempotency_key,''));
  v_count integer;
  v_code text;
  v_qty_text text;
  v_qty numeric(15,3);
  v_row_matches boolean;
  v_row_has_scope boolean;
  v_meta_scope boolean;
  v_delta numeric(15,3);
  v_movement_count bigint;
  v_latest_movement_at timestamptz;
  v_now timestamptz;
  v_new_available numeric(15,3);
  v_movement_id uuid;
  v_movement_created_at timestamptz;
  v_adjusted integer:=0;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='administrator or manager permission required to apply Onyx stock reconciliation';
  END IF;
  IF p_command_id IS NULL OR v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='command id and valid apply idempotency key are required';
  END IF;
  SELECT c.* INTO v_command FROM public.onyx_inventory_reconciliation_commands c
   WHERE c.id=p_command_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Onyx reconciliation command is unavailable in the current organization'; END IF;
  IF v_command.status='applied' THEN
    IF v_command.apply_idempotency_key IS DISTINCT FROM v_key THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='command is already applied with a different idempotency key';
    END IF;
    RETURN pg_catalog.jsonb_build_object('command_id',v_command.id,'snapshot_id',v_command.snapshot_id,'warehouse_id',v_command.warehouse_id,'status',v_command.status,
      'source_row_count',v_command.source_row_count,'adjusted_lines',v_command.adjusted_lines,'created_at',v_command.created_at,
      'applied_at',v_command.applied_at,'rolled_back_at',v_command.rolled_back_at,'idempotent_replay',true);
  END IF;
  IF v_command.status<>'previewed' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only a previewed Onyx reconciliation can be applied';
  END IF;

  PERFORM 1 FROM public.warehouses w
   WHERE w.id=v_command.warehouse_id AND w.organization_id=v_org AND w.is_active FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='selected warehouse is no longer active in this organization'; END IF;
  SELECT s.* INTO v_snapshot FROM public.onyx_snapshots s
   WHERE s.id=v_command.snapshot_id AND s.organization_id=v_org AND s.status='ready' FOR SHARE;
  IF NOT FOUND OR v_snapshot.source_file_hash IS DISTINCT FROM v_command.snapshot_source_hash
     OR v_snapshot.report_type IS DISTINCT FROM v_command.snapshot_report_type
     OR v_snapshot.metrics IS DISTINCT FROM v_command.snapshot_metrics
     OR v_snapshot.row_count IS DISTINCT FROM v_command.snapshot_row_count THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Onyx snapshot changed after preview; create a new preview';
  END IF;
  SELECT pg_catalog.count(*)::integer INTO v_count
    FROM public.onyx_snapshot_rows r WHERE r.snapshot_id=v_snapshot.id AND r.organization_id=v_org;
  IF v_count IS DISTINCT FROM v_command.snapshot_row_count THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Onyx snapshot rows changed after preview; create a new preview';
  END IF;

  -- First pass only locks and validates every product/balance in deterministic product-id order.
  -- No quantity is written until all lines have passed freshness, source, and reservation checks.
  FOR v_item IN SELECT i.* FROM public.onyx_inventory_reconciliation_items i
    WHERE i.command_id=v_command.id AND i.organization_id=v_org ORDER BY i.product_id
  LOOP
    SELECT COALESCE(NULLIF(pg_catalog.btrim(r.data->>'item_code'),''),r.canonical_key),
      NULLIF(pg_catalog.btrim(COALESCE(r.data->>'quantity','')),'')
      INTO v_code,v_qty_text
      FROM public.onyx_snapshot_rows r
     WHERE r.id=v_item.snapshot_row_id AND r.snapshot_id=v_snapshot.id AND r.organization_id=v_org;
    IF NOT FOUND OR v_code IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='source Onyx row was removed after preview';
    END IF;
    -- Read row hash and source values independently to avoid trusting client payload.
    IF (SELECT md5(r.data::text) FROM public.onyx_snapshot_rows r WHERE r.id=v_item.snapshot_row_id) IS DISTINCT FROM v_item.source_row_hash THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='source Onyx row hash changed after preview';
    END IF;
    SELECT COALESCE(NULLIF(pg_catalog.btrim(r.data->>'item_code'),''),r.canonical_key),
           NULLIF(pg_catalog.btrim(COALESCE(r.data->>'quantity','')),'')
      INTO v_code,v_qty_text FROM public.onyx_snapshot_rows r
     WHERE r.id=v_item.snapshot_row_id AND r.snapshot_id=v_snapshot.id AND r.organization_id=v_org;
    IF v_code IS DISTINCT FROM v_item.item_code OR v_qty_text IS NULL
       OR v_qty_text !~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,3})?$'
       OR v_qty_text::numeric(15,3) IS DISTINCT FROM v_item.source_quantity THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='Onyx source item or quantity changed after preview';
    END IF;

    SELECT p.* INTO v_product FROM public.products p
     WHERE p.id=v_item.product_id AND p.organization_id=v_org AND p.item_code=v_item.item_code AND p.status='active' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='product identity/status changed after Onyx preview'; END IF;

    INSERT INTO public.inventory_balances(product_id,warehouse_id,quantity_on_hand,quantity_reserved,reorder_point)
    SELECT v_item.product_id,v_command.warehouse_id,0,0,COALESCE(v_product.min_stock,0)
     WHERE NOT EXISTS (SELECT 1 FROM public.inventory_balances ib WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_command.warehouse_id)
    ON CONFLICT(product_id,warehouse_id) DO NOTHING;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
     WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_command.warehouse_id FOR UPDATE;
    IF NOT FOUND
       OR v_balance.quantity_on_hand IS DISTINCT FROM v_item.baseline_quantity_on_hand
       OR v_balance.quantity_reserved IS DISTINCT FROM v_item.baseline_quantity_reserved
       OR v_balance.last_movement_at IS DISTINCT FROM v_item.baseline_last_movement_at
       OR (v_item.baseline_balance_exists AND v_balance.updated_at IS DISTINCT FROM v_item.baseline_updated_at) THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='stock balance or reservation changed after preview; create a new preview';
    END IF;
    SELECT pg_catalog.count(*)::bigint,pg_catalog.max(m.created_at)
      INTO v_movement_count,v_latest_movement_at FROM public.inventory_movements m
     WHERE m.product_id=v_item.product_id AND m.warehouse_id=v_command.warehouse_id;
    IF v_movement_count IS DISTINCT FROM v_item.baseline_movement_count
       OR v_latest_movement_at IS DISTINCT FROM v_item.baseline_latest_movement_at THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='stock movement history changed after preview; create a new preview';
    END IF;
    IF v_item.source_quantity<v_balance.quantity_reserved THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='Onyx target stock is below the current reserved quantity';
    END IF;
  END LOOP;

  FOR v_item IN SELECT i.* FROM public.onyx_inventory_reconciliation_items i
    WHERE i.command_id=v_command.id AND i.organization_id=v_org ORDER BY i.product_id
  LOOP
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
     WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_command.warehouse_id FOR UPDATE;
    v_delta:=v_item.source_quantity-v_balance.quantity_on_hand;
    v_movement_id:=NULL;
    v_movement_created_at:=NULL;
    IF v_delta<>0 THEN
      v_now:=pg_catalog.clock_timestamp();
      UPDATE public.inventory_balances SET quantity_on_hand=v_item.source_quantity,last_movement_at=v_now,updated_at=v_now
       WHERE id=v_balance.id
       RETURNING quantity_available INTO v_new_available;
      INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,
        reference_type,reference_id,reason,created_by,created_at)
      VALUES(v_item.product_id,v_command.warehouse_id,'onyx_reconciliation_adjustment',v_delta,v_new_available,
        'onyx_inventory_reconciliation',v_command.id,v_command.reason,v_actor,v_now)
      RETURNING id,created_at INTO v_movement_id,v_movement_created_at;
      v_adjusted:=v_adjusted+1;
    ELSE
      v_new_available:=v_balance.quantity_available;
    END IF;
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
     WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_command.warehouse_id;
    UPDATE public.onyx_inventory_reconciliation_items SET
      applied_delta=v_delta,applied_quantity_on_hand=v_balance.quantity_on_hand,
      applied_quantity_reserved=v_balance.quantity_reserved,applied_last_movement_at=v_balance.last_movement_at,
      applied_updated_at=v_balance.updated_at,applied_movement_id=v_movement_id,
      applied_movement_created_at=v_movement_created_at
     WHERE id=v_item.id;
  END LOOP;

  UPDATE public.onyx_inventory_reconciliation_commands SET status='applied',apply_idempotency_key=v_key,
    applied_by=v_actor,applied_at=pg_catalog.clock_timestamp(),adjusted_lines=v_adjusted
   WHERE id=v_command.id RETURNING * INTO v_command;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'inventory.onyx_reconciliation.applied','onyx_inventory_reconciliation',v_command.id,
    pg_catalog.jsonb_build_object('status','previewed','snapshot_id',v_command.snapshot_id,'warehouse_id',v_command.warehouse_id),
    pg_catalog.jsonb_build_object('status','applied','source_row_count',v_command.source_row_count,'adjusted_lines',v_adjusted,
      'idempotency_key',v_key,'reason',v_command.reason));
  RETURN pg_catalog.jsonb_build_object('command_id',v_command.id,'snapshot_id',v_command.snapshot_id,'warehouse_id',v_command.warehouse_id,'status','applied',
    'source_row_count',v_command.source_row_count,'adjusted_lines',v_adjusted,'created_at',v_command.created_at,
    'applied_at',v_command.applied_at,'rolled_back_at',NULL,'idempotent_replay',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_onyx_inventory_reconciliation(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.apply_onyx_inventory_reconciliation(uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rollback_onyx_inventory_reconciliation(
  p_command_id uuid,p_idempotency_key text,p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid;
  v_command public.onyx_inventory_reconciliation_commands%ROWTYPE;
  v_item public.onyx_inventory_reconciliation_items%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_key text:=pg_catalog.btrim(COALESCE(p_idempotency_key,''));
  v_reason text:=NULLIF(pg_catalog.btrim(COALESCE(p_reason,'')),'');
  v_movement_count bigint;
  v_latest_movement_at timestamptz;
  v_now timestamptz;
  v_available numeric(15,3);
  v_movement_id uuid;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.operational_tasks_can_manage() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='administrator or manager permission required to roll back Onyx stock reconciliation';
  END IF;
  IF p_command_id IS NULL OR v_key !~ '^[A-Za-z0-9_-]{16,128}$'
     OR v_reason IS NULL OR pg_catalog.char_length(v_reason)>1000 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='command id, valid rollback idempotency key, and rollback reason are required';
  END IF;
  SELECT c.* INTO v_command FROM public.onyx_inventory_reconciliation_commands c
   WHERE c.id=p_command_id AND c.organization_id=v_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Onyx reconciliation command is unavailable in the current organization'; END IF;
  IF v_command.status='rolled_back' THEN
    IF v_command.rollback_idempotency_key IS DISTINCT FROM v_key OR v_command.rollback_reason IS DISTINCT FROM v_reason THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='command was rolled back with a different idempotency payload';
    END IF;
    RETURN pg_catalog.jsonb_build_object('command_id',v_command.id,'snapshot_id',v_command.snapshot_id,'warehouse_id',v_command.warehouse_id,'status',v_command.status,
      'source_row_count',v_command.source_row_count,'adjusted_lines',v_command.adjusted_lines,'created_at',v_command.created_at,
      'applied_at',v_command.applied_at,'rolled_back_at',v_command.rolled_back_at,'idempotent_replay',true);
  END IF;
  IF v_command.status<>'applied' THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='only an applied Onyx reconciliation can be rolled back';
  END IF;

  -- Validate the whole applied ledger before creating any compensating movement.
  FOR v_item IN SELECT i.* FROM public.onyx_inventory_reconciliation_items i
    WHERE i.command_id=v_command.id AND i.organization_id=v_org ORDER BY i.product_id
  LOOP
    SELECT ib.* INTO v_balance FROM public.inventory_balances ib
     WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_command.warehouse_id FOR UPDATE;
    IF NOT FOUND
       OR v_balance.quantity_on_hand IS DISTINCT FROM v_item.applied_quantity_on_hand
       OR v_balance.quantity_reserved IS DISTINCT FROM v_item.applied_quantity_reserved
       OR v_balance.last_movement_at IS DISTINCT FROM v_item.applied_last_movement_at
       OR v_balance.updated_at IS DISTINCT FROM v_item.applied_updated_at THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='stock or reservations changed after Onyx apply; compensating rollback was denied to preserve later movements';
    END IF;
    SELECT pg_catalog.count(*)::bigint,pg_catalog.max(m.created_at)
      INTO v_movement_count,v_latest_movement_at FROM public.inventory_movements m
     WHERE m.product_id=v_item.product_id AND m.warehouse_id=v_command.warehouse_id;
    IF v_movement_count IS DISTINCT FROM (v_item.baseline_movement_count + CASE WHEN COALESCE(v_item.applied_delta,0)<>0 THEN 1 ELSE 0 END)
       OR (v_item.applied_movement_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM public.inventory_movements m WHERE m.id=v_item.applied_movement_id
           AND m.product_id=v_item.product_id AND m.warehouse_id=v_command.warehouse_id
           AND m.reference_type='onyx_inventory_reconciliation' AND m.reference_id=v_command.id
       ))
       OR (v_item.applied_movement_id IS NOT NULL AND v_latest_movement_at IS DISTINCT FROM v_item.applied_movement_created_at) THEN
      RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='newer or altered stock movement history exists; compensating rollback was denied';
    END IF;
    IF v_item.baseline_quantity_on_hand<v_balance.quantity_reserved THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='original quantity is below current reservations; rollback was denied';
    END IF;
  END LOOP;

  FOR v_item IN SELECT i.* FROM public.onyx_inventory_reconciliation_items i
    WHERE i.command_id=v_command.id AND i.organization_id=v_org ORDER BY i.product_id
  LOOP
    IF COALESCE(v_item.applied_delta,0)<>0 THEN
      SELECT ib.* INTO v_balance FROM public.inventory_balances ib
       WHERE ib.product_id=v_item.product_id AND ib.warehouse_id=v_command.warehouse_id FOR UPDATE;
      v_now:=pg_catalog.clock_timestamp();
      UPDATE public.inventory_balances SET quantity_on_hand=v_item.baseline_quantity_on_hand,last_movement_at=v_now,updated_at=v_now
       WHERE id=v_balance.id RETURNING quantity_available INTO v_available;
      INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,balance_after,
        reference_type,reference_id,reason,created_by,created_at)
      VALUES(v_item.product_id,v_command.warehouse_id,'onyx_reconciliation_rollback',-v_item.applied_delta,v_available,
        'onyx_inventory_reconciliation_rollback',v_command.id,v_reason,v_actor,v_now)
      RETURNING id INTO v_movement_id;
      UPDATE public.onyx_inventory_reconciliation_items SET rollback_movement_id=v_movement_id,rolled_back_at=v_now WHERE id=v_item.id;
    ELSE
      UPDATE public.onyx_inventory_reconciliation_items SET rolled_back_at=pg_catalog.clock_timestamp() WHERE id=v_item.id;
    END IF;
  END LOOP;

  UPDATE public.onyx_inventory_reconciliation_commands SET status='rolled_back',rollback_idempotency_key=v_key,
    rollback_reason=v_reason,rolled_back_by=v_actor,rolled_back_at=pg_catalog.clock_timestamp()
   WHERE id=v_command.id RETURNING * INTO v_command;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_org,v_actor,'inventory.onyx_reconciliation.rolled_back','onyx_inventory_reconciliation',v_command.id,
    pg_catalog.jsonb_build_object('status','applied','adjusted_lines',v_command.adjusted_lines,'applied_at',v_command.applied_at),
    pg_catalog.jsonb_build_object('status','rolled_back','reason',v_reason,'idempotency_key',v_key));
  RETURN pg_catalog.jsonb_build_object('command_id',v_command.id,'snapshot_id',v_command.snapshot_id,'warehouse_id',v_command.warehouse_id,'status','rolled_back',
    'source_row_count',v_command.source_row_count,'adjusted_lines',v_command.adjusted_lines,'created_at',v_command.created_at,
    'applied_at',v_command.applied_at,'rolled_back_at',v_command.rolled_back_at,'idempotent_replay',false);
END;
$function$;
REVOKE ALL ON FUNCTION public.rollback_onyx_inventory_reconciliation(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.rollback_onyx_inventory_reconciliation(uuid,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_onyx_inventory_reconciliation_commands(p_snapshot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid; v_result jsonb;
BEGIN
  SELECT p.organization_id INTO v_org FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active staff organization required to read Onyx reconciliation history';
  END IF;
  IF p_snapshot_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.onyx_snapshots s WHERE s.id=p_snapshot_id AND s.organization_id=v_org
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='Onyx snapshot is unavailable in the current organization';
  END IF;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'command_id',c.id,'snapshot_id',c.snapshot_id,'warehouse_id',c.warehouse_id,'warehouse_name',w.name,'warehouse_code',w.code,
    'status',c.status,'reason',c.reason,'source_row_count',c.source_row_count,'adjusted_lines',c.adjusted_lines,
    'created_at',c.created_at,'applied_at',c.applied_at,'rolled_back_at',c.rolled_back_at
  ) ORDER BY c.created_at DESC,c.id DESC),'[]'::jsonb)
    INTO v_result
    FROM (SELECT * FROM public.onyx_inventory_reconciliation_commands
       WHERE organization_id=v_org AND snapshot_id=p_snapshot_id ORDER BY created_at DESC,id DESC LIMIT 50) c
    JOIN public.warehouses w ON w.id=c.warehouse_id AND w.organization_id=v_org;
  RETURN v_result;
END;
$function$;
REVOKE ALL ON FUNCTION public.list_onyx_inventory_reconciliation_commands(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_onyx_inventory_reconciliation_commands(uuid) TO authenticated;

COMMENT ON TABLE public.onyx_inventory_reconciliation_commands IS
  'Tenant-scoped, idempotent preview/apply/compensating rollback envelope for explicitly warehouse-scoped immutable Onyx snapshots. Authenticated table DML is denied; commands go through guarded SECURITY DEFINER RPCs.';
COMMENT ON TABLE public.onyx_inventory_reconciliation_items IS
  'Immutable preview baseline and source evidence, including reserved quantity, updated timestamp and movement-ledger fingerprint used to reject stale apply/rollback.';
COMMENT ON FUNCTION public.preview_onyx_inventory_reconciliation(uuid,uuid,text,text) IS
  'Creates a read-only, warehouse-proven preview; rejects unscoped aggregate snapshots, invalid/duplicate items and unsafe source quantities.';
COMMENT ON FUNCTION public.apply_onyx_inventory_reconciliation(uuid,text) IS
  'Manager/admin only: validates the original snapshot and all stock/reservation/movement baselines under deterministic row locks, then updates balances, appends movements and audit atomically.';
COMMENT ON FUNCTION public.rollback_onyx_inventory_reconciliation(uuid,text,text) IS
  'Manager/admin only: appends compensating movements only if applied balances, reservations and movement ledger are unchanged; never rewrites past movements.';
