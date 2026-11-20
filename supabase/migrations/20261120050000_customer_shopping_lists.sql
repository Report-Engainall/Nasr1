-- Customer-owned shopping lists, company sharing and explicit recurring review.
-- Scheduled runs create review snapshots only. They never create or submit orders.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_shopping_lists (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (name = pg_catalog.btrim(name) AND pg_catalog.char_length(name) BETWEEN 2 AND 100),
  category text NOT NULL DEFAULT 'custom'
    CHECK (category IN ('ramadan','monthly_sales','warehouse','quick_order','custom')),
  is_draft boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  recurrence text NOT NULL DEFAULT 'none' CHECK (recurrence IN ('none','weekly','monthly')),
  next_run_on date,
  timezone text NOT NULL DEFAULT 'Asia/Aden' CHECK (timezone = 'Asia/Aden'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CHECK (
    (recurrence = 'none' AND next_run_on IS NULL)
    OR (recurrence IN ('weekly','monthly') AND next_run_on IS NOT NULL AND is_draft = false AND status = 'active')
  ),
  UNIQUE (id, organization_id, customer_id)
);
CREATE INDEX IF NOT EXISTS customer_shopping_lists_owner_updated_idx
  ON public.customer_shopping_lists(organization_id, customer_id, owner_profile_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS customer_shopping_lists_recurrence_due_idx
  ON public.customer_shopping_lists(organization_id, next_run_on)
  WHERE recurrence <> 'none' AND status = 'active' AND is_draft = false;

CREATE TABLE IF NOT EXISTS public.customer_shopping_list_items (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  list_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  unit_name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(unit_name)) BETWEEN 1 AND 40),
  base_units_per_unit integer NOT NULL CHECK (base_units_per_unit BETWEEN 1 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  FOREIGN KEY (list_id, organization_id, customer_id)
    REFERENCES public.customer_shopping_lists(id, organization_id, customer_id) ON DELETE CASCADE,
  UNIQUE (list_id, product_id),
  CHECK (quantity::bigint * base_units_per_unit::bigint BETWEEN 1 AND 10000)
);
CREATE INDEX IF NOT EXISTS customer_shopping_list_items_scope_idx
  ON public.customer_shopping_list_items(organization_id, customer_id, list_id);

CREATE TABLE IF NOT EXISTS public.customer_shopping_list_shares (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  list_id uuid NOT NULL,
  member_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  access_level text NOT NULL CHECK (access_level IN ('view','edit')),
  shared_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  FOREIGN KEY (list_id, organization_id, customer_id)
    REFERENCES public.customer_shopping_lists(id, organization_id, customer_id) ON DELETE CASCADE,
  UNIQUE (list_id, member_profile_id)
);
CREATE INDEX IF NOT EXISTS customer_shopping_list_shares_member_idx
  ON public.customer_shopping_list_shares(organization_id, customer_id, member_profile_id);

CREATE TABLE IF NOT EXISTS public.customer_shopping_list_runs (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  list_id uuid NOT NULL,
  due_on date,
  status text NOT NULL DEFAULT 'review_required'
    CHECK (status IN ('review_required','cart_loaded','cancelled')),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  cart_loaded_at timestamptz,
  FOREIGN KEY (list_id, organization_id, customer_id)
    REFERENCES public.customer_shopping_lists(id, organization_id, customer_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS customer_shopping_list_runs_schedule_once_idx
  ON public.customer_shopping_list_runs(list_id, due_on) WHERE due_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS customer_shopping_list_runs_review_idx
  ON public.customer_shopping_list_runs(organization_id, customer_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.customer_shopping_list_run_items (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES public.customer_shopping_list_runs(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot text NOT NULL,
  item_code_snapshot text NOT NULL,
  base_unit_snapshot text NOT NULL,
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 10000),
  unit_name text NOT NULL CHECK (pg_catalog.char_length(pg_catalog.btrim(unit_name)) BETWEEN 1 AND 40),
  base_units_per_unit integer NOT NULL CHECK (base_units_per_unit BETWEEN 1 AND 1000000),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  UNIQUE (run_id, product_id),
  CHECK (quantity::bigint * base_units_per_unit::bigint BETWEEN 1 AND 10000)
);
CREATE INDEX IF NOT EXISTS customer_shopping_list_run_items_scope_idx
  ON public.customer_shopping_list_run_items(organization_id, customer_id, run_id);

ALTER TABLE public.customer_shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_shopping_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_shopping_list_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_shopping_list_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_shopping_list_run_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE
  public.customer_shopping_lists,
  public.customer_shopping_list_items,
  public.customer_shopping_list_shares,
  public.customer_shopping_list_runs,
  public.customer_shopping_list_run_items
FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE
  public.customer_shopping_lists,
  public.customer_shopping_list_items,
  public.customer_shopping_list_shares,
  public.customer_shopping_list_runs,
  public.customer_shopping_list_run_items
TO service_role;

CREATE OR REPLACE FUNCTION public.customer_shopping_list_can_access(
  p_list_id uuid,
  p_require_edit boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR v_customer IS NULL THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1
      FROM public.customer_shopping_lists AS l
      JOIN public.customers AS c
        ON c.id = l.customer_id
       AND c.organization_id = l.organization_id
     WHERE l.id = p_list_id
       AND l.organization_id = v_org
       AND l.customer_id = v_customer
       AND l.status = 'active'
       AND (
         l.owner_profile_id = v_profile
         OR l.created_by_profile_id = v_profile
         OR EXISTS (
           SELECT 1
             FROM public.customer_shopping_list_shares AS s
             JOIN public.customer_company_memberships AS m
               ON m.profile_id = s.member_profile_id
              AND m.customer_id = s.customer_id
              AND m.organization_id = s.organization_id
              AND m.status = 'active'
            WHERE s.list_id = l.id
              AND s.organization_id = v_org
              AND s.customer_id = v_customer
              AND s.member_profile_id = v_profile
              AND (NOT p_require_edit OR s.access_level = 'edit')
         )
       )
       AND (NOT p_require_edit OR public.current_customer_can('reorder.manage'))
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.customer_shopping_list_can_access(uuid,boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.materialize_due_customer_shopping_list_runs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_locked_customer uuid;
  v_list record;
  v_due date;
  v_next date;
  v_run_id uuid;
  v_created integer := 0;
  v_local_today date := (pg_catalog.now() AT TIME ZONE 'Asia/Aden')::date;
  v_iteration integer;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR NOT public.current_customer_can('reorder.manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'active customer buyer or owner permission is required to materialize recurring shopping lists';
  END IF;

  SELECT c.id INTO v_locked_customer
    FROM public.customers AS c
   WHERE c.id = v_customer AND c.organization_id = v_org
   FOR SHARE;
  IF v_locked_customer IS NULL OR public.current_customer_id() IS DISTINCT FROM v_customer
     OR NOT public.current_customer_can('reorder.manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'company membership is no longer active for recurring shopping lists';
  END IF;

  FOR v_list IN
    SELECT l.*
      FROM public.customer_shopping_lists AS l
     WHERE l.organization_id = v_org
       AND l.customer_id = v_customer
       AND l.status = 'active'
       AND l.is_draft = false
       AND l.recurrence IN ('weekly','monthly')
       AND l.next_run_on <= v_local_today
     ORDER BY l.next_run_on, l.id
     FOR UPDATE SKIP LOCKED
     LIMIT 100
  LOOP
    v_due := v_list.next_run_on;
    FOR v_iteration IN 1..12 LOOP
      EXIT WHEN v_due IS NULL OR v_due > v_local_today;
      v_run_id := NULL;
      INSERT INTO public.customer_shopping_list_runs(
        organization_id, customer_id, list_id, due_on, status, created_by_profile_id
      )
      VALUES (v_org, v_customer, v_list.id, v_due, 'review_required', v_profile)
      ON CONFLICT (list_id, due_on) WHERE due_on IS NOT NULL DO NOTHING
      RETURNING id INTO v_run_id;

      IF v_run_id IS NOT NULL THEN
        INSERT INTO public.customer_shopping_list_run_items(
          organization_id, customer_id, run_id, product_id,
          product_name_snapshot, item_code_snapshot, base_unit_snapshot,
          quantity, unit_name, base_units_per_unit
        )
        SELECT v_org, v_customer, v_run_id, i.product_id,
               p.name, p.item_code, p.unit,
               i.quantity, i.unit_name, i.base_units_per_unit
          FROM public.customer_shopping_list_items AS i
          JOIN public.products AS p
            ON p.id = i.product_id
           AND p.organization_id = v_org
         WHERE i.list_id = v_list.id
         ORDER BY i.product_id;
        INSERT INTO public.audit_logs(
          organization_id, actor_id, action, entity_type, entity_id, new_value
        ) VALUES (
          v_org, v_profile, 'customer.shopping_list.recurrence_due',
          'customer_shopping_list_run', v_run_id,
          pg_catalog.jsonb_build_object('list_id',v_list.id,'due_on',v_due,'recurrence',v_list.recurrence)
        );
        v_created := v_created + 1;
      END IF;

      v_next := CASE v_list.recurrence
        WHEN 'weekly' THEN v_due + 7
        WHEN 'monthly' THEN (v_due + interval '1 month')::date
        ELSE NULL
      END;
      v_due := v_next;
    END LOOP;

    UPDATE public.customer_shopping_lists
       SET next_run_on = v_due, updated_at = pg_catalog.now()
     WHERE id = v_list.id AND organization_id = v_org;
  END LOOP;

  RETURN pg_catalog.jsonb_build_object('created_runs',v_created,'local_date',v_local_today);
END;
$function$;
REVOKE ALL ON FUNCTION public.materialize_due_customer_shopping_list_runs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.materialize_due_customer_shopping_list_runs() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_customer_shopping_lists()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_locked_customer uuid;
  v_lists jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = v_profile AND p.auth_user_id = auth.uid()
          AND p.is_active AND p.organization_id = v_org
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active customer profile required to read shopping lists';
  END IF;

  SELECT c.id INTO v_locked_customer
    FROM public.customers AS c
   WHERE c.id = v_customer AND c.organization_id = v_org
   FOR SHARE;
  IF v_locked_customer IS NULL OR public.current_customer_id() IS DISTINCT FROM v_customer THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company membership is no longer active for shopping lists';
  END IF;

  IF public.current_customer_can('reorder.manage') THEN
    PERFORM public.materialize_due_customer_shopping_list_runs();
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', l.id,
      'name', l.name,
      'category', l.category,
      'is_draft', l.is_draft,
      'status', l.status,
      'recurrence', l.recurrence,
      'next_run_on', l.next_run_on,
      'timezone', l.timezone,
      'created_at', l.created_at,
      'updated_at', l.updated_at,
      'created_by_profile_id', l.created_by_profile_id,
      'can_edit', public.customer_shopping_list_can_access(l.id,true),
      'items', (
        SELECT coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'product_id', i.product_id,
            'product_name', p.name,
            'item_code', p.item_code,
            'base_unit', p.unit,
            'quantity', i.quantity,
            'unit_name', i.unit_name,
            'base_units_per_unit', i.base_units_per_unit
          ) ORDER BY p.name, i.product_id
        ), '[]'::jsonb)
          FROM public.customer_shopping_list_items AS i
          JOIN public.products AS p ON p.id = i.product_id AND p.organization_id = v_org
         WHERE i.list_id = l.id
      ),
      'shares', CASE WHEN l.owner_profile_id = v_profile THEN (
        SELECT coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'member_profile_id', s.member_profile_id,
            'access_level', s.access_level,
            'updated_at', s.updated_at
          ) ORDER BY s.updated_at DESC
        ), '[]'::jsonb)
          FROM public.customer_shopping_list_shares AS s
          JOIN public.customer_company_memberships AS m
            ON m.profile_id = s.member_profile_id
           AND m.customer_id = s.customer_id
           AND m.organization_id = s.organization_id
           AND m.status = 'active'
         WHERE s.list_id = l.id
      ) ELSE '[]'::jsonb END,
      'runs', (
        SELECT coalesce(pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object('id', r.id,'due_on',r.due_on,'status',r.status,'created_at',r.created_at)
          ORDER BY r.created_at DESC
        ), '[]'::jsonb)
          FROM public.customer_shopping_list_runs AS r
         WHERE r.list_id = l.id AND r.status = 'review_required'
      )
    ) ORDER BY l.updated_at DESC, l.id
  ), '[]'::jsonb)
    INTO v_lists
    FROM public.customer_shopping_lists AS l
   WHERE l.organization_id = v_org
     AND l.customer_id = v_customer
     AND l.status = 'active'
     AND (
       l.owner_profile_id = v_profile
       OR l.created_by_profile_id = v_profile
       OR EXISTS (
         SELECT 1 FROM public.customer_shopping_list_shares s
         JOIN public.customer_company_memberships m
           ON m.profile_id = s.member_profile_id
          AND m.customer_id = s.customer_id
          AND m.organization_id = s.organization_id
          AND m.status = 'active'
         WHERE s.list_id = l.id AND s.member_profile_id = v_profile
       )
       OR EXISTS (
         SELECT 1 FROM public.customers c
          WHERE c.id = v_customer AND c.profile_id = v_profile
       )
     );

  RETURN coalesce(v_lists, '[]'::jsonb);
