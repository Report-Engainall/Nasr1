BEGIN;

-- AGH-CUSTOMER-ORDER-PRICE-PREVIEW-MEMBER-REVOCATION-001
-- Prevent an in-flight cart/order pricing preview from returning monetary data after a
-- company owner revokes the requesting member. Match the customer-row lock used by the
-- canonical revoke RPC, then recheck the exact surface capability after any lock wait.

CREATE OR REPLACE FUNCTION public.preview_customer_order_pricing(
  p_items jsonb,
  p_surface text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid;
  v_org uuid;
  v_customer uuid;
  v_locked_customer uuid;
  v_required_capability text;
  v_tier text := 'retail';
  v_customer_status text := 'pending';
  v_tier_label text := 'التجزئة';
  v_show_price boolean := false;
  v_show_tier boolean := false;
  v_setting_key text;
  v_line jsonb;
  v_item record;
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_product record;
  v_unit_price numeric(15,2);
  v_line_total numeric(15,2);
  v_total numeric(15,2) := 0;
  v_items jsonb := '[]'::jsonb;
  v_input_items jsonb;
  v_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'authenticated customer required';
  END IF;
  IF p_surface IS NULL OR p_surface NOT IN ('cart', 'orders') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pricing preview surface must be cart or orders';
  END IF;
  -- A few SQL clients send a JSON array wrapped as a JSON string. Parse that layer once,
  -- then apply the same strict array type and line-count limit before touching catalog data.
  v_input_items := p_items;
  IF pg_catalog.jsonb_typeof(v_input_items) = 'string' THEN
    BEGIN
      v_input_items := (v_input_items #>> '{}')::jsonb;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pricing preview requires a valid JSON array';
    END;
  END IF;
  IF v_input_items IS NULL OR pg_catalog.jsonb_typeof(v_input_items) <> 'array'
     OR pg_catalog.jsonb_array_length(v_input_items) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'pricing preview accepts at most 100 order lines';
  END IF;

  -- Resolve identity and tenant through the central live-session helpers.
  -- A cryptographically valid but revoked JWT must not retain access to customer pricing.
  v_profile := public.current_profile_id();
  v_org := public.current_organization_id();
  IF v_profile IS NULL OR v_org IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = v_org AND o.is_active) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active profile and organization required';
  END IF;

  -- Membership permissions differ by surface: viewers may review catalog/cart prices,
  -- while order-review pricing requires explicit orders.create.
  IF (p_surface = 'cart' AND NOT public.current_customer_can('catalog.read'))
     OR (p_surface = 'orders' AND NOT public.current_customer_can('orders.create')) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer membership lacks permission for requested price preview';
  END IF;

  -- Serialize this monetary read with owner-initiated company-member revocation.
  -- The early capability check prevents unauthorized queries from taking unnecessary locks;
  -- the second check below observes revocation after any FOR SHARE wait.
  v_required_capability := CASE p_surface WHEN 'cart' THEN 'catalog.read' ELSE 'orders.create' END;
  v_customer := public.current_customer_id();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer membership lacks permission for requested price preview';
  END IF;

  SELECT c.id
    INTO v_locked_customer
    FROM public.customers AS c
   WHERE c.id = v_customer
     AND c.organization_id = v_org
   FOR SHARE;

  IF v_locked_customer IS NULL OR NOT public.current_customer_can(v_required_capability) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer membership lacks permission for requested price preview';
  END IF;

  -- Resolve direct customers and accepted company members through one authority.
  SELECT c.id, c.tier, c.status
    INTO v_customer, v_tier, v_customer_status
  FROM public.customers AS c
  WHERE c.id = v_customer
    AND c.organization_id = v_org
  LIMIT 1;

  IF v_customer IS NULL OR v_customer_status IS DISTINCT FROM 'approved' THEN
    v_tier := 'retail';
  ELSE
    v_tier := COALESCE(NULLIF(v_tier, ''), 'retail');
  END IF;
  v_tier_label := CASE v_tier
    WHEN 'super_wholesale' THEN 'جملة الجملة'
    WHEN 'wholesale' THEN 'الجملة'
    ELSE 'التجزئة'
  END;

  v_setting_key := CASE p_surface WHEN 'cart' THEN 'show_price_in_cart' ELSE 'show_price_in_orders' END;
  SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
              THEN (s.value #>> '{}')::boolean ELSE false END
    INTO v_show_price
  FROM public.admin_settings AS s
  WHERE s.organization_id = v_org AND s.key = v_setting_key;
  v_show_price := COALESCE(v_show_price, false);

  SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value) = 'boolean'
              THEN (s.value #>> '{}')::boolean ELSE false END
    INTO v_show_tier
  FROM public.admin_settings AS s
  WHERE s.organization_id = v_org AND s.key = 'show_customer_tier_in_customer_views';
  v_show_tier := COALESCE(v_show_tier, false);

  IF NOT v_show_price THEN
    RETURN pg_catalog.jsonb_build_object(
      'visible', false,
      'surface', p_surface,
      'customer_tier_visible', v_show_tier,
      'customer_tier_label', CASE WHEN v_show_tier THEN v_tier_label ELSE NULL END
    );
  END IF;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(v_input_items) LOOP
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      v_quantity := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid product id or quantity in price preview';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL
       OR v_quantity <> pg_catalog.trunc(v_quantity)
       OR v_quantity < 1 OR v_quantity > 10000
       OR v_quantity::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'price preview quantity must be an integer between 1 and 10000';
    END IF;
  END LOOP;

  FOR v_item IN
    SELECT (e.value->>'product_id')::uuid AS product_id,
           pg_catalog.sum((e.value->>'quantity')::numeric)::numeric(15,3) AS quantity
    FROM pg_catalog.jsonb_array_elements(v_input_items) AS e(value)
    GROUP BY (e.value->>'product_id')::uuid
    ORDER BY (e.value->>'product_id')::uuid
  LOOP
    IF v_count >= 100 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'price preview contains too many unique products';
    END IF;
    SELECT p.id, p.name, p.item_code, p.unit
      INTO v_product
    FROM public.products AS p
    WHERE p.id = v_item.product_id
      AND p.organization_id = v_org
      AND p.status = 'active';
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'product unavailable in this organization';
    END IF;

    v_unit_price := public.customer_product_unit_price(v_item.product_id, v_org, v_tier, v_item.quantity);
    v_line_total := pg_catalog.round(v_unit_price * v_item.quantity, 2);
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id', v_item.product_id,
      'name', v_product.name,
      'item_code', v_product.item_code,
      'unit', v_product.unit,
      'quantity', v_item.quantity,
      'unit_price', v_unit_price,
      'line_total', v_line_total
    ));
    v_total := v_total + v_line_total;
    v_count := v_count + 1;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'visible', true,
    'surface', p_surface,
    'items', v_items,
    'item_count', v_count,
    'currency', 'YER',
    'total_amount', v_total,
    'customer_tier_visible', v_show_tier,
    'customer_tier_label', CASE WHEN v_show_tier THEN v_tier_label ELSE NULL END
  );
END
$function$;
REVOKE ALL ON FUNCTION public.preview_customer_order_pricing(jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_customer_order_pricing(jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.preview_customer_order_pricing(jsonb, text) IS
  'Server-authoritative cart/order pricing preview; serializes customer-member reads with revocation and rechecks catalog.read/orders.create after lock waits.';

COMMIT;
