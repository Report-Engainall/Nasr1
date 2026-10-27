-- AGH-COMPANY-MEMBER-CART-REVOCATION-001
-- Persistent cart access must stop when an invited company member loses their active membership.
-- Serialize cart mutations with the customer row lock used by revoke_customer_company_member():
-- if a revocation wins, the subsequent membership re-check rejects and rolls the cart write back;
-- if the cart write wins, the revocation waits until the transaction finishes.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_customer_cart()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer_id uuid;
  v_locked_customer_id uuid;
  v_cart_id uuid;
  v_updated_at timestamptz;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR public.is_staff()
     OR public.current_customer_id() IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role = 'customer'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active customer profile required for persistent cart';
  END IF;

  -- Serialize cart reads with membership revocation. If revocation holds the customer
  -- row first, this read waits and re-checks membership after the lock is granted.
  v_customer_id := public.current_customer_id();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'company membership is no longer active for persistent cart';
  END IF;

  SELECT c.id
    INTO v_locked_customer_id
    FROM public.customers AS c
   WHERE c.id = v_customer_id
     AND c.organization_id = v_org
   FOR SHARE;

  IF v_locked_customer_id IS NULL
     OR public.current_customer_id() IS DISTINCT FROM v_customer_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'company membership is no longer active for persistent cart';
  END IF;

  SELECT c.id, c.updated_at
    INTO v_cart_id, v_updated_at
    FROM public.customer_carts AS c
   WHERE c.organization_id = v_org
     AND c.profile_id = v_actor
     AND c.status = 'active'
   LIMIT 1;

  IF v_cart_id IS NOT NULL THEN
    SELECT coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'product_id', i.product_id,
          'quantity', i.quantity
        ) ORDER BY i.created_at, i.product_id
      ),
      '[]'::jsonb
    )
      INTO v_items
      FROM public.customer_cart_items AS i
      JOIN public.products AS p
        ON p.id = i.product_id
       AND p.organization_id = v_org
       AND p.status = 'active'
     WHERE i.organization_id = v_org
       AND i.cart_id = v_cart_id;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'items', coalesce(v_items, '[]'::jsonb),
    'updated_at', v_updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.sync_customer_cart(p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer_id uuid;
  v_locked_customer_id uuid;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_validated jsonb := '[]'::jsonb;
  v_cart_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
     OR public.is_staff()
     OR public.current_customer_id() IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles AS r
       WHERE r.profile_id = v_actor AND r.role = 'customer'
     )
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles AS p
       WHERE p.id = v_actor AND p.auth_user_id = auth.uid()
         AND p.organization_id = v_org AND p.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active customer profile required for persistent cart';
  END IF;

  -- Lock and re-check membership before examining client-supplied product IDs.
  -- This serializes cart reads/writes against the owner's FOR UPDATE revocation lock.
  v_customer_id := public.current_customer_id();
  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'company membership is no longer active for persistent cart';
  END IF;

  SELECT c.id
    INTO v_locked_customer_id
    FROM public.customers AS c
   WHERE c.id = v_customer_id
     AND c.organization_id = v_org
   FOR SHARE;

  IF v_locked_customer_id IS NULL
     OR public.current_customer_id() IS DISTINCT FROM v_customer_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'company membership is no longer active for persistent cart';
  END IF;

  IF p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023',
      MESSAGE = 'cart must be an array of at most 100 product lines';
  END IF;

  -- Validate every line before touching the stored cart. Reject client-supplied price fields,
  -- duplicate IDs, malformed quantities and products outside this active tenant catalog.
  FOR v_item IN
    SELECT entry.value
      FROM pg_catalog.jsonb_array_elements(p_items) AS entry(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'each cart line must be an object';
    END IF;

    IF (v_item - ARRAY['product_id', 'quantity']::text[]) <> '{}'::jsonb
       OR NOT (v_item ? 'product_id')
       OR NOT (v_item ? 'quantity') THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'each cart line must contain only product_id and quantity';
    END IF;

    BEGIN
      v_product_id := (v_item ->> 'product_id')::uuid;
      IF (v_item ->> 'quantity') !~ '^[0-9]{1,5}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid cart quantity';
      END IF;
      v_quantity := (v_item ->> 'quantity')::integer;
    EXCEPTION
      WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE = '22023',
          MESSAGE = 'cart product ID or quantity is malformed';
    END;

    IF v_quantity < 1 OR v_quantity > 10000 THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'cart quantity must be between 1 and 10000';
    END IF;
    IF v_product_id = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023',
        MESSAGE = 'duplicate product lines must be normalized before cart sync';
    END IF;
    v_seen := pg_catalog.array_append(v_seen, v_product_id);

    IF NOT EXISTS (
      SELECT 1 FROM public.products AS p
       WHERE p.id = v_product_id
         AND p.organization_id = v_org
         AND p.status = 'active'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002',
        MESSAGE = 'Product is not available in this storefront tenant';
    END IF;

    v_validated := v_validated || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('product_id', v_product_id, 'quantity', v_quantity)
    );
  END LOOP;

  -- Clearing a never-created cart is a no-op; do not create empty server rows.
  IF pg_catalog.jsonb_array_length(v_validated) = 0 THEN
    SELECT c.id INTO v_cart_id
      FROM public.customer_carts AS c
     WHERE c.organization_id = v_org
       AND c.profile_id = v_actor
       AND c.status = 'active'
     FOR UPDATE;

    IF v_cart_id IS NULL THEN
      RETURN pg_catalog.jsonb_build_object('items', '[]'::jsonb, 'updated_at', NULL);
    END IF;
  ELSE
    -- The partial unique index serializes concurrent first-time cart creation.
    INSERT INTO public.customer_carts(organization_id, profile_id, status)
    VALUES (v_org, v_actor, 'active')
    ON CONFLICT (organization_id, profile_id) WHERE status = 'active'
    DO UPDATE SET updated_at = pg_catalog.now()
    RETURNING id INTO v_cart_id;
  END IF;

  -- One row lock covers delete+insert so parallel syncs cannot produce duplicate or mixed line sets.
  PERFORM 1 FROM public.customer_carts AS c
   WHERE c.id = v_cart_id AND c.organization_id = v_org
   FOR UPDATE;

  DELETE FROM public.customer_cart_items AS i
   WHERE i.organization_id = v_org AND i.cart_id = v_cart_id;

  FOR v_item IN
    SELECT entry.value
      FROM pg_catalog.jsonb_array_elements(v_validated) AS entry(value)
  LOOP
    INSERT INTO public.customer_cart_items(
      organization_id, cart_id, product_id, quantity
    )
    VALUES (
      v_org,
      v_cart_id,
      (v_item ->> 'product_id')::uuid,
      (v_item ->> 'quantity')::integer
    );
  END LOOP;

  UPDATE public.customer_carts
     SET updated_at = pg_catalog.now()
   WHERE id = v_cart_id AND organization_id = v_org;

  RETURN public.get_customer_cart();
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_cart() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.sync_customer_cart(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_cart() TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_customer_cart(jsonb) TO authenticated;

COMMENT ON FUNCTION public.get_customer_cart() IS
  'Returns the authenticated customer's cart only while customer ownership or company membership is active; serializes reads against member revocation and returns no prices or totals.';
COMMENT ON FUNCTION public.sync_customer_cart(jsonb) IS
  'Atomically replaces the authenticated customer cart after strict tenant/product/quantity validation and serializes writes against company-member revocation.';

COMMIT;