END;
$function$;
REVOKE ALL ON FUNCTION public.list_customer_shopping_lists() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_customer_shopping_lists() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_customer_shopping_list(
  p_list_id uuid,
  p_name text,
  p_category text,
  p_is_draft boolean,
  p_recurrence text,
  p_next_run_on date,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_owner uuid;
  v_locked_customer uuid;
  v_list_id uuid;
  v_line jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_unit_name text;
  v_factor integer;
  v_base_quantity bigint;
  v_product record;
  v_seen uuid[] := ARRAY[]::uuid[];
  v_items jsonb := '[]'::jsonb;
  v_recurrence text := coalesce(p_recurrence,'none');
  v_category text := coalesce(p_category,'custom');
  v_name text := pg_catalog.btrim(coalesce(p_name,''));
  v_audit_action text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR NOT public.current_customer_can('reorder.manage')
     OR p_is_draft IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active customer buyer or owner permission is required to save shopping lists';
  END IF;
  IF pg_catalog.char_length(v_name) < 2 OR pg_catalog.char_length(v_name) > 100
     OR v_category NOT IN ('ramadan','monthly_sales','warehouse','quick_order','custom')
     OR v_recurrence NOT IN ('none','weekly','monthly')
     OR p_items IS NULL OR pg_catalog.jsonb_typeof(p_items) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_items) < 1 OR pg_catalog.jsonb_array_length(p_items) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'shopping list name, type, recurrence or item count is invalid';
  END IF;
  IF p_is_draft OR v_recurrence = 'none' THEN
    v_recurrence := 'none';
    p_next_run_on := NULL;
  ELSIF p_next_run_on IS NULL OR p_next_run_on < (pg_catalog.now() AT TIME ZONE 'Asia/Aden')::date THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'recurring shopping list requires a current or future local due date';
  END IF;

  SELECT c.id, c.profile_id INTO v_locked_customer, v_owner
    FROM public.customers AS c
   WHERE c.id = v_customer AND c.organization_id = v_org
   FOR SHARE;
  IF v_locked_customer IS NULL OR public.current_customer_id() IS DISTINCT FROM v_customer
     OR NOT public.current_customer_can('reorder.manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company membership is no longer active for shopping list changes';
  END IF;

  IF p_list_id IS NULL THEN
    INSERT INTO public.customer_shopping_lists(
      organization_id, customer_id, owner_profile_id, created_by_profile_id,
      name, category, is_draft, recurrence, next_run_on
    ) VALUES (
      v_org, v_customer, v_owner, v_profile, v_name, v_category,
      p_is_draft, v_recurrence, p_next_run_on
    ) RETURNING id INTO v_list_id;
    v_audit_action := 'customer.shopping_list.created';
  ELSE
    IF NOT public.customer_shopping_list_can_access(p_list_id,true) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'shopping list edit permission is required';
    END IF;
    UPDATE public.customer_shopping_lists
       SET name = v_name, category = v_category, is_draft = p_is_draft,
           recurrence = v_recurrence, next_run_on = p_next_run_on,
           updated_at = pg_catalog.now()
     WHERE id = p_list_id AND organization_id = v_org AND customer_id = v_customer
     RETURNING id INTO v_list_id;
    IF v_list_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'shopping list was not found';
    END IF;
    v_audit_action := 'customer.shopping_list.updated';
  END IF;

  FOR v_line IN SELECT entry.value FROM pg_catalog.jsonb_array_elements(p_items) AS entry(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_line) IS DISTINCT FROM 'object'
       OR (v_line - ARRAY['product_id','quantity','unit_name','base_units_per_unit']::text[]) <> '{}'::jsonb
       OR NOT (v_line ? 'product_id') OR NOT (v_line ? 'quantity')
       OR NOT (v_line ? 'unit_name') OR NOT (v_line ? 'base_units_per_unit') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'shopping list line must contain only product_id, quantity, unit_name and base_units_per_unit';
    END IF;
    BEGIN
      v_product_id := (v_line->>'product_id')::uuid;
      IF (v_line->>'quantity') !~ '^[0-9]{1,5}$'
         OR (v_line->>'base_units_per_unit') !~ '^[0-9]{1,7}$' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'shopping list quantity or unit factor is malformed';
      END IF;
      v_quantity := (v_line->>'quantity')::integer;
      v_factor := (v_line->>'base_units_per_unit')::integer;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'shopping list product, quantity or unit factor is malformed';
    END;
    v_unit_name := pg_catalog.btrim(coalesce(v_line->>'unit_name',''));
    v_base_quantity := v_quantity::bigint * v_factor::bigint;
    IF v_product_id IS NULL OR v_quantity < 1 OR v_quantity > 10000
       OR v_factor < 1 OR v_factor > 1000000 OR v_base_quantity < 1 OR v_base_quantity > 10000
       OR v_unit_name = '' OR pg_catalog.char_length(v_unit_name) > 40
       OR v_product_id = ANY(v_seen) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'shopping list quantity, unit or product identity is invalid';
    END IF;
    v_seen := pg_catalog.array_append(v_seen, v_product_id);

    SELECT p.id, p.unit, p.name, p.item_code, p.status, p.organization_id
      INTO v_product
      FROM public.products AS p
     WHERE p.id = v_product_id AND p.organization_id = v_org
     FOR SHARE;
    IF NOT FOUND OR v_product.status <> 'active' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'a selected product is inactive or outside the current company catalog';
    END IF;

    IF NOT (
      (v_unit_name = v_product.unit AND v_factor = 1)
      OR EXISTS (
        SELECT 1 FROM public.product_unit_conversions AS u
         WHERE u.organization_id = v_org
           AND u.product_id = v_product_id
           AND u.unit_name = v_unit_name
           AND u.base_units_per_unit = v_factor
      )
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'selected unit conversion changed; reload the product units before saving';
    END IF;
    PERFORM public.assert_product_order_quantity(v_product_id, v_org, v_base_quantity::numeric);
    v_items := v_items || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'product_id',v_product_id,'quantity',v_quantity,'unit_name',v_unit_name,'base_units_per_unit',v_factor
    ));
  END LOOP;

  DELETE FROM public.customer_shopping_list_items
   WHERE list_id = v_list_id AND organization_id = v_org AND customer_id = v_customer;
  INSERT INTO public.customer_shopping_list_items(
    organization_id,customer_id,list_id,product_id,quantity,unit_name,base_units_per_unit
  )
  SELECT v_org,v_customer,v_list_id,
         (item->>'product_id')::uuid,(item->>'quantity')::integer,
         item->>'unit_name',(item->>'base_units_per_unit')::integer
    FROM pg_catalog.jsonb_array_elements(v_items) AS item;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  ) VALUES (
    v_org,v_profile,v_audit_action,'customer_shopping_list',v_list_id,
    pg_catalog.jsonb_build_object('name',v_name,'category',v_category,'is_draft',p_is_draft,
      'recurrence',v_recurrence,'next_run_on',p_next_run_on,'item_count',pg_catalog.jsonb_array_length(v_items))
  );

  RETURN v_list_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_customer_shopping_list(uuid,text,text,boolean,text,date,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_customer_shopping_list(uuid,text,text,boolean,text,date,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.share_customer_shopping_list(
  p_list_id uuid,
  p_member_profile_id uuid,
  p_access_level text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_locked_customer uuid;
  v_owner uuid;
  v_member_role text;
  v_list_name text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR p_member_profile_id IS NULL OR p_member_profile_id = v_profile
     OR p_access_level NOT IN ('view','edit') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'valid owner, list and recipient are required to share a shopping list';
  END IF;
  SELECT c.id,c.profile_id INTO v_locked_customer,v_owner
    FROM public.customers c
   WHERE c.id = v_customer AND c.organization_id = v_org
   FOR SHARE;
  IF v_locked_customer IS NULL OR v_owner IS DISTINCT FROM v_profile
     OR public.current_customer_id() IS DISTINCT FROM v_customer THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the active company owner can share shopping lists';
  END IF;
  SELECT m.member_role INTO v_member_role
    FROM public.customer_company_memberships m
   WHERE m.profile_id = p_member_profile_id
     AND m.customer_id = v_customer
     AND m.organization_id = v_org
     AND m.status = 'active';
  IF v_member_role IS NULL OR (p_access_level = 'edit' AND v_member_role <> 'buyer') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'recipient must be an active company member with the required role';
  END IF;
  SELECT l.name INTO v_list_name
    FROM public.customer_shopping_lists l
   WHERE l.id = p_list_id AND l.customer_id = v_customer AND l.organization_id = v_org
     AND l.owner_profile_id = v_profile AND l.status = 'active'
   FOR UPDATE;
  IF v_list_name IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only a company owner may share an owned active shopping list';
  END IF;

  INSERT INTO public.customer_shopping_list_shares(
    organization_id,customer_id,list_id,member_profile_id,access_level,shared_by_profile_id
  ) VALUES(v_org,v_customer,p_list_id,p_member_profile_id,p_access_level,v_profile)
  ON CONFLICT (list_id,member_profile_id)
  DO UPDATE SET access_level = EXCLUDED.access_level,
                shared_by_profile_id = EXCLUDED.shared_by_profile_id,
                updated_at = pg_catalog.now();

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  ) VALUES (
    v_org,v_profile,'customer.shopping_list.shared','customer_shopping_list',p_list_id,
    pg_catalog.jsonb_build_object('member_profile_id',p_member_profile_id,'access_level',p_access_level)
  );
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.share_customer_shopping_list(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.share_customer_shopping_list(uuid,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_customer_shopping_list_share(
  p_list_id uuid,
  p_member_profile_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_owner uuid;
  v_deleted integer;
BEGIN
  SELECT c.profile_id INTO v_owner
    FROM public.customers c
   WHERE c.id = v_customer AND c.organization_id = v_org
   FOR SHARE;
  IF auth.uid() IS NULL OR v_owner IS DISTINCT FROM v_profile
     OR public.current_customer_id() IS DISTINCT FROM v_customer THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'only the active company owner can remove shopping list shares';
  END IF;
  DELETE FROM public.customer_shopping_list_shares
   WHERE list_id = p_list_id
     AND member_profile_id = p_member_profile_id
     AND organization_id = v_org
     AND customer_id = v_customer;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RETURN false; END IF;
  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  ) VALUES (
    v_org,v_profile,'customer.shopping_list.share_removed','customer_shopping_list',p_list_id,
    pg_catalog.jsonb_build_object('member_profile_id',p_member_profile_id)
  );
  RETURN true;
END;
$function$;
REVOKE ALL ON FUNCTION public.remove_customer_shopping_list_share(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_customer_shopping_list_share(uuid,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_customer_shopping_list_run(p_list_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_locked_customer uuid;
  v_run_id uuid;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR NOT public.current_customer_can('orders.create')
     OR NOT public.customer_shopping_list_can_access(p_list_id,true) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active buyer permission is required to prepare a shopping list for cart review';
  END IF;
  SELECT c.id INTO v_locked_customer
    FROM public.customers c
   WHERE c.id = v_customer AND c.organization_id = v_org
   FOR SHARE;
  IF v_locked_customer IS NULL OR public.current_customer_id() IS DISTINCT FROM v_customer
     OR NOT public.current_customer_can('orders.create')
     OR NOT public.customer_shopping_list_can_access(p_list_id,true) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company membership is no longer active for shopping list review';
  END IF;

  INSERT INTO public.customer_shopping_list_runs(
    organization_id,customer_id,list_id,due_on,status,created_by_profile_id
  ) VALUES(v_org,v_customer,p_list_id,NULL,'review_required',v_profile)
  RETURNING id INTO v_run_id;

  INSERT INTO public.customer_shopping_list_run_items(
    organization_id,customer_id,run_id,product_id,
    product_name_snapshot,item_code_snapshot,base_unit_snapshot,
    quantity,unit_name,base_units_per_unit
  )
  SELECT v_org,v_customer,v_run_id,i.product_id,p.name,p.item_code,p.unit,
         i.quantity,i.unit_name,i.base_units_per_unit
    FROM public.customer_shopping_list_items i
    JOIN public.products p ON p.id = i.product_id AND p.organization_id = v_org
   WHERE i.list_id = p_list_id
   ORDER BY p.name,i.product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'shopping list has no active product lines to review';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  ) VALUES (
    v_org,v_profile,'customer.shopping_list.review_requested',
    'customer_shopping_list_run',v_run_id,
    pg_catalog.jsonb_build_object('list_id',p_list_id,'source','manual')
  );
  RETURN v_run_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.create_customer_shopping_list_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_customer_shopping_list_run(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.review_customer_shopping_list_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_run record;
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR NOT public.current_customer_can('catalog.read') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active customer catalog access is required to review shopping lists';
  END IF;
  SELECT r.id,r.list_id,r.due_on,r.status,l.name
    INTO v_run
    FROM public.customer_shopping_list_runs r
    JOIN public.customer_shopping_lists l ON l.id = r.list_id
   WHERE r.id = p_run_id AND r.organization_id = v_org AND r.customer_id = v_customer
     AND (l.owner_profile_id = v_profile OR l.created_by_profile_id = v_profile
       OR EXISTS (
         SELECT 1 FROM public.customer_shopping_list_shares s
         JOIN public.customer_company_memberships m
           ON m.profile_id=s.member_profile_id AND m.customer_id=s.customer_id
          AND m.organization_id=s.organization_id AND m.status='active'
         WHERE s.list_id=l.id AND s.member_profile_id=v_profile
       )
       OR EXISTS(SELECT 1 FROM public.customers c WHERE c.id=v_customer AND c.profile_id=v_profile));
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'shopping list run is outside the active customer scope';
  END IF;

  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'product_id',i.product_id,'product_name',i.product_name_snapshot,
      'item_code',i.item_code_snapshot,'base_unit',i.base_unit_snapshot,
      'quantity',i.quantity,'unit_name',i.unit_name,
      'base_units_per_unit',i.base_units_per_unit
    ) ORDER BY i.product_name_snapshot,i.product_id
  ),'[]'::jsonb)
    INTO v_items
    FROM public.customer_shopping_list_run_items i
   WHERE i.run_id = p_run_id AND i.organization_id=v_org AND i.customer_id=v_customer;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_run.id,'list_id',v_run.list_id,'list_name',v_run.name,
    'due_on',v_run.due_on,'status',v_run.status,'items',v_items
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.review_customer_shopping_list_run(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_customer_shopping_list_run(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_customer_shopping_list_run_to_cart(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid := public.current_organization_id();
  v_customer uuid := public.current_customer_id();
  v_locked_customer uuid;
  v_warehouse uuid;
  v_run record;
  v_context jsonb;
  v_cart jsonb;
  v_combined jsonb;
  v_pricing jsonb;
  v_line record;
  v_available numeric;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR v_org IS NULL OR v_customer IS NULL
     OR NOT public.current_customer_can('orders.create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active buyer permission is required to load a reviewed shopping list into the cart';
  END IF;
  SELECT c.id INTO v_locked_customer
    FROM public.customers c
   WHERE c.id=v_customer AND c.organization_id=v_org
   FOR SHARE;
  IF v_locked_customer IS NULL OR public.current_customer_id() IS DISTINCT FROM v_customer
     OR NOT public.current_customer_can('orders.create') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company membership is no longer active for cart loading';
  END IF;

  SELECT r.id,r.list_id,r.status,l.status AS list_status
    INTO v_run
    FROM public.customer_shopping_list_runs r
    JOIN public.customer_shopping_lists l ON l.id=r.list_id
   WHERE r.id=p_run_id AND r.organization_id=v_org AND r.customer_id=v_customer
     AND (l.owner_profile_id=v_profile OR l.created_by_profile_id=v_profile
       OR EXISTS(SELECT 1 FROM public.customer_shopping_list_shares s
         JOIN public.customer_company_memberships m ON m.profile_id=s.member_profile_id
          AND m.customer_id=s.customer_id AND m.organization_id=s.organization_id AND m.status='active'
         WHERE s.list_id=l.id AND s.member_profile_id=v_profile AND s.access_level='edit')
       OR EXISTS(SELECT 1 FROM public.customers c WHERE c.id=v_customer AND c.profile_id=v_profile))
   FOR UPDATE OF r;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'shopping list run was not found in the current company scope';
  END IF;
  IF v_run.status <> 'review_required' OR v_run.list_status <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'shopping list run was already loaded, cancelled or is no longer available';
  END IF;

  v_context := public.get_current_tenant_context();
  v_warehouse := NULLIF(v_context->>'warehouse_id','')::uuid;
  IF v_warehouse IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'current warehouse is not configured; stock availability cannot be verified';
  END IF;

  -- Serialize unit/product edits and existing cart syncs for the duration of this transaction.
  PERFORM 1
    FROM public.products p
    JOIN public.customer_shopping_list_run_items i
      ON i.product_id=p.id AND i.organization_id=p.organization_id
   WHERE i.run_id=p_run_id AND i.customer_id=v_customer
   ORDER BY p.id
   FOR SHARE OF p;
  PERFORM 1
    FROM public.product_unit_conversions u
    JOIN public.customer_shopping_list_run_items i
      ON i.product_id=u.product_id AND i.organization_id=u.organization_id
     AND i.unit_name=u.unit_name AND i.base_units_per_unit=u.base_units_per_unit
   WHERE i.run_id=p_run_id AND i.customer_id=v_customer
   ORDER BY u.product_id
   FOR SHARE OF u;

  IF EXISTS (
    SELECT 1
      FROM public.customer_shopping_list_run_items i
      JOIN public.products p ON p.id=i.product_id AND p.organization_id=v_org
     WHERE i.run_id=p_run_id
       AND NOT (
         (i.unit_name=p.unit AND i.base_units_per_unit=1)
         OR EXISTS (
           SELECT 1 FROM public.product_unit_conversions u
            WHERE u.organization_id=v_org
              AND u.product_id=i.product_id
              AND u.unit_name=i.unit_name
              AND u.base_units_per_unit=i.base_units_per_unit
         )
       )
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='one or more saved package conversions changed since this list was prepared; update the list before loading it';
  END IF;

  -- Create-or-lock the profile cart before reading it. The same partial unique key
  -- serializes the first concurrent cart creation as well as subsequent cart syncs.
  INSERT INTO public.customer_carts(organization_id,profile_id,status)
  VALUES(v_org,v_profile,'active')
  ON CONFLICT (organization_id,profile_id) WHERE status='active' DO NOTHING;
  PERFORM 1
    FROM public.customer_carts c
   WHERE c.organization_id=v_org AND c.profile_id=v_profile AND c.status='active'
   FOR UPDATE;
  v_cart := public.get_customer_cart();
  WITH requested AS (
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           (entry.value->>'quantity')::integer AS quantity
      FROM pg_catalog.jsonb_array_elements(coalesce(v_cart->'items','[]'::jsonb)) AS entry(value)
    UNION ALL
    SELECT i.product_id, i.quantity * i.base_units_per_unit
      FROM public.customer_shopping_list_run_items i
     WHERE i.run_id=p_run_id AND i.organization_id=v_org AND i.customer_id=v_customer
  ),
  combined AS (
    SELECT product_id, pg_catalog.sum(quantity)::integer AS quantity
      FROM requested GROUP BY product_id
  )
  SELECT coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object('product_id',product_id,'quantity',quantity)
    ORDER BY product_id
  ),'[]'::jsonb)
    INTO v_combined
    FROM combined;

  IF pg_catalog.jsonb_array_length(v_combined)=0 OR pg_catalog.jsonb_array_length(v_combined)>100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='combined cart must contain between 1 and 100 unique product lines';
  END IF;

  FOR v_line IN
    SELECT (entry.value->>'product_id')::uuid AS product_id,
           (entry.value->>'quantity')::integer AS quantity
      FROM pg_catalog.jsonb_array_elements(v_combined) AS entry(value)
  LOOP
    IF v_line.quantity < 1 OR v_line.quantity > 10000 THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='combined cart quantity is outside the supported range';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id=v_line.product_id AND p.organization_id=v_org AND p.status='active'
    ) THEN
      RAISE EXCEPTION USING ERRCODE='P0002',
        MESSAGE='one or more reviewed products are no longer active in the company catalog; cart was not changed';
    END IF;
    PERFORM public.assert_product_order_quantity(v_line.product_id,v_org,v_line.quantity::numeric);
    SELECT ib.quantity_available INTO v_available
      FROM public.inventory_balances ib
      JOIN public.warehouses w ON w.id=ib.warehouse_id
       AND w.organization_id=v_org AND w.is_active=true
     WHERE ib.product_id=v_line.product_id AND ib.warehouse_id=v_warehouse
     FOR SHARE OF ib;
    IF NOT FOUND OR v_available IS NULL OR v_available < v_line.quantity THEN
      RAISE EXCEPTION USING ERRCODE='P0002',
        MESSAGE='stock is missing or insufficient for one or more products; cart was not changed';
    END IF;
  END LOOP;

  v_pricing := public.preview_customer_order_pricing(v_combined,'cart');
  v_cart := public.sync_customer_cart(v_combined);
  UPDATE public.customer_shopping_list_runs
     SET status='cart_loaded',cart_loaded_at=pg_catalog.now()
   WHERE id=p_run_id AND organization_id=v_org AND customer_id=v_customer
     AND status='review_required';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='shopping list run was applied concurrently; reload the cart';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,new_value
  ) VALUES (
    v_org,v_profile,'customer.shopping_list.run_loaded_to_cart',
    'customer_shopping_list_run',p_run_id,
    pg_catalog.jsonb_build_object('list_id',v_run.list_id,'line_count',pg_catalog.jsonb_array_length(v_combined))
  );

  RETURN pg_catalog.jsonb_build_object(
    'status','cart_loaded','cart',v_cart,'pricing',v_pricing,
    'requires_checkout_confirmation',true
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.apply_customer_shopping_list_run_to_cart(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_customer_shopping_list_run_to_cart(uuid) TO authenticated;

COMMENT ON TABLE public.customer_shopping_lists IS
  'Tenant/customer-scoped saved shopping lists. Prices and inventory are not stored; all list edits use guarded RPCs.';
COMMENT ON TABLE public.customer_shopping_list_shares IS
  'Company member list shares; reads re-check active membership and share permission at each RPC call.';
COMMENT ON TABLE public.customer_shopping_list_runs IS
  'Recurring and manual shopping-list review snapshots. A run never creates an order; one atomic RPC can load it into the current cart exactly once after fresh stock and price validation.';
COMMENT ON FUNCTION public.materialize_due_customer_shopping_list_runs() IS
  'Materializes each due weekly/monthly period at most once on the next authorized owner/buyer list read; if the due date passes while nobody opens the list, the next access materializes every missed period up to the bounded catch-up limit. This is review-only lazy evaluation, not a background cron job; it stores no prices and never submits an order, checks out a cart, or posts inventory/finance.';
COMMENT ON FUNCTION public.save_customer_shopping_list(uuid,text,text,boolean,text,date,jsonb) IS
  'Validates active company scope, unique product ids, exact catalog unit-conversion factors and server-side order quantity policies before replacing list rows. The client supplies no price, inventory balance, discount or order status.';
COMMENT ON FUNCTION public.apply_customer_shopping_list_run_to_cart(uuid) IS
  'Atomically rechecks active membership, list run state, exact unit conversions, order quantities, selected-warehouse availability and current server price preview, then syncs cart and marks the run loaded. Never places an order or posts finance/inventory movements.';

COMMIT;
