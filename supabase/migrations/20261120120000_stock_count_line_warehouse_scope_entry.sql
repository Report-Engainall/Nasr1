-- Resolve the count session first, then authorize its exact warehouse.
-- The one-argument capability helper deliberately denies warehouse-scoped
-- capabilities; using it before the resource-aware check blocked every valid
-- stock-count line update. The row trigger remains an independent second guard.
BEGIN;

CREATE OR REPLACE FUNCTION public.set_stock_count_line(
  p_session_id uuid,
  p_product_id uuid,
  p_counted_quantity numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_session public.stock_count_sessions%ROWTYPE;
  v_line public.stock_count_lines%ROWTYPE;
BEGIN
  SELECT p.organization_id
    INTO v_org
    FROM public.profiles p
   WHERE p.id = v_actor
     AND p.auth_user_id = auth.uid()
     AND p.is_active = true;

  -- The command capability and a usable tenant/session identity are checked
  -- before product IDs or counted quantities are validated.
  IF auth.uid() IS NULL
     OR v_actor IS NULL
     OR v_org IS NULL
     OR p_session_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'an active authorized stock-count session is required';
  END IF;

  SELECT s.*
    INTO v_session
    FROM public.stock_count_sessions s
   WHERE s.id = p_session_id
     AND s.organization_id = v_org
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'stock-count session is unavailable in this organization';
  END IF;

  -- Resolve and enforce the exact warehouse scope before checking any
  -- product/count payload, and before attempting to update a count line.
  IF NOT public.current_actor_has_capability('inventory.count.enter', v_session.warehouse_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'inventory.count.enter capability and assigned warehouse are required to record a stock count';
  END IF;

  IF p_product_id IS NULL
     OR p_counted_quantity IS NULL
     OR p_counted_quantity::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_counted_quantity < 0
     OR p_counted_quantity > 999999999999.999
     OR pg_catalog.round(p_counted_quantity, 3) <> p_counted_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'counted quantity must be non-negative with at most three decimals';
  END IF;

  IF v_session.status <> 'open' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'stock count is not open';
  END IF;

  SELECT l.*
    INTO v_line
    FROM public.stock_count_lines l
   WHERE l.session_id = v_session.id
     AND l.organization_id = v_org
     AND l.product_id = p_product_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
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
        WHERE l.session_id = s.id
          AND l.counted_quantity IS NOT NULL
     )
   WHERE s.id = v_session.id;

  RETURN pg_catalog.to_jsonb(v_line);
END
$function$;

REVOKE ALL ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric) TO authenticated;

COMMENT ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric) IS
  'Updates a draft count line only after active tenant identity, an open tenant-owned session, and inventory.count.enter permission for the exact session warehouse; the stock-count line trigger independently enforces the same warehouse boundary and counted_by identity.';

COMMIT;
