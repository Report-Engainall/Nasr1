BEGIN;

CREATE TABLE public.storefront_product_questions (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  question_text text NOT NULL CHECK (pg_catalog.char_length(question_text) BETWEEN 10 AND 800),
  answer_text text CHECK (answer_text IS NULL OR pg_catalog.char_length(answer_text) BETWEEN 5 AND 1500),
  moderation_status text NOT NULL DEFAULT 'pending'
    CHECK (moderation_status IN ('pending', 'answered', 'rejected')),
  verified_purchase boolean NOT NULL DEFAULT false,
  moderator_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  moderation_note text CHECK (moderation_note IS NULL OR pg_catalog.char_length(moderation_note) BETWEEN 5 AND 500),
  moderated_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK ((moderation_status = 'answered') = (answered_at IS NOT NULL)),
  CHECK ((moderation_status = 'rejected') = (moderation_note IS NOT NULL)),
  CHECK ((moderation_status = 'answered') = (answer_text IS NOT NULL))
);

CREATE INDEX storefront_product_questions_public_page
  ON public.storefront_product_questions (organization_id, product_id, answered_at DESC, id DESC)
  WHERE moderation_status = 'answered';

CREATE INDEX storefront_product_questions_moderation_queue
  ON public.storefront_product_questions (organization_id, created_at, id)
  WHERE moderation_status = 'pending';

CREATE INDEX storefront_product_questions_customer_history
  ON public.storefront_product_questions (organization_id, customer_id, product_id, created_at DESC, id DESC);

