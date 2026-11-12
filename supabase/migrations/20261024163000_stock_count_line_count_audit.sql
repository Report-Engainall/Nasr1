BEGIN;

-- INV-STOCK-001: preserve who counted each line and every correction to a physical count.
ALTER TABLE public.stock_count_lines
  ADD COLUMN IF NOT EXISTS counted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.set_stock_count_line(p_session_id uuid,p_product_id uuid,p_counted_quantity numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
 v_actor uuid := public.current_profile_id(); v_org uuid;
 v_session public.stock_count_sessions%ROWTYPE; v_line public.stock_count_lines%ROWTYPE;
 v_old_counted_quantity numeric(15,3); v_old_counted_by uuid; v_old_counted_at timestamptz;
 v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.is_staff() THEN
  RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization required to record a stock count';
 END IF;
 IF p_session_id IS NULL OR p_product_id IS NULL OR p_counted_quantity IS NULL
  OR p_counted_quantity::text IN ('NaN','Infinity','-Infinity') OR p_counted_quantity<0
  OR p_counted_quantity>999999999999.999 OR pg_catalog.round(p_counted_quantity,3)<>p_counted_quantity THEN
  RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='counted quantity must be non-negative with at most three decimals';
 END IF;
 SELECT s.* INTO v_session FROM public.stock_count_sessions s WHERE s.id=p_session_id AND s.organization_id=v_org FOR UPDATE;
 IF NOT FOUND OR v_session.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='stock count is not open'; END IF;
 SELECT l.* INTO v_line FROM public.stock_count_lines l WHERE l.session_id=v_session.id AND l.organization_id=v_org AND l.product_id=p_product_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product is not part of this stock-count snapshot'; END IF;
 v_old_counted_quantity:=v_line.counted_quantity; v_old_counted_by:=v_line.counted_by; v_old_counted_at:=v_line.counted_at;
 UPDATE public.stock_count_lines SET counted_quantity=p_counted_quantity,variance=p_counted_quantity-v_line.expected_quantity,counted_by=v_actor,counted_at=v_now
  WHERE id=v_line.id RETURNING * INTO v_line;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(
  v_org,v_actor,'inventory.stock_count.line_counted','stock_count_line',v_line.id,
  CASE WHEN v_old_counted_quantity IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object(
   'counted_quantity',v_old_counted_quantity,'counted_by',v_old_counted_by,'counted_at',v_old_counted_at
  ) END,
  pg_catalog.jsonb_build_object(
   'session_id',v_session.id,'product_id',p_product_id,'counted_quantity',v_line.counted_quantity,
   'counted_by',v_actor,'counted_at',v_now
  )
 );
 UPDATE public.stock_count_sessions s SET counted_lines=(SELECT pg_catalog.count(*)::integer FROM public.stock_count_lines l WHERE l.session_id=s.id AND l.counted_quantity IS NOT NULL)
  WHERE s.id=v_session.id;
 RETURN pg_catalog.to_jsonb(v_line);
END;
$$;

REVOKE ALL ON FUNCTION public.set_stock_count_line(uuid,uuid,numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_stock_count_line(uuid,uuid,numeric) TO authenticated;
COMMENT ON COLUMN public.stock_count_lines.counted_by IS
  'Active profile that recorded the current counted quantity; each count or recount writes a tenant-scoped audit event.';
COMMENT ON FUNCTION public.set_stock_count_line(uuid,uuid,numeric) IS
  'Tenant-scoped stock count line entry; validates active staff and snapshot membership, stores the active profile, and records old/new count metadata in audit_logs transactionally.';

COMMIT;
