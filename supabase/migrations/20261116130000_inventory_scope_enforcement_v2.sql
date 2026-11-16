BEGIN;

-- Backfill explicit, resource-scoped business capabilities from the six-role
-- compatibility grants. Existing role assignments are not changed.
DO $capability_catalog$
DECLARE
  v_mapping record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.authorization_capabilities WHERE capability_key='inventory.transfer.execute') THEN
    INSERT INTO public.authorization_capabilities (
      capability_key,domain,resource,action,sensitivity,scope_kind,
      approval_mode,separation_of_duties,state_requirements,legacy_operation_id,is_active
    )
    SELECT
      'inventory.transfer.execute',c.domain,c.resource,'execute',c.sensitivity,'warehouse',
      'none',false,'{}'::jsonb,c.legacy_operation_id,true
    FROM public.authorization_capabilities c
    WHERE c.capability_key='inventory.transfer.create';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.authorization_capabilities
    WHERE capability_key IN (
      'inventory.read_balance','inventory.count.start','inventory.count.enter',
      'inventory.count.finalize','inventory.count.cancel','inventory.transfer.execute'
    )
  ) THEN
    RAISE EXCEPTION 'required inventory V2 capability catalog entries are missing';
  END IF;

  UPDATE public.authorization_capabilities
     SET scope_kind='warehouse',
         approval_mode='none',
         separation_of_duties=false,
         updated_at=statement_timestamp()
   WHERE capability_key IN (
     'inventory.read_balance','inventory.count.start','inventory.count.enter',
     'inventory.count.cancel','inventory.transfer.execute'
   );

  UPDATE public.authorization_capabilities
     SET scope_kind='warehouse',
         approval_mode='maker_checker',
         separation_of_duties=true,
         updated_at=statement_timestamp()
   WHERE capability_key='inventory.count.finalize';

  FOR v_mapping IN
    SELECT *
      FROM (VALUES
        ('inventory.read_balance','inventory.count.enter'),
        ('inventory.count.start','inventory.count.enter'),
        ('inventory.count.cancel','inventory.count.finalize'),
        ('inventory.transfer.execute','inventory.transfer.create')
      ) AS grants_to_copy(target_capability,source_capability)
  LOOP
    INSERT INTO public.authorization_role_capabilities (
      role,capability_key,grant_source,valid_from,expires_at
    )
    SELECT
      rc.role,
      v_mapping.target_capability,
      'legacy-role-parity:' || rc.grant_source,
      rc.valid_from,
      rc.expires_at
    FROM public.authorization_role_capabilities rc
    WHERE rc.capability_key=v_mapping.source_capability
    ON CONFLICT (role,capability_key) DO NOTHING;
  END LOOP;
END
$capability_catalog$;

-- A read permission is now a real warehouse-level grant, not a tenant-wide
-- staff boolean. The old public/staff policies are all removed because RLS
-- combines policies with OR semantics.
DO $drop_inventory_policies$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT schemaname,tablename,policyname
      FROM pg_catalog.pg_policies
     WHERE schemaname='public'
       AND tablename IN (
         'inventory_balances','inventory_movements','inventory_transfers',
         'stock_count_sessions','stock_count_lines'
       )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I',v_policy.policyname,v_policy.schemaname,v_policy.tablename);
  END LOOP;
END
$drop_inventory_policies$;

ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_count_lines ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.inventory_balances FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.inventory_movements FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.inventory_transfers FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.stock_count_sessions FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.stock_count_lines FROM PUBLIC,anon,authenticated;

GRANT SELECT ON TABLE public.inventory_balances TO authenticated;
GRANT SELECT ON TABLE public.inventory_movements TO authenticated;
GRANT SELECT ON TABLE public.inventory_transfers TO authenticated;
GRANT SELECT ON TABLE public.stock_count_sessions TO authenticated;
GRANT SELECT ON TABLE public.stock_count_lines TO authenticated;

CREATE POLICY inventory_balances_assigned_warehouse_read_v2
  ON public.inventory_balances
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.warehouses w
        JOIN public.products p
          ON p.id=inventory_balances.product_id
         AND p.organization_id=w.organization_id
       WHERE w.id=inventory_balances.warehouse_id
         AND w.is_active=true
         AND w.organization_id=public.current_organization_id()
         AND public.current_actor_has_capability('inventory.read_balance',w.id)
    )
  );

CREATE POLICY inventory_movements_assigned_warehouse_read_v2
  ON public.inventory_movements
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.warehouses w
        JOIN public.products p
          ON p.id=inventory_movements.product_id
         AND p.organization_id=w.organization_id
       WHERE w.id=inventory_movements.warehouse_id
         AND w.is_active=true
         AND w.organization_id=public.current_organization_id()
         AND public.current_actor_has_capability('inventory.read_balance',w.id)
    )
  );