ALTER TABLE public.storefront_product_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.storefront_product_questions FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_storefront_product_questions(
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
  v_total bigint;
  v_items jsonb;
BEGIN
  IF p_product_id IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 20
     OR p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Invalid product question page';
  END IF;

  IF v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.organization_id = v_org AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Product is not available in the public storefront';
  END IF;

  SELECT pg_catalog.count(*) INTO v_total
  FROM public.storefront_product_questions q
  WHERE q.organization_id = v_org
    AND q.product_id = p_product_id
    AND q.moderation_status = 'answered';

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', page.id,
      'question_text', page.question_text,
      'answer_text', page.answer_text,
      'verified_purchase', page.verified_purchase,
      'created_at', page.created_at,
      'answered_at', page.answered_at
    ) ORDER BY page.answered_at DESC, page.id DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT q.id, q.question_text, q.answer_text, q.verified_purchase, q.created_at, q.answered_at
    FROM public.storefront_product_questions q
    WHERE q.organization_id = v_org
      AND q.product_id = p_product_id
      AND q.moderation_status = 'answered'
    ORDER BY q.answered_at DESC, q.id DESC
    LIMIT p_limit OFFSET p_offset
  ) page;

  RETURN pg_catalog.jsonb_build_object(
    'question_count', v_total,
    'items', v_items,
    'has_more', p_offset + pg_catalog.jsonb_array_length(v_items) < v_total
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_storefront_product_questions(uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_storefront_product_questions(uuid, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_customer_product_questions_context(p_product_id uuid)
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
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Authentication is required';
  END IF;

  SELECT p.id, p.organization_id INTO v_profile_id, v_org
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid() AND p.is_active = true
  ORDER BY p.created_at, p.id
  LIMIT 1;

  IF v_profile_id IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id = v_profile_id AND r.role = 'customer'
  ) OR COALESCE(public.is_staff(), false) THEN
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

  IF p_product_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = p_product_id AND p.organization_id = v_org AND p.status = 'active'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Product is not available in this customer organization';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', page.id,
      'question_text', page.question_text,
      'answer_text', page.answer_text,
      'moderation_status', page.moderation_status,
      'moderation_note', page.moderation_note,
      'verified_purchase', page.verified_purchase,
      'created_at', page.created_at,
      'updated_at', page.updated_at,
      'answered_at', page.answered_at
    ) ORDER BY page.created_at DESC, page.id DESC
  ), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT q.id, q.question_text, q.answer_text, q.moderation_status,
           q.moderation_note, q.verified_purchase, q.created_at, q.updated_at, q.answered_at
    FROM public.storefront_product_questions q
    WHERE q.organization_id = v_org
      AND q.customer_id = v_customer_id
      AND q.product_id = p_product_id
    ORDER BY q.created_at DESC, q.id DESC
    LIMIT 50
  ) page;

  RETURN pg_catalog.jsonb_build_object('items', v_items);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_customer_product_questions_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_customer_product_questions_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_storefront_product_question(
  p_product_id uuid,
  p_question_text text
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
  v_question_id uuid;
  v_question text := pg_catalog.btrim(COALESCE(p_question_text, ''));
  v_verified_purchase boolean := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in as a customer before submitting a product question';
  END IF;

  IF p_product_id IS NULL OR pg_catalog.char_length(v_question) < 10
     OR pg_catalog.char_length(v_question) > 800 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Product question must contain between 10 and 800 characters';
  END IF;

  SELECT p.id, p.organization_id INTO v_profile_id, v_org
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid() AND p.is_active = true
  ORDER BY p.created_at, p.id
  LIMIT 1;

  IF v_profile_id IS NULL OR v_org IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.profile_id = v_profile_id AND r.role = 'customer'
  ) OR COALESCE(public.is_staff(), false) THEN
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

  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.organization_id = v_org
      AND o.customer_id = v_customer_id
      AND o.status = 'delivered'
      AND oi.product_id = p_product_id
  ) INTO v_verified_purchase;

  INSERT INTO public.storefront_product_questions (
    organization_id, customer_id, profile_id, product_id, question_text, verified_purchase
  ) VALUES (
    v_org, v_customer_id, v_profile_id, p_product_id, v_question, v_verified_purchase
  )
  RETURNING id INTO v_question_id;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_profile_id, 'storefront.product_question.submitted', 'storefront_product_question', v_question_id,
    NULL,
    pg_catalog.jsonb_build_object('product_id', p_product_id, 'verified_purchase', v_verified_purchase)
  );

  RETURN pg_catalog.jsonb_build_object(
    'id', v_question_id,
    'moderation_status', 'pending',
    'message', 'تم إرسال سؤالك إلى فريق المتجر للمراجعة والإجابة'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.submit_storefront_product_question(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_storefront_product_question(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_pending_storefront_product_questions(p_limit integer DEFAULT 50)
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
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Question queue limit must be between 1 and 100';
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', page.id,
      'product_id', page.product_id,
      'product_name', page.product_name,
      'item_code', page.item_code,
      'question_text', page.question_text,
      'verified_purchase', page.verified_purchase,
      'created_at', page.created_at
    ) ORDER BY page.created_at, page.id
  ), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT q.id, q.product_id, p.name AS product_name, p.item_code,
           q.question_text, q.verified_purchase, q.created_at
    FROM public.storefront_product_questions q
    JOIN public.products p ON p.id = q.product_id AND p.organization_id = v_org
    WHERE q.organization_id = v_org AND q.moderation_status = 'pending'
    ORDER BY q.created_at, q.id
    LIMIT p_limit
  ) page;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_pending_storefront_product_questions(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_pending_storefront_product_questions(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.moderate_storefront_product_question(
  p_question_id uuid,
  p_decision text,
  p_answer text DEFAULT NULL,
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
  v_answer text := pg_catalog.btrim(COALESCE(p_answer, ''));
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

  IF p_question_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('answer', 'reject')
     OR (p_decision = 'answer' AND pg_catalog.char_length(v_answer) NOT BETWEEN 5 AND 1500)
     OR (p_decision = 'reject' AND pg_catalog.char_length(v_note) NOT BETWEEN 5 AND 500) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Question decision requires a valid public answer or a rejection reason';
  END IF;

  v_new_status := CASE WHEN p_decision = 'answer' THEN 'answered' ELSE 'rejected' END;

  SELECT q.moderation_status INTO v_old_status
  FROM public.storefront_product_questions q
  WHERE q.id = p_question_id AND q.organization_id = v_org
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Question not found in the current organization';
  END IF;
  IF v_old_status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Only pending product questions can be answered or rejected';
  END IF;

  UPDATE public.storefront_product_questions
  SET moderation_status = v_new_status,
      answer_text = CASE WHEN p_decision = 'answer' THEN v_answer ELSE NULL END,
      moderation_note = CASE WHEN p_decision = 'reject' THEN v_note ELSE NULL END,
      moderator_profile_id = v_profile_id,
      moderated_at = pg_catalog.now(),
      answered_at = CASE WHEN p_decision = 'answer' THEN pg_catalog.now() ELSE NULL END,
      updated_at = pg_catalog.now()
  WHERE id = p_question_id AND organization_id = v_org;

  INSERT INTO public.audit_logs (
    organization_id, actor_id, action, entity_type, entity_id, old_value, new_value
  ) VALUES (
    v_org, v_profile_id,
    CASE WHEN p_decision = 'answer' THEN 'storefront.product_question.answered' ELSE 'storefront.product_question.rejected' END,
    'storefront_product_question', p_question_id,
    pg_catalog.jsonb_build_object('moderation_status', v_old_status),
    pg_catalog.jsonb_build_object(
      'moderation_status', v_new_status,
      'answer_present', p_decision = 'answer',
      'rejection_note_present', p_decision = 'reject'
    )
  );

  RETURN pg_catalog.jsonb_build_object('id', p_question_id, 'moderation_status', v_new_status);
END;
$function$;

REVOKE ALL ON FUNCTION public.moderate_storefront_product_question(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_storefront_product_question(uuid, text, text, text) TO authenticated;

COMMENT ON TABLE public.storefront_product_questions IS
  'Tenant-scoped customer product questions. Customers submit through SECURITY DEFINER RPCs; public reads expose answered questions only; manager answers/rejections are actor-audited. Browser table access is denied.';

COMMIT;
