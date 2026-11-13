BEGIN;

-- Verified product reviews are written only against a delivered order line.
-- No browser role can read or mutate this table directly; all access is through
-- narrow SECURITY DEFINER RPCs with auth.uid()-derived customer/tenant context.
CREATE TABLE public.storefront_product_reviews (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT '' CHECK (pg_catalog.char_length(title) <= 100),
  body text NOT NULL CHECK (pg_catalog.char_length(body) BETWEEN 10 AND 1500),
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'approved', 'rejected')),
  moderator_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  moderation_note text CHECK (moderation_note IS NULL OR pg_catalog.char_length(moderation_note) <= 500),
  moderated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT storefront_product_reviews_one_per_customer_product
    UNIQUE (organization_id, customer_id, product_id)
);

CREATE INDEX storefront_product_reviews_public_page
  ON public.storefront_product_reviews (organization_id, product_id, created_at DESC, id DESC)
  WHERE moderation_status = 'approved';

CREATE INDEX storefront_product_reviews_moderation_queue
  ON public.storefront_product_reviews (organization_id, created_at, id)
  WHERE moderation_status = 'pending';

ALTER TABLE public.storefront_product_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storefront_product_reviews FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_storefront_product_reviews(
  p_product_id uuid,
  p_limit integer DEFAULT 8,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_org uuid := public.public_storefront_organization_id();
  v_result jsonb;
BEGIN
  IF p_product_id IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 20
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid product review page';
  END IF;

  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.organization_id = v_org AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Product is not available in the public storefront';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'average_rating', COALESCE((
      SELECT pg_catalog.round(pg_catalog.avg(r.rating)::numeric, 2)
      FROM public.storefront_product_reviews r
      WHERE r.organization_id = v_org
        AND r.product_id = p_product_id
        AND r.moderation_status = 'approved'
    ), 0),
    'review_count', (
      SELECT pg_catalog.count(*)::integer
      FROM public.storefront_product_reviews r
      WHERE r.organization_id = v_org
        AND r.product_id = p_product_id
        AND r.moderation_status = 'approved'
    ),
    'items', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', page.id,
          'rating', page.rating,
          'title', page.title,
          'body', page.body,
          'created_at', page.created_at,
          'verified_purchase', true
        ) ORDER BY page.created_at DESC, page.id DESC
      )
      FROM (
        SELECT r.id, r.rating, r.title, r.body, r.created_at
        FROM public.storefront_product_reviews r
        WHERE r.organization_id = v_org
          AND r.product_id = p_product_id
          AND r.moderation_status = 'approved'
        ORDER BY r.created_at DESC, r.id DESC
        LIMIT p_limit OFFSET p_offset
      ) page
    ), '[]'::jsonb),
    'has_more', (
      SELECT pg_catalog.count(*) > (p_offset + p_limit)
      FROM public.storefront_product_reviews r
      WHERE r.organization_id = v_org
        AND r.product_id = p_product_id
        AND r.moderation_status = 'approved'
    )
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_storefront_product_reviews(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_product_reviews(uuid, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_product_review_context(p_product_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_org uuid;
  v_customer_id uuid;
  v_order_item_id uuid;
  v_order_number text;
  v_delivered_at timestamptz;
  v_review jsonb;
  v_eligible boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_product_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Customer authentication and product are required';
  END IF;

  SELECT p.id, p.organization_id INTO v_profile_id, v_org
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid() AND p.is_active = true
  ORDER BY p.created_at, p.id
  LIMIT 1;

  IF v_profile_id IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id = v_profile_id AND r.role = 'customer'
  ) OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An active customer account is required';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.profile_id = v_profile_id
    AND c.organization_id = v_org
    AND c.status = 'approved'
  ORDER BY c.created_at, c.id
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An approved customer account is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.organization_id = v_org AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Product is not available in this customer organization';
  END IF;

  SELECT oi.id, o.order_number,
         COALESCE((
           SELECT pg_catalog.max(h.created_at)
           FROM public.order_status_history h
           WHERE h.order_id = o.id AND h.to_status = 'delivered'
         ), o.updated_at)
    INTO v_order_item_id, v_order_number, v_delivered_at
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE o.organization_id = v_org
    AND o.customer_id = v_customer_id
    AND o.status = 'delivered'
    AND oi.product_id = p_product_id
  ORDER BY COALESCE((SELECT pg_catalog.max(h.created_at) FROM public.order_status_history h WHERE h.order_id = o.id AND h.to_status = 'delivered'), o.updated_at) DESC, oi.id DESC
  LIMIT 1;

  v_eligible := v_order_item_id IS NOT NULL;

  SELECT pg_catalog.jsonb_build_object(
    'id', r.id,
    'rating', r.rating,
    'title', r.title,
    'body', r.body,
    'moderation_status', r.moderation_status,
    'moderation_note', r.moderation_note,
    'created_at', r.created_at,
    'updated_at', r.updated_at
  ) INTO v_review
  FROM public.storefront_product_reviews r
  WHERE r.organization_id = v_org
    AND r.customer_id = v_customer_id
    AND r.product_id = p_product_id
  LIMIT 1;

  RETURN pg_catalog.jsonb_build_object(
    'eligible', v_eligible,
    'order_item_id', v_order_item_id,
    'order_number', v_order_number,
    'delivered_at', v_delivered_at,
    'review', v_review
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_product_review_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_product_review_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_storefront_product_review(
  p_product_id uuid,
  p_order_item_id uuid,
  p_rating smallint,
  p_title text,
  p_body text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid;
  v_org uuid;
  v_customer_id uuid;
  v_order_id uuid;
  v_review_id uuid;
  v_clean_title text := pg_catalog.left(pg_catalog.btrim(COALESCE(p_title, '')), 100);
  v_clean_body text := pg_catalog.btrim(COALESCE(p_body, ''));
  v_action text;
  v_previous_rating smallint;
  v_previous_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in as a customer before submitting a review';
  END IF;
  IF p_product_id IS NULL OR p_order_item_id IS NULL OR p_rating IS NULL
     OR p_rating < 1 OR p_rating > 5
     OR pg_catalog.char_length(v_clean_body) < 10
     OR pg_catalog.char_length(v_clean_body) > 1500 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Review rating or text is invalid';
  END IF;

  SELECT p.id, p.organization_id INTO v_profile_id, v_org
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid() AND p.is_active = true
  ORDER BY p.created_at, p.id
  LIMIT 1;

  IF v_profile_id IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id = v_profile_id AND r.role = 'customer'
  ) OR public.is_staff() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An active customer account is required';
  END IF;

  SELECT c.id INTO v_customer_id
  FROM public.customers c
  WHERE c.profile_id = v_profile_id
    AND c.organization_id = v_org
    AND c.status = 'approved'
  ORDER BY c.created_at, c.id
  LIMIT 1;

  IF v_customer_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'An approved customer account is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.organization_id = v_org AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Product is not available in this customer organization';
  END IF;

  SELECT o.id INTO v_order_id
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  WHERE oi.id = p_order_item_id
    AND oi.product_id = p_product_id
    AND o.customer_id = v_customer_id
    AND o.organization_id = v_org
    AND o.status = 'delivered'
  FOR UPDATE OF o;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'A delivered order containing this product is required to review it';
  END IF;

  SELECT r.rating, r.moderation_status
    INTO v_previous_rating, v_previous_status
  FROM public.storefront_product_reviews r
  WHERE r.organization_id = v_org
    AND r.customer_id = v_customer_id
    AND r.product_id = p_product_id
  FOR UPDATE;

  IF FOUND THEN
    v_action := 'storefront.product_review.resubmitted';
  ELSE
    v_action := 'storefront.product_review.submitted';
  END IF;

  INSERT INTO public.storefront_product_reviews(
    organization_id, customer_id, profile_id, product_id, order_id, order_item_id,
    rating, title, body, moderation_status, moderator_profile_id, moderation_note,
    moderated_at, updated_at
  )
  VALUES (
    v_org, v_customer_id, v_profile_id, p_product_id, v_order_id, p_order_item_id,
    p_rating, v_clean_title, v_clean_body, 'pending', NULL, NULL, NULL, pg_catalog.now()
  )
  ON CONFLICT (organization_id, customer_id, product_id)
  DO UPDATE SET
    profile_id = EXCLUDED.profile_id,
    order_id = EXCLUDED.order_id,
    order_item_id = EXCLUDED.order_item_id,
    rating = EXCLUDED.rating,
    title = EXCLUDED.title,
    body = EXCLUDED.body,
    moderation_status = 'pending',
    moderator_profile_id = NULL,
    moderation_note = NULL,
    moderated_at = NULL,
    updated_at = pg_catalog.now()
  RETURNING id INTO v_review_id;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  )
  VALUES (
    v_org, v_profile_id, v_action, 'storefront_product_review', v_review_id,
    pg_catalog.jsonb_build_object(
      'rating', v_previous_rating,
      'moderation_status', v_previous_status
    ),
    pg_catalog.jsonb_build_object(
      'rating', p_rating,
      'moderation_status', 'pending',
      'verified_purchase', true
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_review_id,
    'moderation_status', 'pending',
    'message', 'تم إرسال تقييمك للمراجعة قبل نشره'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_storefront_product_review(uuid, uuid, smallint, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_storefront_product_review(uuid, uuid, smallint, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pending_storefront_product_reviews(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_org uuid;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile_id AND p.auth_user_id = auth.uid() AND p.is_active = true;

  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id = v_profile_id AND r.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator or manager permission is required';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Review queue limit must be between 1 and 100';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', page.id,
      'product_id', page.product_id,
      'product_name', page.product_name,
      'item_code', page.item_code,
      'order_number', page.order_number,
      'rating', page.rating,
      'title', page.title,
      'body', page.body,
      'created_at', page.created_at
    ) ORDER BY page.created_at, page.id
  ), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT r.id, r.product_id, p.name AS product_name, p.item_code,
           o.order_number, r.rating, r.title, r.body, r.created_at
    FROM public.storefront_product_reviews r
    JOIN public.products p ON p.id = r.product_id AND p.organization_id = v_org
    JOIN public.orders o ON o.id = r.order_id AND o.organization_id = v_org
    WHERE r.organization_id = v_org AND r.moderation_status = 'pending'
    ORDER BY r.created_at, r.id
    LIMIT p_limit
  ) page;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_pending_storefront_product_reviews(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_storefront_product_reviews(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_storefront_product_review(
  p_review_id uuid,
  p_decision text,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_id uuid := public.current_profile_id();
  v_org uuid;
  v_old_status text;
  v_new_status text;
  v_note text := pg_catalog.left(pg_catalog.btrim(COALESCE(p_note, '')), 500);
BEGIN
  IF auth.uid() IS NULL OR v_profile_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  SELECT p.organization_id INTO v_org
  FROM public.profiles p
  WHERE p.id = v_profile_id AND p.auth_user_id = auth.uid() AND p.is_active = true;

  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id = v_profile_id AND r.role IN ('admin', 'manager')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Administrator or manager permission is required';
  END IF;

  IF p_review_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('approve', 'reject')
     OR (p_decision = 'reject' AND v_note = '') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Review decision and rejection reason are required';
  END IF;

  v_new_status := CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END;

  SELECT r.moderation_status INTO v_old_status
  FROM public.storefront_product_reviews r
  WHERE r.id = p_review_id AND r.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Review not found in the current organization';
  END IF;
  IF v_old_status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only pending reviews can be moderated';
  END IF;

  UPDATE public.storefront_product_reviews
  SET moderation_status = v_new_status,
      moderator_profile_id = v_profile_id,
      moderation_note = NULLIF(v_note, ''),
      moderated_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_review_id AND organization_id = v_org;

  INSERT INTO public.audit_logs(
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  )
  VALUES (
    v_org, v_profile_id, 'storefront.product_review.moderated', 'storefront_product_review', p_review_id,
    pg_catalog.jsonb_build_object('moderation_status', v_old_status),
    pg_catalog.jsonb_build_object('moderation_status', v_new_status, 'note_present', v_note <> '')
  );

  RETURN pg_catalog.jsonb_build_object('id', p_review_id, 'moderation_status', v_new_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.moderate_storefront_product_review(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_storefront_product_review(uuid, text, text) TO authenticated;

COMMENT ON TABLE public.storefront_product_reviews IS
  'One source-linked customer review per product. Submit is permitted only from a delivered order item; public reads expose approved reviews only. Browser table access is denied and all mutations are audited.';

COMMIT;
