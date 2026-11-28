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

  IF auth.uid() IS NULL
     OR v_actor IS NULL
     OR v_org IS NULL
     OR NOT (public.is_staff() OR public.operational_tasks_can_manage()) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'active staff, administrator or manager organization required to record a stock count';
  END IF;

  IF p_session_id IS NULL
     OR p_product_id IS NULL
     OR p_counted_quantity IS NULL
     OR p_counted_quantity::text IN ('NaN', 'Infinity', '-Infinity')
     OR p_counted_quantity < 0
     OR p_counted_quantity > 999999999999.999
     OR pg_catalog.round(p_counted_quantity, 3) <> p_counted_quantity THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'counted quantity must be non-negative with at most three decimals';
  END IF;

  SELECT s.*
    INTO v_session
    FROM public.stock_count_sessions s
   WHERE s.id = p_session_id
     AND s.organization_id = v_org
   FOR UPDATE;

  IF NOT FOUND OR v_session.status <> 'open' THEN
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

REVOKE ALL ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric)
  TO authenticated;

COMMENT ON FUNCTION public.set_stock_count_line(uuid, uuid, numeric) IS
  'Records a counted quantity for an open tenant-scoped stock-count snapshot. Mirrors start_stock_count admission for active staff and operational managers; it does not grant inventory adjustment or stock-count finalization authority.';

COMMIT;