CREATE POLICY inventory_transfers_assigned_warehouses_read_v2
  ON public.inventory_transfers
  FOR SELECT TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND public.current_actor_has_capability('inventory.read_balance',source_warehouse_id)
    AND public.current_actor_has_capability('inventory.read_balance',destination_warehouse_id)
  );

CREATE POLICY stock_count_sessions_assigned_warehouse_read_v2
  ON public.stock_count_sessions
  FOR SELECT TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND public.current_actor_has_capability('inventory.read_balance',warehouse_id)
  );

CREATE POLICY stock_count_lines_assigned_warehouse_read_v2
  ON public.stock_count_lines
  FOR SELECT TO authenticated
  USING (
    organization_id=public.current_organization_id()
    AND EXISTS (
      SELECT 1
        FROM public.stock_count_sessions s
       WHERE s.id=stock_count_lines.session_id
         AND s.organization_id=stock_count_lines.organization_id
         AND public.current_actor_has_capability('inventory.read_balance',s.warehouse_id)
    )
  );

-- The counter identity is persisted by the database, never accepted from a
-- browser payload. This is required for a meaningful independent checker.
ALTER TABLE public.stock_count_lines
  ADD COLUMN IF NOT EXISTS counted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.guard_stock_count_session_authorization_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_organization_id uuid;
  v_resource_decision jsonb;
  v_other_counter boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated stock-count operator required';
  END IF;

  SELECT p.id,p.organization_id
    INTO v_actor_profile_id,v_organization_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active=true
     AND p.organization_id IS NOT NULL
   ORDER BY p.created_at,p.id
   LIMIT 1;

  IF v_actor_profile_id IS NULL OR v_organization_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization membership required for stock counts';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.organization_id IS DISTINCT FROM v_organization_id
       OR NEW.started_by IS DISTINCT FROM v_actor_profile_id
       OR NEW.status IS DISTINCT FROM 'open'
       OR NOT EXISTS (
         SELECT 1 FROM public.warehouses w
          WHERE w.id=NEW.warehouse_id
            AND w.organization_id=v_organization_id
            AND w.is_active=true
       )
       OR NOT public.current_actor_has_capability('inventory.count.start',NEW.warehouse_id) THEN
      RAISE EXCEPTION USING
        ERRCODE='42501',
        MESSAGE='inventory.count.start and an assigned active warehouse are required';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id
     OR NEW.started_by IS DISTINCT FROM OLD.started_by THEN
    RAISE EXCEPTION USING
      ERRCODE='42501',
      MESSAGE='stock-count organization, warehouse and maker identity are immutable';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='only an open stock count can change state';
    END IF;

    IF NEW.status='completed' THEN
      v_resource_decision:=public.current_authorization_decision(
        'inventory.count.finalize',NEW.warehouse_id
      );
      IF v_resource_decision->>'decision' IS DISTINCT FROM 'REQUIRES_APPROVAL'
         OR (v_resource_decision->>'separation_of_duties')::boolean IS DISTINCT FROM true
         OR v_actor_profile_id=OLD.started_by THEN
        RAISE EXCEPTION USING
          ERRCODE='42501',
          MESSAGE='stock-count finalization requires an independent maker-checker reviewer';
      END IF;

      SELECT EXISTS (
        SELECT 1
          FROM public.stock_count_lines l
         WHERE l.session_id=OLD.id
           AND l.counted_quantity IS NOT NULL
           AND (l.counted_by IS NULL OR l.counted_by=v_actor_profile_id)
      ) INTO v_other_counter;

      IF v_other_counter THEN
        RAISE EXCEPTION USING
          ERRCODE='42501',
          MESSAGE='stock-count reviewer must differ from every person who entered a counted quantity';
      END IF;
    ELSIF lower(NEW.status) IN ('cancelled','canceled') THEN
      IF NOT public.current_actor_has_capability('inventory.count.cancel',NEW.warehouse_id) THEN
        RAISE EXCEPTION USING
          ERRCODE='42501',
          MESSAGE='inventory.count.cancel capability and assigned warehouse are required';
      END IF;
    ELSE
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='unsupported stock-count state transition';
    END IF;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_stock_count_session_authorization_v2() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stock_count_session_authorization_v2 ON public.stock_count_sessions;
CREATE TRIGGER stock_count_session_authorization_v2
  BEFORE INSERT OR UPDATE ON public.stock_count_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_stock_count_session_authorization_v2();

