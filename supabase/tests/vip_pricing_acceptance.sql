\set ON_ERROR_STOP on

CREATE TABLE public.products (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  category_id uuid,
  base_price numeric(15,2) NOT NULL,
  cost_price numeric(15,2)
);

CREATE TABLE public.pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  name text NOT NULL,
  scope_type text NOT NULL DEFAULT 'default',
  scope_value text,
  base_source text NOT NULL DEFAULT 'base_price',
  adjustment_type text NOT NULL DEFAULT 'fixed',
  calculation_method text NOT NULL DEFAULT 'fixed_price',
  adjustment_value numeric(15,4) NOT NULL DEFAULT 0,
  target_tier text NOT NULL,
  min_quantity numeric(15,3) NOT NULL DEFAULT 1,
  min_price numeric(15,2),
  max_price numeric(15,2),
  priority integer NOT NULL DEFAULT 100,
  effective_from timestamptz,
  effective_until timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  requires_approval boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pricing_rules_target_tier_check
    CHECK (target_tier IN ('both', 'wholesale', 'retail'))
);

-- Preserve the exact resolver algorithm used by the live database.
CREATE OR REPLACE FUNCTION public.calculate_active_pricing_rule_price(
  p_product_id uuid,
  p_organization_id uuid,
  p_tier text,
  p_quantity numeric DEFAULT 1
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_product public.products%ROWTYPE;
  v_rule public.pricing_rules%ROWTYPE;
  v_base numeric(15,2);
  v_result numeric(15,2);
BEGIN
  SELECT p.* INTO v_product
    FROM public.products p
   WHERE p.id=p_product_id AND p.organization_id=p_organization_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT r.* INTO v_rule
    FROM public.pricing_rules r
   WHERE r.organization_id=p_organization_id
     AND r.is_active
     AND (r.effective_from IS NULL OR r.effective_from<=now())
     AND (r.effective_until IS NULL OR r.effective_until>=now())
     AND p_quantity>=r.min_quantity
     AND (r.target_tier='both' OR r.target_tier=p_tier)
     AND (NOT r.requires_approval OR r.approved_at IS NOT NULL)
     AND CASE
       WHEN r.scope_type IN ('default','all') THEN true
       WHEN r.scope_type='product' THEN r.scope_value=v_product.id::text
       WHEN r.scope_type='category' THEN r.scope_value=v_product.category_id::text
       ELSE false
     END
   ORDER BY CASE WHEN r.scope_type='product' THEN 0 WHEN r.scope_type='category' THEN 1 ELSE 2 END,
            r.priority ASC, r.created_at DESC, r.id
   LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_base := CASE WHEN v_rule.base_source='cost_price'
                 THEN coalesce(v_product.cost_price, v_product.base_price)
                 ELSE v_product.base_price END;
  CASE v_rule.calculation_method
    WHEN 'add_percentage' THEN v_result := v_base * (1 + v_rule.adjustment_value / 100);
    WHEN 'margin_percentage' THEN
      IF v_rule.adjustment_value >= 100 OR v_rule.adjustment_value < 0 THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid margin';
      END IF;
      v_result := v_base / (1 - v_rule.adjustment_value / 100);
    WHEN 'fixed_price' THEN v_result := v_rule.adjustment_value;
    WHEN 'add_subtract_amount' THEN v_result := v_base + v_rule.adjustment_value;
    ELSE RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='unknown calculation method';
  END CASE;
  IF v_rule.min_price IS NOT NULL THEN v_result := greatest(v_result, v_rule.min_price); END IF;
  IF v_rule.max_price IS NOT NULL THEN v_result := least(v_result, v_rule.max_price); END IF;
  IF v_result IS NULL OR v_result<0 OR v_result::text IN ('NaN','Infinity','-Infinity') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid configured price';
  END IF;
  RETURN round(v_result,2);
END;
$function$;

-- This fixture has the same legacy label branch that is being patched in the live RPC.
CREATE OR REPLACE FUNCTION public.preview_customer_order_pricing(p_items jsonb,p_surface text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_tier text := coalesce(p_items->>'tier','retail');
  v_tier_label text := 'التجزئة';
BEGIN
  v_tier_label := CASE v_tier
    WHEN 'super_wholesale' THEN 'جملة الجملة'
    WHEN 'wholesale' THEN 'الجملة'
    ELSE 'التجزئة'
  END;
  RETURN pg_catalog.jsonb_build_object('customer_tier',v_tier,'customer_tier_label',v_tier_label,'surface',p_surface);
END;
$function$;

-- Existing legacy targets must remain unchanged.
INSERT INTO public.pricing_rules(id,organization_id,name,target_tier,is_active)
VALUES
 ('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy both','both',false),
 ('11111111-1111-4111-8111-111111111112','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy wholesale','wholesale',false),
 ('11111111-1111-4111-8111-111111111113','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','legacy retail','retail',false);

\ir ../migrations/20261112000527_allow_vip_pricing_rule_target.sql
\ir ../migrations/20261112010100_vip_customer_tier_preview_label.sql

INSERT INTO public.products(id,organization_id,category_id,base_price,cost_price)
VALUES('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',NULL,100,70);

INSERT INTO public.pricing_rules(id,organization_id,name,scope_type,base_source,calculation_method,adjustment_value,target_tier,min_quantity,priority,is_active,requires_approval,approved_at)
VALUES
 ('33333333-3333-4333-8333-333333333331','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','VIP fixed price','default','base_price','fixed_price',71,'vip',1,1,true,false,NULL),
 ('33333333-3333-4333-8333-333333333332','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Wholesale fixed price','default','base_price','fixed_price',82,'wholesale',1,1,true,false,NULL),
 ('33333333-3333-4333-8333-aaaaaaaa3333','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Retail fixed price','default','base_price','fixed_price',93,'retail',1,1,true,false,NULL),
 ('33333333-3333-4333-8333-aaaaaaaa3334','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Combined fixed price','default','base_price','fixed_price',64,'both',1,10,true,false,NULL),
 ('33333333-3333-4333-8333-aaaaaaaa3335','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Unapproved VIP price','default','base_price','fixed_price',1,'vip',1,0,true,true,NULL);

DO $acceptance$
DECLARE
  v_vip numeric;
  v_wholesale numeric;
  v_retail numeric;
  v_unknown numeric;
  v_label text;
  v_legacy_count integer;
  v_state text;
BEGIN
  IF public.calculate_active_pricing_rule_price(
      '22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','vip',1
     ) <> 71 THEN
    RAISE EXCEPTION 'VIP target rule was not selected; price=%',
      public.calculate_active_pricing_rule_price('22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','vip',1);
  END IF;
  IF public.calculate_active_pricing_rule_price(
      '22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','wholesale',1
     ) <> 82 THEN
    RAISE EXCEPTION 'wholesale target rule was changed by VIP addition';
  END IF;
  IF public.calculate_active_pricing_rule_price(
      '22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','retail',1
     ) <> 93 THEN
    RAISE EXCEPTION 'retail target rule was changed by VIP addition';
  END IF;
  IF public.calculate_active_pricing_rule_price(
      '22222222-2222-4222-8222-222222222222','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','other',1
     ) <> 64 THEN
    RAISE EXCEPTION 'combined target must remain the fallback for unsupported tiers';
  END IF;

  SELECT count(*) INTO v_legacy_count
    FROM public.pricing_rules
   WHERE id IN (
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-4111-8111-111111111112',
    '11111111-1111-4111-8111-111111111113'
   );
  IF v_legacy_count<>3 THEN
    RAISE EXCEPTION 'existing legacy pricing rows were not preserved';
  END IF;

  v_label := public.preview_customer_order_pricing('{"tier":"vip"}'::jsonb,'cart')->>'customer_tier_label';
  IF v_label<>'جملة الجملة' THEN
    RAISE EXCEPTION 'VIP preview tier label is incorrect: %',v_label;
  END IF;
  v_label := public.preview_customer_order_pricing('{"tier":"super_wholesale"}'::jsonb,'cart')->>'customer_tier_label';
  IF v_label<>'جملة الجملة' THEN
    RAISE EXCEPTION 'legacy super_wholesale tier label was not preserved: %',v_label;
  END IF;
  v_label := public.preview_customer_order_pricing('{"tier":"wholesale"}'::jsonb,'cart')->>'customer_tier_label';
  IF v_label<>'الجملة' THEN RAISE EXCEPTION 'wholesale label changed'; END IF;
  v_label := public.preview_customer_order_pricing('{"tier":"retail"}'::jsonb,'cart')->>'customer_tier_label';
  IF v_label<>'التجزئة' THEN RAISE EXCEPTION 'retail label changed'; END IF;

  BEGIN
    INSERT INTO public.pricing_rules(organization_id,name,target_tier)
    VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','invalid target','unrecognized');
    RAISE EXCEPTION 'unsupported target tier unexpectedly passed the CHECK constraint';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END;
$acceptance$;

-- Re-running the label patch must be safe and must not duplicate the VIP branch.
\ir ../migrations/20261112010100_vip_customer_tier_preview_label.sql

SELECT 'PASS: PostgreSQL 17 VIP pricing, existing tier preservation, approval gating, combined fallback and customer preview labels' AS result;
