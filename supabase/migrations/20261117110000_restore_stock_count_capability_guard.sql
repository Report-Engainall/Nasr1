BEGIN;

-- Stock-count entry is its own capability. A broad role check must never
-- bypass inventory.count.enter or the separate inventory.balance.adjust gate.
CREATE OR REPLACE FUNCTION public.start_stock_count(
  p_warehouse_id uuid,
  p_idempotency_key text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_session public.stock_count_sessions%ROWTYPE;
  v_existing_id uuid;
  v_key text := pg_catalog.btrim(coalesce(p_idempotency_key, ''));
  v_notes text := nullif(pg_catalog.btrim(coalesce(p_notes, '')), '');
  v_line_count integer := 0;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_actor_has_capability('inventory.count.enter') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'inventory.count.enter capability and active organization are required to start a stock count';
  END IF;

  IF p_warehouse_id IS NULL OR v_key !~ '^[A-Za-z0-9_-]{16,128}$' THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'warehouse and valid stock-count idempotency key are required';
  END IF;
  IF v_notes IS NOT NULL AND pg_catalog.char_length(v_notes) > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'stock-count notes cannot exceed 1000 characters';
  END IF;

  PERFORM 1 FROM public.warehouses w
   WHERE w.id = p_warehouse_id AND w.organization_id = v_org AND w.is_active = true
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'warehouse is unavailable in this organization';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text || ':stock-count-key:' || v_key, 0)
  );
  SELECT s.* INTO v_session
    FROM public.stock_count_sessions s
   WHERE s.organization_id = v_org AND s.idempotency_key = v_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_session.warehouse_id IS DISTINCT FROM p_warehouse_id
       OR v_session.notes IS DISTINCT FROM v_notes THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'stock-count idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.to_jsonb(v_session) || pg_catalog.jsonb_build_object('replayed', true);
  END IF;

  SELECT s.id INTO v_existing_id
    FROM public.stock_count_sessions s
   WHERE s.organization_id = v_org AND s.warehouse_id = p_warehouse_id AND s.status = 'open'
   FOR UPDATE;
  IF FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '55006',
      MESSAGE = 'an open stock count already exists for this warehouse';
  END IF;

  INSERT INTO public.stock_count_sessions(
    organization_id, warehouse_id, status, idempotency_key, notes, started_by
  ) VALUES (v_org, p_warehouse_id, 'open', v_key, v_notes, v_actor)
  RETURNING * INTO v_session;

  PERFORM 1
    FROM public.inventory_balances ib
    JOIN public.products p ON p.id = ib.product_id
      AND p.organization_id = v_org AND p.status = 'active'
   WHERE ib.warehouse_id = p_warehouse_id
   ORDER BY ib.product_id FOR SHARE OF ib;

  INSERT INTO public.stock_count_lines(
    organization_id, session_id, product_id, product_code, product_name, unit,
    expected_quantity, expected_reserved_quantity, expected_last_movement_at
  )
  SELECT v_org, v_session.id, ib.product_id, coalesce(p.item_code, p.name),
    p.name, p.unit, ib.quantity_on_hand, ib.quantity_reserved, ib.last_movement_at
    FROM public.inventory_balances ib
    JOIN public.products p ON p.id = ib.product_id
      AND p.organization_id = v_org AND p.status = 'active'
   WHERE ib.warehouse_id = p_warehouse_id
   ORDER BY ib.product_id;

  GET DIAGNOSTICS v_line_count = ROW_COUNT;
  IF v_line_count = 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'no verified inventory balances exist for this warehouse';
  END IF;

  UPDATE public.stock_count_sessions
     SET total_lines = v_line_count, counted_lines = 0
   WHERE id = v_session.id
  RETURNING * INTO v_session;

  RETURN pg_catalog.to_jsonb(v_session) || pg_catalog.jsonb_build_object('replayed', false);
END
$function$;

CREATE OR REPLACE FUNCTION public.set_stock_count_line(
  p_session_id uuid,
  p_product_id uuid,
  p_counted_quantity numeric
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_session public.stock_count_sessions%ROWTYPE;
  v_line public.stock_count_lines%ROWTYPE;
BEGIN
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor AND p.auth_user_id = auth.uid() AND p.is_active = true;

  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR NOT public.current_actor_has_capability('inventory.count.enter') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'inventory.count.enter capability and active organization are required to record a stock count';
  END IF;

  IF p_session_id IS NULL OR p_product_id IS NULL OR p_counted_quantity IS NULL
     OR p_counted_quantity::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_counted_quantity < 0 OR p_counted_quantity > 999999999999.999
     OR pg_catalog.round(p_counted_quantity, 3) <> p_counted_quantity THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'counted quantity must be non-negative with at most three decimals';
  END IF;

  SELECT s.* INTO v_session
    FROM public.stock_count_sessions s
   WHERE s.id = p_session_id AND s.organization_id = v_org
   FOR UPDATE;
  IF NOT FOUND OR v_session.status <> 'open' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'stock count is not open';
  END IF;

  SELECT l.* INTO v_line
    FROM public.stock_count_lines l
   WHERE l.session_id = v_session.id AND l.organization_id = v_org
     AND l.product_id = p_product_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'product is not part of this stock-count snapshot';
  END IF;

  UPDATE public.stock_count_lines
     SET counted_quantity = p_counted_quantity,
         variance = p_counted_quantity - v_line.expected_quantity,
         counted_at = pg_catalog.now()
   WHERE id = v_line.id
  RETURNING * INTO v_line;

  UPDATE public.stock_count_sessions s
     SET counted_lines = (
       SELECT pg_catalog.count(*)::integer
         FROM public.stock_count_lines l
        WHERE l.session_id = s.id AND l.counted_quantity IS NOT NULL
     )
   WHERE s.id = v_session.id;

  RETURN pg_catalog.to_jsonb(v_line);
END
$function$;

REVOKE ALL ON FUNCTION public.start_stock_count(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_stock_count(uuid, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric) TO authenticated;

COMMENT ON FUNCTION public.start_stock_count(uuid, text, text) IS
  'Creates a tenant-scoped source-backed count only when the active actor has inventory.count.enter; does not grant inventory.balance.adjust or inventory.count.finalize.';
COMMENT ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric) IS
  'Records a line in an open tenant-scoped count only when the active actor has inventory.count.enter; draft count entry never moves canonical inventory balances.';

COMMIT;