CREATE OR REPLACE FUNCTION public.guard_stock_count_line_authorization_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_organization_id uuid;
  v_session_organization_id uuid;
  v_warehouse_id uuid;
  v_session_status text;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='stock-count line history cannot be deleted';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='authenticated stock-count operator required';
  END IF;

  SELECT p.id,p.organization_id
    INTO v_actor_profile_id,v_organization_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active=true
   ORDER BY p.created_at,p.id
   LIMIT 1;

  SELECT s.organization_id,s.warehouse_id,s.status
    INTO v_session_organization_id,v_warehouse_id,v_session_status
    FROM public.stock_count_sessions s
   WHERE s.id=NEW.session_id
   FOR UPDATE;

  IF v_actor_profile_id IS NULL
     OR v_organization_id IS NULL
     OR v_session_organization_id IS DISTINCT FROM v_organization_id
     OR NEW.organization_id IS DISTINCT FROM v_session_organization_id
     OR v_session_status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION USING
      ERRCODE='42501',
      MESSAGE='stock-count line must belong to an open session in the active organization';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NOT public.current_actor_has_capability('inventory.count.start',v_warehouse_id) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory.count.start capability required to create stock-count snapshot lines';
    END IF;
    IF NEW.counted_quantity IS NULL THEN
      NEW.counted_by:=NULL;
    ELSE
      IF NOT public.current_actor_has_capability('inventory.count.enter',v_warehouse_id) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory.count.enter capability required';
      END IF;
      NEW.counted_by:=v_actor_profile_id;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.session_id IS DISTINCT FROM OLD.session_id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='stock-count line identity is immutable';
  END IF;

  IF NOT public.current_actor_has_capability('inventory.count.enter',v_warehouse_id) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory.count.enter capability and assigned warehouse are required';
  END IF;

  IF NEW.counted_quantity IS DISTINCT FROM OLD.counted_quantity THEN
    NEW.counted_by:=v_actor_profile_id;
  ELSE
    NEW.counted_by:=OLD.counted_by;
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_stock_count_line_authorization_v2() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS stock_count_line_authorization_v2 ON public.stock_count_lines;
CREATE TRIGGER stock_count_line_authorization_v2
  BEFORE INSERT OR UPDATE OR DELETE ON public.stock_count_lines
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_stock_count_line_authorization_v2();

-- A transfer is visible and executable only when the member is assigned both
-- ends. Check the RPC arguments before idempotency replay and check persisted
-- rows again in the table trigger.
CREATE OR REPLACE FUNCTION public.assert_inventory_transfer_scope_v2(
  p_source_warehouse_id uuid,
  p_destination_warehouse_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor_profile_id uuid;
  v_organization_id uuid;
BEGIN
  IF auth.uid() IS NULL
     OR p_source_warehouse_id IS NULL
     OR p_destination_warehouse_id IS NULL
     OR p_source_warehouse_id=p_destination_warehouse_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='a distinct source and destination warehouse are required';
  END IF;

  SELECT p.id,p.organization_id
    INTO v_actor_profile_id,v_organization_id
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.auth_user_id=auth.uid()
     AND p.is_active=true
   ORDER BY p.created_at,p.id
   LIMIT 1;

  IF v_actor_profile_id IS NULL OR v_organization_id IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.warehouses w
        WHERE w.id=p_source_warehouse_id AND w.organization_id=v_organization_id AND w.is_active=true
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.warehouses w
        WHERE w.id=p_destination_warehouse_id AND w.organization_id=v_organization_id AND w.is_active=true
     )
     OR NOT public.current_actor_has_capability('inventory.transfer.execute',p_source_warehouse_id)
     OR NOT public.current_actor_has_capability('inventory.transfer.execute',p_destination_warehouse_id) THEN
    RAISE EXCEPTION USING
      ERRCODE='42501',
      MESSAGE='inventory.transfer.execute capability and assignments to both warehouses are required';
  END IF;
END
$function$;

