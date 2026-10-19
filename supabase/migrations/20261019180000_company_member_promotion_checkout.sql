-- AGH-COMPANY-MEMBER-CHECKOUT-001
-- Keep the promotion price snapshots introduced by the previous migration while preserving
-- company-member identity from the membership migration. Buyer/finance/viewer capabilities
-- are checked server-side; orders created by a member must belong to the invited company,
-- never to an automatically-created duplicate customer profile.

BEGIN;

CREATE OR REPLACE FUNCTION public.place_order(
  _items jsonb,
  _notes text,
  _business_name text,
  _contact_name text,
  _phone text,
  _payment_terms text DEFAULT 'cash_on_delivery',
  _idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_customer uuid;
  v_tier text := 'retail';
  v_customer_status text := 'pending';
  v_credit_limit numeric(15,2) := 0;
  v_current_balance numeric(15,2) := 0;
  v_order uuid;
  v_order_no text;
  v_total numeric(15,2) := 0;
  v_total_items integer := 0;
  v_line jsonb;
  v_aggregated record;
  v_payload_hash text;
  v_existing_hash text;
  v_existing_terms text;
  v_existing_order uuid;
  v_existing_order_no text;
  v_existing_total numeric(15,2);
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_product public.products%ROWTYPE;
  v_unit_price numeric(15,2);
  v_line_total numeric(15,2);
  v_discount_per_unit numeric(15,2) := 0;
  v_discount_total numeric(15,2) := 0;
  v_promotion record;
  v_key text := nullif(pg_catalog.btrim(coalesce(_idempotency_key,'')),'');
  v_terms text := pg_catalog.lower(pg_catalog.btrim(coalesce(_payment_terms,'cash_on_delivery')));
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='يجب تسجيل الدخول'; END IF;
  IF NOT public.current_customer_can('orders.create') THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='company member is not allowed to place orders';
  END IF;
  IF v_key IS NULL OR pg_catalog.length(v_key)<16 OR pg_catalog.length(v_key)>128
     OR v_key !~ '^[A-Za-z0-9_-]+$' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح محاولة الطلب غير صالح؛ حدّث الصفحة وحاول مرة أخرى';
  END IF;
  IF v_terms NOT IN ('cash_on_delivery','credit') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='شروط الدفع غير صالحة';
  END IF;
  IF _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array'
     OR pg_catalog.jsonb_array_length(_items)<1 OR pg_catalog.jsonb_array_length(_items)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='يجب أن تحتوي السلة على صنف واحد إلى 100 صنف';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(coalesce(_contact_name,'')))<2
     OR pg_catalog.length(pg_catalog.btrim(coalesce(_phone,'')))<6 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الاسم ورقم الهاتف مطلوبان';
  END IF;

  -- Validate all lines before computing a stable payload fingerprint or looking up a replay.
  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(_items) LOOP
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      v_quantity := (v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='رمز المنتج أو الكمية غير صالح';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<>pg_catalog.trunc(v_quantity)
       OR v_quantity<1 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='الكمية يجب أن تكون عددًا صحيحًا بين 1 و10000';
    END IF;
  END LOOP;

  SELECT pg_catalog.md5(pg_catalog.jsonb_build_object(
    'items',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('product_id',item.product_id::text,'quantity',item.quantity) ORDER BY item.product_id),'[]'::jsonb),
    'notes',pg_catalog.left(coalesce(_notes,''),1000),
    'business_name',pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
    'contact_name',pg_catalog.left(pg_catalog.btrim(_contact_name),120),
    'phone',pg_catalog.left(pg_catalog.btrim(_phone),40),
    'payment_terms',v_terms
  )::text) INTO v_payload_hash
  FROM (
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
  ) AS item;

  -- Serialize submissions from the same authenticated profile using the same retry key.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_profile::text || ':' || v_key,0));

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
   FOR UPDATE;
  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='حسابك غير مرتبط بمؤسسة نشطة';
  END IF;

  -- If the same submission already committed, return the original server result.
  SELECT o.id,o.order_number,o.total_amount,o.idempotency_payload_hash,o.payment_terms
    INTO v_existing_order,v_existing_order_no,v_existing_total,v_existing_hash,v_existing_terms
    FROM public.orders o
   WHERE o.organization_id=v_org AND o.created_by=v_profile AND o.idempotency_key=v_key
   LIMIT 1;
  IF FOUND THEN
    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='مفتاح منع التكرار استُخدم سابقًا لبيانات طلب مختلفة؛ راجع طلباتك قبل إنشاء طلب جديد';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'id',v_existing_order,'order_number',v_existing_order_no,'total_amount',v_existing_total,
      'payment_terms',v_existing_terms,'idempotent_replay',true
    );
  END IF;

  SELECT c.id,c.tier,c.status,coalesce(c.credit_limit,0),coalesce(c.current_balance,0)
    INTO v_customer,v_tier,v_customer_status,v_credit_limit,v_current_balance
    FROM public.customers c
   WHERE c.id=public.current_customer_id() AND c.organization_id=v_org
   ORDER BY c.created_at
   LIMIT 1
   FOR UPDATE;

  IF v_customer IS NULL THEN
    INSERT INTO public.customers(
      organization_id,profile_id,customer_code,business_name,contact_name,phone,email,tier,status
    )
    VALUES(
      v_org,v_profile,
      'CUST-'||pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8)),
      pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
      pg_catalog.left(pg_catalog.btrim(_contact_name),120),
      pg_catalog.left(pg_catalog.btrim(_phone),40),
      (SELECT p.email FROM public.profiles p WHERE p.id=v_profile),
      'retail','pending'
    )
    RETURNING id,tier,status,coalesce(credit_limit,0),coalesce(current_balance,0)
      INTO v_customer,v_tier,v_customer_status,v_credit_limit,v_current_balance;
  END IF;

  v_tier := coalesce(nullif(v_tier,''),'retail');
  IF v_customer_status<>'approved' THEN v_tier:='retail'; END IF;
  v_order_no := 'ORD-'||pg_catalog.to_char(pg_catalog.now(),'YYMMDD')||'-'||
    pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(pg_catalog.gen_random_uuid()::text,'-',''),1,8));

  INSERT INTO public.orders(
    organization_id,customer_id,order_number,status,notes,created_by,idempotency_key,payment_terms,
    business_name_snapshot,contact_name_snapshot,phone_snapshot,idempotency_payload_hash
  )
  VALUES(
    v_org,v_customer,v_order_no,'pending',
    pg_catalog.left(coalesce(_notes,''),1000),v_profile,v_key,v_terms,
    pg_catalog.left(coalesce(nullif(pg_catalog.btrim(_business_name),''),pg_catalog.btrim(_contact_name)),200),
    pg_catalog.left(pg_catalog.btrim(_contact_name),120),pg_catalog.left(pg_catalog.btrim(_phone),40),v_payload_hash
  )
  RETURNING id INTO v_order;

  -- Consolidate duplicate product rows and price each aggregate using the customer's tier.
  FOR v_aggregated IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
     ORDER BY (entry.value->>'product_id')::uuid
  LOOP
    v_product_id := v_aggregated.product_id;
    v_quantity := v_aggregated.quantity;
    IF v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='إجمالي كمية الصنف الواحد لا يمكن أن يتجاوز 10000';
    END IF;

    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='أحد المنتجات غير متاح في مؤسستك'; END IF;

    v_unit_price:=public.customer_product_unit_price(v_product.id,v_org,v_tier,v_quantity);
    SELECT * INTO v_promotion
      FROM public.resolve_active_promotion_price(v_product.id,v_org,v_unit_price);
    v_discount_per_unit := v_promotion.discount_per_unit;
    v_discount_total := pg_catalog.round(v_discount_per_unit*v_quantity,2);
    v_line_total := pg_catalog.round((v_unit_price-v_discount_per_unit)*v_quantity,2);
    INSERT INTO public.order_items(
      order_id,product_id,item_code,product_name_snapshot,unit_snapshot,quantity,
      unit_price_snapshot,discount_snapshot,promotion_discount_per_unit_snapshot,
      promotion_id_snapshot,promotion_title_snapshot,promotion_discount_type_snapshot,
      promotion_discount_value_snapshot,line_total
    )
    VALUES(
      v_order,v_product.id,v_product.item_code,v_product.name,v_product.unit,v_quantity,
      v_unit_price,v_discount_total,v_discount_per_unit,
      v_promotion.promotion_id,v_promotion.promotion_title,v_promotion.discount_type,
      v_promotion.discount_value,v_line_total
    );
    v_total := v_total+v_line_total;
    v_total_items := v_total_items+1;
  END LOOP;

  IF v_terms='credit' THEN
    IF v_customer_status<>'approved' THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='الدفع الآجل متاح للحسابات التجارية المعتمدة فقط';
    END IF;
    IF v_credit_limit<=0 OR v_current_balance+v_total>v_credit_limit THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='تجاوز الطلب حد الائتمان المتاح؛ اختر الدفع عند الاستلام أو تواصل مع إدارة الحساب';
    END IF;
  END IF;

  UPDATE public.orders SET total_amount=v_total,total_items=v_total_items,updated_at=pg_catalog.now() WHERE id=v_order;
  INSERT INTO public.order_status_history(order_id,to_status,changed_by,notes)
  VALUES(v_order,'pending',v_profile,'طلب من متجر العميل');

  RETURN pg_catalog.jsonb_build_object(
    'id',v_order,'order_number',v_order_no,'total_amount',v_total,
    'payment_terms',v_terms,'idempotent_replay',false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_order_pricing(_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_tier text := 'retail';
  v_customer_status text := 'pending';
  v_currency text := 'YER';
  v_line jsonb;
  v_aggregated record;
  v_product public.products%ROWTYPE;
  v_product_id uuid;
  v_quantity numeric(15,3);
  v_unit_price numeric(15,2);
  v_line_total numeric(15,2);
  v_discount_per_unit numeric(15,2) := 0;
  v_promotion record;
  v_total numeric(15,2):=0;
  v_items jsonb:='[]'::jsonb;
  v_count integer:=0;
BEGIN
  IF v_profile IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required'; END IF;
  IF _items IS NULL OR pg_catalog.jsonb_typeof(_items)<>'array' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='items must be an array';
  END IF;
  IF pg_catalog.jsonb_array_length(_items)<1 OR pg_catalog.jsonb_array_length(_items)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='cart must contain between 1 and 100 items';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v_org AND o.is_active) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active organization context required';
  END IF;

  SELECT c.tier,c.status INTO v_tier,v_customer_status
    FROM public.customers c
   WHERE c.profile_id=v_profile AND c.organization_id=v_org
   ORDER BY c.created_at LIMIT 1;
  IF NOT FOUND THEN
    v_tier:='retail';
    v_customer_status:='pending';
  END IF;
  v_tier:=coalesce(nullif(v_tier,''),'retail');
  IF v_customer_status<>'approved' THEN v_tier:='retail'; END IF;
  SELECT o.currency INTO v_currency FROM public.organizations o WHERE o.id=v_org;

  FOR v_line IN SELECT value FROM pg_catalog.jsonb_array_elements(_items) LOOP
    BEGIN
      v_product_id:=(v_line->>'product_id')::uuid;
      v_quantity:=(v_line->>'quantity')::numeric;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid product id or quantity';
    END;
    IF v_product_id IS NULL OR v_quantity IS NULL OR v_quantity<>pg_catalog.trunc(v_quantity)
       OR v_quantity<1 OR v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quantity must be a positive integer not exceeding 10000';
    END IF;
  END LOOP;

  FOR v_aggregated IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           sum((entry.value->>'quantity')::numeric)::numeric(15,3) AS quantity
      FROM pg_catalog.jsonb_array_elements(_items) AS entry(value)
     GROUP BY (entry.value->>'product_id')::uuid
     ORDER BY (entry.value->>'product_id')::uuid
  LOOP
    v_product_id:=v_aggregated.product_id;
    v_quantity:=v_aggregated.quantity;
    IF v_quantity>10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='aggregate quantity exceeds 10000 for one product';
    END IF;
    SELECT p.* INTO v_product
      FROM public.products p
     WHERE p.id=v_product_id AND p.organization_id=v_org AND p.status='active'
     FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product is unavailable in this organization'; END IF;

    v_unit_price:=public.customer_product_unit_price(v_product.id,v_org,v_tier,v_quantity);
    SELECT * INTO v_promotion
      FROM public.resolve_active_promotion_price(v_product.id,v_org,v_unit_price);
    v_discount_per_unit:=v_promotion.discount_per_unit;
    v_line_total:=pg_catalog.round((v_unit_price-v_discount_per_unit)*v_quantity,2);
    v_total:=v_total+v_line_total;
    v_count:=v_count+1;
    v_items:=v_items||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id',v_product.id,
      'name',v_product.name,
      'item_code',v_product.item_code,
      'unit',v_product.unit,
      'quantity',v_quantity,
      'unit_price',pg_catalog.round(v_unit_price-v_discount_per_unit,2),
      'original_unit_price',v_unit_price,
      'discount_per_unit',v_discount_per_unit,
      'discount_amount',pg_catalog.round(v_discount_per_unit*v_quantity,2),
      'promotion_title',v_promotion.promotion_title,
      'line_total',v_line_total
    ));
  END LOOP;

  RETURN pg_catalog.jsonb_build_object(
    'items',v_items,
    'total_amount',v_total,
    'currency',coalesce(v_currency,'YER'),
    'customer_tier',v_tier,
    'price_basis','server'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(
  p_product_ids uuid[],
  p_quantity numeric DEFAULT 1
)
RETURNS TABLE(product_id uuid, unit_price numeric(15,2))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_organization_id uuid;
  v_customer_id uuid;
  v_tier text := 'retail';
  v_customer_status text;
  v_is_staff boolean := false;
BEGIN
  IF p_product_ids IS NULL OR pg_catalog.cardinality(p_product_ids) = 0 THEN
    RETURN;
  END IF;

  IF pg_catalog.cardinality(p_product_ids) > 500
     OR pg_catalog.array_position(p_product_ids, NULL::uuid) IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='product batch must contain at most 500 non-null ids';
  END IF;

  IF p_quantity IS NULL
     OR p_quantity::text IN ('NaN','Infinity','-Infinity')
     OR p_quantity <> pg_catalog.trunc(p_quantity)
     OR p_quantity < 1
     OR p_quantity > 10000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='price quantity must be an integer between 1 and 10000';
  END IF;

  IF auth.uid() IS NULL THEN
    v_organization_id := public.public_storefront_organization_id();
  ELSE
    SELECT p.id, p.organization_id,
           EXISTS (
             SELECT 1
               FROM public.user_roles r
              WHERE r.profile_id = p.id
                AND r.role IN ('admin','manager','staff','accountant')
           )
      INTO v_profile_id, v_organization_id, v_is_staff
      FROM public.profiles p
     WHERE p.auth_user_id = auth.uid()
       AND p.is_active = true
     ORDER BY p.created_at, p.id
     LIMIT 1;

    IF v_profile_id IS NULL OR v_organization_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active profile and organization required to resolve catalog prices';
    END IF;

    IF NOT v_is_staff THEN
      v_customer_id := public.current_customer_id();
      IF v_customer_id IS NOT NULL THEN
        SELECT c.status, c.tier
          INTO v_customer_status, v_tier
          FROM public.customers c
         WHERE c.id = v_customer_id
           AND c.organization_id = v_organization_id;
        IF NOT FOUND OR v_customer_status IS DISTINCT FROM 'approved' THEN
          v_tier := 'retail';
        ELSE
          v_tier := coalesce(nullif(v_tier,''),'retail');
        END IF;
      ELSE
        v_tier := 'retail';
      END IF;
    END IF;
  END IF;

  IF v_organization_id IS NULL
     OR NOT EXISTS (
       SELECT 1
         FROM public.organizations o
        WHERE o.id = v_organization_id
          AND o.is_active = true
     ) THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active storefront organization is required';
  END IF;

  RETURN QUERY
    SELECT p.id,
           CASE WHEN v_is_staff THEN pg_catalog.round(p.base_price,2)
                ELSE (
                  SELECT resolved.net_unit_price
                    FROM public.resolve_active_promotion_price(
                      p.id,
                      v_organization_id,
                      public.customer_product_unit_price(p.id, v_organization_id, v_tier, p_quantity)
                    ) AS resolved
                )
           END::numeric(15,2)
      FROM public.products p
     WHERE p.id = ANY(p_product_ids)
       AND p.organization_id = v_organization_id
       AND p.status = 'active'
     ORDER BY p.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.place_order(jsonb,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.place_order(jsonb,text,text,text,text,text,text) IS
  'Internal order command with server-derived company identity, capability checks, idempotency, server-side tier and promotion pricing, and immutable order-line pricing snapshots. The customer-facing submit_customer_order command is the authenticated entry point.';

COMMIT;