REVOKE ALL ON FUNCTION public.assert_inventory_transfer_scope_v2(uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_inventory_transfer_scope_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_organization_id uuid;
BEGIN
  IF TG_OP='UPDATE'
     AND (
       NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.source_warehouse_id IS DISTINCT FROM OLD.source_warehouse_id
       OR NEW.destination_warehouse_id IS DISTINCT FROM OLD.destination_warehouse_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='transfer tenant and warehouse endpoints are immutable';
  END IF;

  v_organization_id:=public.current_organization_id();
  IF v_organization_id IS NULL OR NEW.organization_id IS DISTINCT FROM v_organization_id THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory transfer must belong to the active organization';
  END IF;

  PERFORM public.assert_inventory_transfer_scope_v2(
    NEW.source_warehouse_id,NEW.destination_warehouse_id
  );
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_inventory_transfer_scope_v2() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS inventory_transfer_scope_v2 ON public.inventory_transfers;
CREATE TRIGGER inventory_transfer_scope_v2
  BEFORE INSERT OR UPDATE ON public.inventory_transfers
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_inventory_transfer_scope_v2();

-- Add the resource check at the beginning of each transfer RPC body, before
-- it can return an idempotency replay. Discover argument names from pg_proc
-- so the migration fails closed if the function contract is not as expected.
DO $transfer_rpc_guards$
DECLARE
  v_function record;
  v_source_arg text;
  v_destination_arg text;
  v_definition text;
  v_begin_position integer;
BEGIN
  FOR v_function IN
    SELECT p.oid,p.proname,p.proargnames
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('transfer_inventory','transfer_inventory_batch')
  LOOP
    SELECT arg_name
      INTO v_source_arg
      FROM unnest(v_function.proargnames) WITH ORDINALITY AS args(arg_name,ordinality)
     WHERE arg_name ~* '(source|from).*warehouse|warehouse.*(source|from)'
     ORDER BY ordinality
     LIMIT 1;

    SELECT arg_name
      INTO v_destination_arg
      FROM unnest(v_function.proargnames) WITH ORDINALITY AS args(arg_name,ordinality)
     WHERE arg_name ~* '(destination|dest|to).*warehouse|warehouse.*(destination|dest|to)'
     ORDER BY ordinality
     LIMIT 1;

    IF v_source_arg IS NULL OR v_destination_arg IS NULL THEN
      RAISE EXCEPTION 'cannot identify source/destination warehouse parameters for public.%',v_function.proname;
    END IF;

    v_definition:=pg_catalog.pg_get_functiondef(v_function.oid);
    v_begin_position:=pg_catalog.strpos(v_definition,E'\nBEGIN\n');
    IF v_begin_position=0 THEN
      RAISE EXCEPTION 'cannot locate executable body for public.%',v_function.proname;
    END IF;

    v_definition:=pg_catalog.overlay(
      v_definition
      PLACING E'\nBEGIN\n  PERFORM public.assert_inventory_transfer_scope_v2('
        || pg_catalog.quote_ident(v_source_arg) || ','
        || pg_catalog.quote_ident(v_destination_arg) || E');\n'
      FROM v_begin_position
      FOR pg_catalog.length(E'\nBEGIN\n')
    );
    EXECUTE v_definition;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='transfer_inventory'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='transfer_inventory_batch'
  ) THEN
    RAISE EXCEPTION 'both single and batch inventory transfer RPCs must exist';
  END IF;
END
$transfer_rpc_guards$;

-- SECURITY DEFINER history reads bypass RLS, so apply both endpoint checks in
-- the query itself as well.
DO $transfer_history_scope$
DECLARE
  v_oid oid;
  v_definition text;
  v_legacy_predicate text:='WHERE t.organization_id = v_org';
  v_scoped_predicate text:=
    'WHERE t.organization_id = v_org'
    || ' AND public.current_actor_has_capability(''inventory.read_balance'',t.source_warehouse_id)'
    || ' AND public.current_actor_has_capability(''inventory.read_balance'',t.destination_warehouse_id)';
BEGIN
  SELECT p.oid INTO v_oid
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='list_inventory_transfer_history';
  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'inventory transfer history RPC is missing';
  END IF;
  v_definition:=pg_catalog.pg_get_functiondef(v_oid);
  IF pg_catalog.position(v_legacy_predicate IN v_definition)=0 THEN
    RAISE EXCEPTION 'inventory transfer history tenant predicate changed; refusing an unscoped SECURITY DEFINER reader';
  END IF;
  v_definition:=pg_catalog.replace(v_definition,v_legacy_predicate,v_scoped_predicate);
  EXECUTE v_definition;
END
$transfer_history_scope$;

COMMENT ON FUNCTION public.assert_inventory_transfer_scope_v2(uuid,uuid) IS
  'Validates current member assignments to both active warehouses before transfer execution and persisted transfer writes.';
COMMENT ON FUNCTION public.guard_stock_count_session_authorization_v2() IS
  'Enforces warehouse-scoped stock-count start/cancel and independent maker-checker finalization at the database boundary.';
COMMENT ON FUNCTION public.guard_stock_count_line_authorization_v2() IS
  'Attributes every counted quantity to the authenticated profile and prevents line mutation outside an open assigned warehouse session.';
COMMIT;
