-- REF-SECTION-55: append-only policy governance metadata and typed read-only what-if simulations.
-- Existing pricing, credit, quantity, promotion and reorder systems remain the sole source of truth.
BEGIN;

CREATE TABLE public.commerce_policy_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  policy_key text NOT NULL CHECK (policy_key IN (
    'PRICING_RULE','PROMOTION','CUSTOMER_CREDIT','PRODUCT_ORDER_QUANTITY','INVENTORY_REORDER_POINT'
  )),
  source_table text NOT NULL CHECK (source_table IN (
    'pricing_rules','promotions','customers','products','inventory_balances'
  )),
  source_id uuid NOT NULL,
  policy_version integer NOT NULL CHECK (policy_version>=1),
  owner_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  conflict_priority integer NOT NULL CHECK (conflict_priority BETWEEN 1 AND 10000),
  business_rule text NOT NULL CHECK (char_length(btrim(business_rule)) BETWEEN 5 AND 1000),
  rationale text NOT NULL CHECK (char_length(btrim(rationale)) BETWEEN 5 AND 2000),
  test_examples jsonb NOT NULL CHECK (jsonb_typeof(test_examples)='array'),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{32}$'),
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{32}$'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id),
  UNIQUE (organization_id,idempotency_key),
  UNIQUE (organization_id,source_table,source_id,policy_version),
  CHECK (effective_until IS NULL OR effective_until>effective_from)
);
CREATE INDEX commerce_policy_registry_source_idx
  ON public.commerce_policy_registry(organization_id,source_table,source_id,policy_version DESC);
CREATE INDEX commerce_policy_registry_effective_idx
  ON public.commerce_policy_registry(organization_id,effective_from,effective_until);

CREATE TABLE public.commerce_policy_simulation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  simulation_type text NOT NULL CHECK (simulation_type IN (
    'PROMOTION_PREVIEW','CUSTOMER_CREDIT','PRODUCT_ORDER_QUANTITY',
    'INVENTORY_REORDER_POINT','TASK_DEDUPLICATION'
  )),
  source_refs jsonb NOT NULL CHECK (jsonb_typeof(source_refs)='array'),
  input_fingerprint text NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{32}$'),
  source_fingerprint text NOT NULL CHECK (source_fingerprint ~ '^[0-9a-f]{32}$'),
  outcome jsonb NOT NULL CHECK (jsonb_typeof(outcome)='object'),
  created_by_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,id)
);
CREATE INDEX commerce_policy_simulation_history_idx
  ON public.commerce_policy_simulation_runs(organization_id,simulation_type,created_at DESC);

ALTER TABLE public.commerce_policy_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_policy_simulation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.commerce_policy_registry,public.commerce_policy_simulation_runs
  FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.commerce_policy_registry,public.commerce_policy_simulation_runs TO service_role;

CREATE OR REPLACE FUNCTION public.reject_commerce_policy_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
BEGIN
  RAISE EXCEPTION USING ERRCODE='55000',MESSAGE='commerce policy history is append-only';
END;
$function$;
REVOKE ALL ON FUNCTION public.reject_commerce_policy_history_mutation() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER commerce_policy_registry_append_only
  BEFORE UPDATE OR DELETE ON public.commerce_policy_registry
  FOR EACH ROW EXECUTE FUNCTION public.reject_commerce_policy_history_mutation();
CREATE TRIGGER commerce_policy_simulation_runs_append_only
  BEFORE UPDATE OR DELETE ON public.commerce_policy_simulation_runs
  FOR EACH ROW EXECUTE FUNCTION public.reject_commerce_policy_history_mutation();

CREATE OR REPLACE FUNCTION public.commerce_policy_source_snapshot(
  p_source_table text,
  p_source_id uuid,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_snapshot jsonb;
BEGIN
  CASE p_source_table
    WHEN 'pricing_rules' THEN
      SELECT pg_catalog.to_jsonb(r) INTO v_snapshot
      FROM public.pricing_rules r
      WHERE r.id=p_source_id AND r.organization_id=p_organization_id;
    WHEN 'promotions' THEN
      SELECT pg_catalog.to_jsonb(p) INTO v_snapshot
      FROM public.promotions p
      WHERE p.id=p_source_id AND p.organization_id=p_organization_id;
    WHEN 'customers' THEN
      SELECT pg_catalog.jsonb_build_object(
        'id',c.id,'status',c.status,'tier',c.tier,
        'credit_limit',c.credit_limit,'current_balance',c.current_balance,
        'updated_at',c.updated_at
      ) INTO v_snapshot
      FROM public.customers c
      WHERE c.id=p_source_id AND c.organization_id=p_organization_id;
    WHEN 'products' THEN
      SELECT pg_catalog.jsonb_build_object(
        'id',p.id,'status',p.status,'category_id',p.category_id,
        'base_price',p.base_price,'cost_price',p.cost_price,
        'min_order_quantity',p.min_order_quantity,
        'order_quantity_multiple',p.order_quantity_multiple,
        'updated_at',p.updated_at
      ) INTO v_snapshot
      FROM public.products p
      WHERE p.id=p_source_id AND p.organization_id=p_organization_id;
    WHEN 'inventory_balances' THEN
      SELECT pg_catalog.jsonb_build_object(
        'id',ib.id,'product_id',ib.product_id,'warehouse_id',ib.warehouse_id,
        'quantity_available',ib.quantity_available,'reorder_point',ib.reorder_point,
        'last_movement_at',ib.last_movement_at,'updated_at',ib.updated_at
      ) INTO v_snapshot
      FROM public.inventory_balances ib
      JOIN public.products p ON p.id=ib.product_id AND p.organization_id=p_organization_id
      JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=p_organization_id
      WHERE ib.id=p_source_id;
    ELSE
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported commerce policy source table';
  END CASE;
  RETURN v_snapshot;
END;
$function$;
REVOKE ALL ON FUNCTION public.commerce_policy_source_snapshot(text,uuid,uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.register_commerce_policy_metadata(
  p_source_table text,
  p_source_id uuid,
  p_owner_profile_id uuid,
  p_effective_from timestamptz,
  p_effective_until timestamptz,
  p_conflict_priority integer,
  p_business_rule text,
  p_rationale text,
  p_test_examples jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_key text;
  v_source jsonb;
  v_request_fingerprint text;
  v_existing public.commerce_policy_registry%ROWTYPE;
  v_version integer;
  v_latest_effective_from timestamptz;
  v_record public.commerce_policy_registry%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_pricing() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager permission required to govern commerce policies';
  END IF;
  IF p_source_table IS NULL OR p_source_table NOT IN ('pricing_rules','promotions','customers','products','inventory_balances')
     OR p_source_id IS NULL OR p_owner_profile_id IS NULL
     OR p_effective_from IS NULL OR p_idempotency_key IS NULL
     OR (p_effective_until IS NOT NULL AND p_effective_until<=p_effective_from)
     OR p_conflict_priority NOT BETWEEN 1 AND 10000
     OR char_length(btrim(coalesce(p_business_rule,''))) NOT BETWEEN 5 AND 1000
     OR char_length(btrim(coalesce(p_rationale,''))) NOT BETWEEN 5 AND 2000
     OR p_test_examples IS NULL OR pg_catalog.jsonb_typeof(p_test_examples)<>'array'
     OR pg_catalog.jsonb_array_length(p_test_examples)<1
     OR pg_catalog.jsonb_array_length(p_test_examples)>20
     OR pg_catalog.pg_column_size(p_test_examples)>24576 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='policy metadata contains invalid fields or limits';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_test_examples) e(value)
    WHERE pg_catalog.jsonb_typeof(e.value)<>'object'
       OR pg_catalog.pg_column_size(e.value)>4096
       OR (SELECT count(*) FROM pg_catalog.jsonb_object_keys(e.value))>12
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='each policy test example must be a bounded JSON object; executable SQL is not accepted';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id=p_owner_profile_id AND p.organization_id=v_org
      AND p.is_active AND p.auth_user_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='policy owner must be an active authenticated profile in this organization';
  END IF;

  v_key:=CASE p_source_table
    WHEN 'pricing_rules' THEN 'PRICING_RULE'
    WHEN 'promotions' THEN 'PROMOTION'
    WHEN 'customers' THEN 'CUSTOMER_CREDIT'
    WHEN 'products' THEN 'PRODUCT_ORDER_QUANTITY'
    WHEN 'inventory_balances' THEN 'INVENTORY_REORDER_POINT'
  END;
  v_source:=public.commerce_policy_source_snapshot(p_source_table,p_source_id,v_org);
  IF v_source IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='policy source record is unavailable in this organization';
  END IF;

  v_request_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
    'source_table',p_source_table,'source_id',p_source_id,
    'owner_profile_id',p_owner_profile_id,'effective_from',p_effective_from,
    'effective_until',p_effective_until,'conflict_priority',p_conflict_priority,
    'business_rule',btrim(p_business_rule),'rationale',btrim(p_rationale),
    'test_examples',p_test_examples
  )::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':policy-key:'||p_idempotency_key::text,0)
  );
  SELECT r.* INTO v_existing FROM public.commerce_policy_registry r
    WHERE r.organization_id=v_org AND r.idempotency_key=p_idempotency_key FOR UPDATE;
  IF FOUND THEN
    IF v_existing.request_fingerprint IS DISTINCT FROM v_request_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='policy registry idempotency key payload conflict';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'policy_id',v_existing.id,'policy_key',v_existing.policy_key,
      'version',v_existing.policy_version,'source_fingerprint',v_existing.source_fingerprint,
      'created_at',v_existing.created_at,'idempotent_replay',true
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':policy-source:'||p_source_table||':'||p_source_id::text,0)
  );
  SELECT coalesce(max(r.policy_version),0),max(r.effective_from)
    INTO v_version,v_latest_effective_from
  FROM public.commerce_policy_registry r
  WHERE r.organization_id=v_org AND r.source_table=p_source_table AND r.source_id=p_source_id;
  IF v_latest_effective_from IS NOT NULL AND p_effective_from<v_latest_effective_from THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='a policy metadata version cannot be backdated before the latest registered version';
  END IF;
  v_version:=v_version+1;

  INSERT INTO public.commerce_policy_registry(
    organization_id,policy_key,source_table,source_id,policy_version,
    owner_profile_id,effective_from,effective_until,conflict_priority,
    business_rule,rationale,test_examples,source_fingerprint,request_fingerprint,
    created_by_profile_id,idempotency_key
  ) VALUES (
    v_org,v_key,p_source_table,p_source_id,v_version,
    p_owner_profile_id,p_effective_from,p_effective_until,p_conflict_priority,
    btrim(p_business_rule),btrim(p_rationale),p_test_examples,
    pg_catalog.md5(v_source::text),v_request_fingerprint,v_actor,p_idempotency_key
  ) RETURNING * INTO v_record;

  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'commerce_policy.metadata_registered','commerce_policy',v_record.id,
    pg_catalog.jsonb_build_object(
      'policy_key',v_key,'source_table',p_source_table,'source_id',p_source_id,
      'version',v_version,'owner_profile_id',p_owner_profile_id,
      'effective_from',p_effective_from,'effective_until',p_effective_until,
      'conflict_priority',p_conflict_priority,'source_fingerprint',v_record.source_fingerprint
    ));
  RETURN pg_catalog.jsonb_build_object(
    'policy_id',v_record.id,'policy_key',v_key,'version',v_version,
    'source_fingerprint',v_record.source_fingerprint,'created_at',v_record.created_at,
    'idempotent_replay',false
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_commerce_policy_catalog()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_rows jsonb;
  v_total integer;
  v_finance boolean:=public.can_manage_finance();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_pricing() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager permission required to read commerce policy governance';
  END IF;
  SELECT count(*)::integer INTO v_total
  FROM public.commerce_policy_registry r WHERE r.organization_id=v_org;

  SELECT coalesce(pg_catalog.jsonb_agg(row_value ORDER BY created_at DESC,policy_key,source_id),'[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT r.created_at,r.policy_key,r.source_id,
      pg_catalog.jsonb_build_object(
        'id',r.id,'policyKey',r.policy_key,'sourceTable',r.source_table,'sourceId',r.source_id,
        'version',r.policy_version,'ownerProfileId',r.owner_profile_id,
        'effectiveFrom',r.effective_from,'effectiveUntil',r.effective_until,
        'conflictPriority',r.conflict_priority,'businessRule',r.business_rule,
        'rationale',r.rationale,'testExamples',r.test_examples,
        'sourceFingerprint',r.source_fingerprint,
        'sourceChanged',CASE WHEN current_source.snapshot IS NULL THEN true
          ELSE pg_catalog.md5(current_source.snapshot::text)<>r.source_fingerprint END,
        'currentSource',CASE WHEN r.policy_key='CUSTOMER_CREDIT' AND NOT v_finance
          THEN pg_catalog.jsonb_build_object('restricted',true)
          ELSE coalesce(current_source.snapshot,'{}'::jsonb) END,
        'lifecycle',CASE
          WHEN r.effective_until IS NOT NULL AND r.effective_until<=pg_catalog.now() THEN 'EXPIRED'
          WHEN r.effective_from>pg_catalog.now() THEN 'SCHEDULED'
          WHEN EXISTS (
            SELECT 1 FROM public.commerce_policy_registry newer
            WHERE newer.organization_id=r.organization_id
              AND newer.source_table=r.source_table AND newer.source_id=r.source_id
              AND newer.policy_version>r.policy_version
              AND newer.effective_from<=pg_catalog.now()
          ) THEN 'SUPERSEDED'
          ELSE 'EFFECTIVE' END,
        'createdAt',r.created_at
      ) AS row_value
    FROM public.commerce_policy_registry r
    CROSS JOIN LATERAL (
      SELECT public.commerce_policy_source_snapshot(r.source_table,r.source_id,v_org) AS snapshot
    ) current_source
    WHERE r.organization_id=v_org
    ORDER BY r.created_at DESC,r.policy_key,r.source_id
    LIMIT 200
  ) entries;
  RETURN pg_catalog.jsonb_build_object(
    'asOf',pg_catalog.now(),'totalCount',v_total,
    'returnedCount',pg_catalog.jsonb_array_length(v_rows),
    'completePopulation',v_total<=200,'items',v_rows
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.simulate_commerce_policy(
  p_simulation_type text,
  p_input jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_kind text:=pg_catalog.upper(pg_catalog.btrim(coalesce(p_simulation_type,'')));
  v_now timestamptz:=pg_catalog.now();
  v_input_fingerprint text;
  v_source_fingerprint text;
  v_source_refs jsonb:='[]'::jsonb;
  v_outcome jsonb;
  v_run public.commerce_policy_simulation_runs%ROWTYPE;
  v_product public.products%ROWTYPE;
  v_customer public.customers%ROWTYPE;
  v_balance public.inventory_balances%ROWTYPE;
  v_quantity numeric;
  v_proposed integer;
  v_amount numeric;
  v_limit numeric;
  v_required numeric;
  v_usage numeric;
  v_current_promotion record;
  v_candidate_discount numeric;
  v_candidate_net numeric;
  v_tier text;
  v_overlap_count integer:=0;
  v_event_key text;
  v_entity_type text;
  v_entity_id uuid;
  v_task_role text;
  v_existing_task public.ai_tasks%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_pricing() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager permission required to simulate commerce policies';
  END IF;
  IF p_input IS NULL OR pg_catalog.jsonb_typeof(p_input)<>'object'
     OR pg_catalog.pg_column_size(p_input)>16384 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='simulation input must be a bounded JSON object';
  END IF;
  v_input_fingerprint:=pg_catalog.md5(p_input::text);
  v_source_fingerprint:=pg_catalog.md5(p_input::text);

  CASE v_kind
    WHEN 'PRODUCT_ORDER_QUANTITY' THEN
      BEGIN
        v_product.id:=(p_input->>'product_id')::uuid;
        v_quantity:=(p_input->>'quantity')::numeric;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid product or quantity';
      END;
      IF v_product.id IS NULL OR v_quantity IS NULL OR v_quantity::text IN ('NaN','Infinity','-Infinity')
         OR v_quantity<>pg_catalog.trunc(v_quantity) OR v_quantity<1 OR v_quantity>10000 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='quantity must be a whole number from 1 to 10000';
      END IF;
      SELECT p.* INTO v_product FROM public.products p
      WHERE p.id=v_product.id AND p.organization_id=v_org AND p.status='active';
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='product is unavailable in this organization'; END IF;
      v_required:=v_product.min_order_quantity+
        pg_catalog.ceil(greatest(v_quantity-v_product.min_order_quantity,0)/v_product.order_quantity_multiple)
          *v_product.order_quantity_multiple;
      v_outcome:=pg_catalog.jsonb_build_object(
        'simulationType',v_kind,'productId',v_product.id,'quantity',v_quantity,
        'minimumQuantity',v_product.min_order_quantity,'quantityMultiple',v_product.order_quantity_multiple,
        'allowed',v_quantity>=v_product.min_order_quantity
          AND pg_catalog.mod(v_quantity-v_product.min_order_quantity,v_product.order_quantity_multiple)=0,
        'nextAllowedQuantity',v_required,
        'noWrite',true,'source','products.min_order_quantity + products.order_quantity_multiple'
      );
      v_source_refs:=pg_catalog.jsonb_build_array(v_product.id);
      v_source_fingerprint:=pg_catalog.md5(public.commerce_policy_source_snapshot('products',v_product.id,v_org)::text);

    WHEN 'CUSTOMER_CREDIT' THEN
      IF NOT public.can_manage_finance() THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to simulate customer credit';
      END IF;
      BEGIN
        v_customer.id:=(p_input->>'customer_id')::uuid;
        v_limit:=(p_input->>'proposed_credit_limit')::numeric;
        v_amount:=(p_input->>'proposed_order_amount')::numeric;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid customer credit scenario';
      END;
      IF v_customer.id IS NULL OR v_limit IS NULL OR v_amount IS NULL
         OR v_limit::text IN ('NaN','Infinity','-Infinity') OR v_amount::text IN ('NaN','Infinity','-Infinity')
         OR v_limit<0 OR v_amount<=0 OR v_limit>999999999999999 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='credit limit must be nonnegative and proposed order amount must be positive';
      END IF;
      SELECT c.* INTO v_customer FROM public.customers c
      WHERE c.id=v_customer.id AND c.organization_id=v_org FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer is unavailable in this organization'; END IF;
      v_required:=coalesce(v_customer.current_balance,0)+v_amount;
      v_outcome:=pg_catalog.jsonb_build_object(
        'simulationType',v_kind,'customerId',v_customer.id,'customerStatus',v_customer.status,
        'currentBalance',coalesce(v_customer.current_balance,0),
        'proposedCreditLimit',v_limit,'proposedOrderAmount',v_amount,
        'balanceAfterProposedOrder',v_required,
        'availableAfterProposedOrder',v_limit-v_required,
        'allowed',v_customer.status='approved' AND v_limit>0 AND v_required<=v_limit,
        'rule','current_balance + proposed_order_amount <= proposed_credit_limit; customer must be approved',
        'noWrite',true,'source','customers.credit_limit + customers.current_balance'
      );
      v_source_refs:=pg_catalog.jsonb_build_array(v_customer.id);
      v_source_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
        'customer_id',v_customer.id,'status',v_customer.status,
        'credit_limit',v_customer.credit_limit,'current_balance',v_customer.current_balance
      )::text);

    WHEN 'INVENTORY_REORDER_POINT' THEN
      BEGIN
        v_product.id:=(p_input->>'product_id')::uuid;
        v_balance.id:=(p_input->>'inventory_balance_id')::uuid;
        v_proposed:=(p_input->>'proposed_reorder_point')::integer;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid product, balance or reorder-point scenario';
      END;
      IF v_product.id IS NULL OR v_balance.id IS NULL OR v_proposed IS NULL OR v_proposed NOT BETWEEN 0 AND 1000000000 THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid product, inventory balance and reorder point are required';
      END IF;
      SELECT ib.* INTO v_balance FROM public.inventory_balances ib
      JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org
      JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org AND w.is_active
      WHERE ib.id=v_balance.id AND ib.product_id=v_product.id;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory balance is unavailable in this organization'; END IF;
      SELECT coalesce(sum(-im.quantity),0) INTO v_usage
      FROM public.inventory_movements im
      WHERE im.product_id=v_product.id AND im.warehouse_id=v_balance.warehouse_id
        AND im.movement_type='sale' AND im.quantity<0
        AND im.created_at>=v_now-interval '30 days' AND im.created_at<=v_now;
      v_required:=v_usage/30;
      v_outcome:=pg_catalog.jsonb_build_object(
        'simulationType',v_kind,'productId',v_product.id,'inventoryBalanceId',v_balance.id,
        'warehouseId',v_balance.warehouse_id,'availableQuantity',v_balance.quantity_available,
        'currentReorderPoint',v_balance.reorder_point,'proposedReorderPoint',v_proposed,
        'currentTriggersReorder',v_balance.quantity_available<=coalesce(v_balance.reorder_point,0),
        'proposedTriggersReorder',v_balance.quantity_available<=v_proposed,
        'observedSaleQuantity30Days',v_usage,'observedAverageSalePerDay30Days',v_required,
        'estimatedDaysUntilProposedPoint',CASE WHEN v_required>0
          THEN round(greatest(v_balance.quantity_available-v_proposed,0)/v_required,2) ELSE NULL END,
        'usageWindowDays',30,'noWrite',true,
        'source','inventory_balances + inventory_movements(sale)'
      );
      v_source_refs:=pg_catalog.jsonb_build_array(v_product.id,v_balance.id);
      v_source_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
        'balance_id',v_balance.id,'available',v_balance.quantity_available,
        'reorder_point',v_balance.reorder_point,'sale_quantity_30d',v_usage
      )::text);

    WHEN 'PROMOTION_PREVIEW' THEN
      BEGIN
        v_product.id:=(p_input->>'product_id')::uuid;
        v_customer.id:=(p_input->>'customer_id')::uuid;
        v_quantity:=(p_input->>'quantity')::numeric;
        v_amount:=(p_input->>'candidate_discount_value')::numeric;
      EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid promotion preview inputs';
      END;
      IF v_product.id IS NULL OR v_customer.id IS NULL OR v_quantity IS NULL OR v_quantity<1
         OR v_quantity>10000 OR v_quantity<>pg_catalog.trunc(v_quantity)
         OR p_input->>'candidate_discount_type' IS NULL OR p_input->>'candidate_discount_type' NOT IN ('percentage','fixed')
         OR v_amount IS NULL OR v_amount<=0 OR v_amount>99999999.99
         OR (p_input->>'candidate_discount_type'='percentage' AND v_amount>100) THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='candidate promotion, product, customer or quantity is invalid';
      END IF;
      SELECT p.* INTO v_product FROM public.products p
      WHERE p.id=v_product.id AND p.organization_id=v_org AND p.status='active';
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='product is unavailable in this organization'; END IF;
      SELECT c.* INTO v_customer FROM public.customers c
      WHERE c.id=v_customer.id AND c.organization_id=v_org;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer is unavailable in this organization'; END IF;
      PERFORM public.assert_product_order_quantity(v_product.id,v_org,v_quantity);
      v_tier:=CASE WHEN v_customer.status='approved' THEN coalesce(nullif(v_customer.tier,''),'retail') ELSE 'retail' END;
      v_amount:=public.customer_product_unit_price(v_product.id,v_org,v_tier,v_quantity);
      SELECT * INTO v_current_promotion
      FROM public.resolve_active_promotion_price(v_product.id,v_org,v_amount);
      v_candidate_discount:=CASE WHEN p_input->>'candidate_discount_type'='percentage'
        THEN round(v_amount*((p_input->>'candidate_discount_value')::numeric)/100,2)
        ELSE round((p_input->>'candidate_discount_value')::numeric,2) END;
      v_candidate_discount:=least(greatest(v_candidate_discount,0),
        greatest(v_amount-greatest(coalesce(v_product.cost_price,0),0),0));
      SELECT count(*)::integer INTO v_overlap_count
      FROM public.promotions pr
      WHERE pr.organization_id=v_org AND pr.is_active=true
        AND pr.start_date<=current_date AND pr.end_date>=current_date
        AND (
          (coalesce(cardinality(pr.product_ids),0)=0 AND coalesce(cardinality(pr.category_ids),0)=0)
          OR v_product.id=ANY(coalesce(pr.product_ids,ARRAY[]::uuid[]))
          OR (v_product.category_id IS NOT NULL AND v_product.category_id=ANY(coalesce(pr.category_ids,ARRAY[]::uuid[])))
        );
      v_candidate_net:=round(v_amount-v_candidate_discount,2);
      v_outcome:=pg_catalog.jsonb_build_object(
        'simulationType',v_kind,'productId',v_product.id,'customerId',v_customer.id,
        'quantity',v_quantity,'tierUsed',v_tier,'grossUnitPrice',v_amount,
        'currentWinningPromotionId',v_current_promotion.promotion_id,
        'currentWinningPromotionTitle',v_current_promotion.promotion_title,
        'currentDiscountPerUnit',coalesce(v_current_promotion.discount_per_unit,0),
        'candidateDiscountType',p_input->>'candidate_discount_type',
        'candidateDiscountValue',p_input->>'candidate_discount_value',
        'candidateDiscountPerUnit',v_candidate_discount,
        'candidateNetUnitPrice',v_candidate_net,
        'candidateWouldWin',v_candidate_discount>coalesce(v_current_promotion.discount_per_unit,0),
        'overlappingActivePromotionCount',v_overlap_count,
        'combinePromotions',false,
        'conflictPriority','highest permitted discount wins; tie-break is the existing resolver creation-time/id order and requires review',
        'noWrite',true,'source','customer_product_unit_price + resolve_active_promotion_price'
      );
      v_source_refs:=pg_catalog.jsonb_build_array(v_product.id,v_customer.id);
      v_source_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
        'product_id',v_product.id,'base_price',v_product.base_price,'cost_price',v_product.cost_price,
        'customer_id',v_customer.id,'tier',v_tier,'gross_unit_price',v_amount,
        'winning_promotion_id',v_current_promotion.promotion_id,
        'winning_discount',v_current_promotion.discount_per_unit,
        'overlap_count',v_overlap_count
      )::text);

    WHEN 'TASK_DEDUPLICATION' THEN
      BEGIN
        v_entity_id:=(p_input->>'source_entity_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='invalid task source entity id';
      END;
      v_event_key:=btrim(coalesce(p_input->>'source_event_key',''));
      v_entity_type:=btrim(coalesce(p_input->>'source_entity_type',''));
      v_task_role:=btrim(coalesce(p_input->>'task_role',''));
      IF v_entity_id IS NULL OR v_event_key !~ '^[A-Za-z0-9:_-]{1,240}$'
         OR v_entity_type NOT IN ('orders','customers','products','sales_quotes','purchase_orders','customer_invoices','inventory_balances')
         OR v_task_role NOT IN ('sales','accountant','warehouse','purchasing','management','operations') THEN
        RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid task source key, entity type and role are required';
      END IF;
      IF NOT (
        CASE v_entity_type
          WHEN 'orders' THEN EXISTS(SELECT 1 FROM public.orders x WHERE x.id=v_entity_id AND x.organization_id=v_org)
          WHEN 'customers' THEN EXISTS(SELECT 1 FROM public.customers x WHERE x.id=v_entity_id AND x.organization_id=v_org)
          WHEN 'products' THEN EXISTS(SELECT 1 FROM public.products x WHERE x.id=v_entity_id AND x.organization_id=v_org)
          WHEN 'sales_quotes' THEN EXISTS(SELECT 1 FROM public.sales_quotes x WHERE x.id=v_entity_id AND x.organization_id=v_org)
          WHEN 'purchase_orders' THEN EXISTS(SELECT 1 FROM public.purchase_orders x WHERE x.id=v_entity_id AND x.organization_id=v_org)
          WHEN 'customer_invoices' THEN EXISTS(SELECT 1 FROM public.customer_invoices x WHERE x.id=v_entity_id AND x.organization_id=v_org)
          WHEN 'inventory_balances' THEN EXISTS(
            SELECT 1 FROM public.inventory_balances x
            JOIN public.products p ON p.id=x.product_id AND p.organization_id=v_org
            JOIN public.warehouses w ON w.id=x.warehouse_id AND w.organization_id=v_org
            WHERE x.id=v_entity_id
          )
          ELSE false
        END
      ) THEN
        RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='task simulation source record is unavailable in this organization';
      END IF;
      SELECT t.id,t.title,t.status,t.task_role,t.source_event_key,t.source_entity_type,t.source_entity_id
        INTO v_existing_task
      FROM public.ai_tasks t
      WHERE t.organization_id=v_org AND t.source_entity_type=v_entity_type
        AND t.source_entity_id=v_entity_id AND t.task_role=v_task_role
        AND t.status IN ('pending','in_progress')
      ORDER BY t.created_at,t.id LIMIT 1;
      IF FOUND THEN
        v_outcome:=pg_catalog.jsonb_build_object(
          'simulationType',v_kind,'decision','SKIP_EQUIVALENT_OPEN_TASK',
          'existingTaskId',v_existing_task.id,'existingTaskStatus',v_existing_task.status,
          'existingTaskTitle',v_existing_task.title,'sourceEventKey',v_existing_task.source_event_key,
          'noWrite',true,'source','ai_tasks'
        );
      ELSE
        SELECT t.id,t.title,t.status,t.task_role,t.source_event_key,t.source_entity_type,t.source_entity_id
          INTO v_existing_task
        FROM public.ai_tasks t
        WHERE t.organization_id=v_org AND t.source_event_key=v_event_key
        ORDER BY t.created_at DESC,t.id DESC LIMIT 1;
        IF FOUND THEN
          v_outcome:=pg_catalog.jsonb_build_object(
            'simulationType',v_kind,
            'decision',CASE WHEN v_existing_task.status IN ('completed','cancelled')
              THEN 'SAME_EVENT_ALREADY_RESOLVED_REOPEN_WOULD_REQUIRE_EVENT_RULE'
              ELSE 'SAME_EVENT_KEY_ALREADY_EXISTS' END,
            'existingTaskId',v_existing_task.id,'existingTaskStatus',v_existing_task.status,
            'existingTaskTitle',v_existing_task.title,'sourceEventKey',v_event_key,
            'noWrite',true,'source','ai_tasks'
          );
        ELSE
          v_outcome:=pg_catalog.jsonb_build_object(
            'simulationType',v_kind,'decision','NO_EQUIVALENT_OPEN_TASK_FOUND',
            'sourceEventKey',v_event_key,'sourceEntityType',v_entity_type,
            'sourceEntityId',v_entity_id,'taskRole',v_task_role,
            'noWrite',true,'source','ai_tasks'
          );
        END IF;
      END IF;
      v_source_refs:=pg_catalog.jsonb_build_array(v_entity_id);
      v_source_fingerprint:=pg_catalog.md5(pg_catalog.jsonb_build_object(
        'source_event_key',v_event_key,'source_entity_type',v_entity_type,
        'source_entity_id',v_entity_id,'task_role',v_task_role,
        'existing_task_id',coalesce(v_existing_task.id,NULL),
        'existing_task_status',coalesce(v_existing_task.status,NULL)
      )::text);

    ELSE
      RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unsupported typed commerce policy simulation';
  END CASE;

  INSERT INTO public.commerce_policy_simulation_runs(
    organization_id,simulation_type,source_refs,input_fingerprint,source_fingerprint,
    outcome,created_by_profile_id
  ) VALUES (
    v_org,v_kind,v_source_refs,v_input_fingerprint,v_source_fingerprint,v_outcome,v_actor
  ) RETURNING * INTO v_run;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'commerce_policy.simulation_recorded','commerce_policy_simulation',v_run.id,
    pg_catalog.jsonb_build_object('simulation_type',v_kind,'source_refs',v_source_refs,
      'input_fingerprint',v_input_fingerprint,'source_fingerprint',v_source_fingerprint,
      'no_write',true));
  RETURN pg_catalog.jsonb_build_object(
    'simulationId',v_run.id,'simulationType',v_kind,'asOf',v_run.created_at,
    'inputFingerprint',v_input_fingerprint,'sourceFingerprint',v_source_fingerprint,
    'outcome',v_outcome,'noWrite',true
  );
END;
$function$;



CREATE OR REPLACE FUNCTION public.fetch_commerce_policy_owners()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_items jsonb;
  v_total integer;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.can_manage_pricing() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager permission required to select policy owners';
  END IF;
  SELECT count(*)::integer INTO v_total
  FROM public.profiles p
  WHERE p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL;
  SELECT coalesce(jsonb_agg(row_value ORDER BY display_name,profile_id),'[]'::jsonb)
  INTO v_items
  FROM (
    SELECT p.id AS profile_id,p.full_name AS display_name,
      jsonb_build_object('id',p.id,'name',p.full_name,
        'roles',coalesce((SELECT jsonb_agg(r.role ORDER BY r.role) FROM public.user_roles r WHERE r.profile_id=p.id),'[]'::jsonb)
      ) AS row_value
    FROM public.profiles p
    WHERE p.organization_id=v_org AND p.is_active AND p.auth_user_id IS NOT NULL
    ORDER BY p.full_name,p.id LIMIT 200
  ) owners;
  RETURN jsonb_build_object('items',v_items,'totalCount',v_total,
    'returnedCount',jsonb_array_length(v_items),'completePopulation',v_total<=200);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_commerce_policy_sources(
  p_source_table text,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_org uuid:=public.current_organization_id();
  v_search text:=nullif(btrim(coalesce(p_search,'')),'');
  v_items jsonb:='[]'::jsonb;
  v_total integer:=0;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL OR NOT public.can_manage_pricing() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager permission required to select policy sources';
  END IF;
  IF p_source_table IS NULL OR p_source_table NOT IN
      ('pricing_rules','promotions','customers','products','inventory_balances')
     OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='policy source table or result limit is invalid';
  END IF;
  CASE p_source_table
    WHEN 'pricing_rules' THEN
      SELECT count(*)::integer INTO v_total FROM public.pricing_rules r
      WHERE r.organization_id=v_org
        AND (v_search IS NULL OR r.name ILIKE '%'||v_search||'%' OR r.id::text=v_search);
      SELECT coalesce(jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb) INTO v_items
      FROM (
        SELECT r.id AS sort_key,jsonb_build_object(
          'id',r.id,'label',r.name,'sourceTable',p_source_table,
          'status',CASE WHEN r.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
          'detail',r.scope_type||' · الأولوية '||r.priority
        ) AS row_value
        FROM public.pricing_rules r
        WHERE r.organization_id=v_org
          AND (v_search IS NULL OR r.name ILIKE '%'||v_search||'%' OR r.id::text=v_search)
        ORDER BY r.updated_at DESC,r.id LIMIT p_limit
      ) x;
    WHEN 'promotions' THEN
      SELECT count(*)::integer INTO v_total FROM public.promotions p
      WHERE p.organization_id=v_org
        AND (v_search IS NULL OR p.title ILIKE '%'||v_search||'%' OR p.id::text=v_search);
      SELECT coalesce(jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb) INTO v_items
      FROM (
        SELECT p.id AS sort_key,jsonb_build_object(
          'id',p.id,'label',p.title,'sourceTable',p_source_table,
          'status',CASE WHEN p.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END,
          'detail',p.discount_type||' · '||p.discount_value::text||' · '||p.start_date::text||' → '||p.end_date::text
        ) AS row_value
        FROM public.promotions p
        WHERE p.organization_id=v_org
          AND (v_search IS NULL OR p.title ILIKE '%'||v_search||'%' OR p.id::text=v_search)
        ORDER BY p.created_at DESC,p.id LIMIT p_limit
      ) x;
    WHEN 'customers' THEN
      SELECT count(*)::integer INTO v_total FROM public.customers c
      WHERE c.organization_id=v_org
        AND (v_search IS NULL OR c.business_name ILIKE '%'||v_search||'%' OR c.customer_code ILIKE '%'||v_search||'%' OR c.id::text=v_search);
      SELECT coalesce(jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb) INTO v_items
      FROM (
        SELECT c.id AS sort_key,jsonb_build_object(
          'id',c.id,'label',c.business_name,'sourceTable',p_source_table,
          'status',c.status,'detail','العميل '||c.customer_code||' · '||c.tier
        ) AS row_value
        FROM public.customers c
        WHERE c.organization_id=v_org
          AND (v_search IS NULL OR c.business_name ILIKE '%'||v_search||'%' OR c.customer_code ILIKE '%'||v_search||'%' OR c.id::text=v_search)
        ORDER BY c.business_name,c.id LIMIT p_limit
      ) x;
    WHEN 'products' THEN
      SELECT count(*)::integer INTO v_total FROM public.products p
      WHERE p.organization_id=v_org
        AND (v_search IS NULL OR p.name ILIKE '%'||v_search||'%' OR p.item_code ILIKE '%'||v_search||'%' OR p.id::text=v_search);
      SELECT coalesce(jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb) INTO v_items
      FROM (
        SELECT p.id AS sort_key,jsonb_build_object(
          'id',p.id,'label',p.name,'sourceTable',p_source_table,
          'status',p.status,'detail','الصنف '||p.item_code||' · أقل كمية '||p.min_order_quantity::text||' · المضاعف '||p.order_quantity_multiple::text
        ) AS row_value
        FROM public.products p
        WHERE p.organization_id=v_org
          AND (v_search IS NULL OR p.name ILIKE '%'||v_search||'%' OR p.item_code ILIKE '%'||v_search||'%' OR p.id::text=v_search)
        ORDER BY p.name,p.item_code,p.id LIMIT p_limit
      ) x;
    WHEN 'inventory_balances' THEN
      SELECT count(*)::integer INTO v_total FROM public.inventory_balances ib
      JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org
      JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org
      WHERE (v_search IS NULL OR p.name ILIKE '%'||v_search||'%' OR p.item_code ILIKE '%'||v_search||'%' OR w.name ILIKE '%'||v_search||'%' OR ib.id::text=v_search);
      SELECT coalesce(jsonb_agg(row_value ORDER BY sort_key),'[]'::jsonb) INTO v_items
      FROM (
        SELECT ib.id AS sort_key,jsonb_build_object(
          'id',ib.id,'label',p.name||' · '||w.name,'sourceTable',p_source_table,
          'status',CASE WHEN ib.quantity_available<=coalesce(ib.reorder_point,0) THEN 'REORDER' ELSE 'HEALTHY' END,
          'detail','المتاح '||ib.quantity_available::text||' · نقطة الطلب '||coalesce(ib.reorder_point,0)::text
        ) AS row_value
        FROM public.inventory_balances ib
        JOIN public.products p ON p.id=ib.product_id AND p.organization_id=v_org
        JOIN public.warehouses w ON w.id=ib.warehouse_id AND w.organization_id=v_org
        WHERE (v_search IS NULL OR p.name ILIKE '%'||v_search||'%' OR p.item_code ILIKE '%'||v_search||'%' OR w.name ILIKE '%'||v_search||'%' OR ib.id::text=v_search)
        ORDER BY p.name,w.name,ib.id LIMIT p_limit
      ) x;
  END CASE;
  RETURN jsonb_build_object(
    'sourceTable',p_source_table,'items',v_items,'totalCount',v_total,
    'returnedCount',jsonb_array_length(v_items),'completePopulation',v_total<=p_limit,
    'asOf',now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fetch_commerce_policy_simulation_history(
  p_simulation_type text DEFAULT NULL,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_items jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_pricing() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager permission required to read simulation history';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 100 OR
     (p_simulation_type IS NOT NULL AND p_simulation_type NOT IN (
       'PROMOTION_PREVIEW','CUSTOMER_CREDIT','PRODUCT_ORDER_QUANTITY','INVENTORY_REORDER_POINT','TASK_DEDUPLICATION'
     )) THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='simulation history filter is invalid';
  END IF;
  IF p_simulation_type='CUSTOMER_CREDIT' AND NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='finance permission required to read customer credit simulation history';
  END IF;
  SELECT coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id',r.id,'simulationType',r.simulation_type,'sourceRefs',r.source_refs,
    'inputFingerprint',r.input_fingerprint,'sourceFingerprint',r.source_fingerprint,
    'outcome',r.outcome,'createdAt',r.created_at
  ) ORDER BY r.created_at DESC,r.id),'[]'::jsonb)
  INTO v_items
  FROM (
    SELECT s.* FROM public.commerce_policy_simulation_runs s
    WHERE s.organization_id=v_org
      AND (p_simulation_type IS NULL OR s.simulation_type=p_simulation_type)
      AND (s.simulation_type<>'CUSTOMER_CREDIT' OR public.can_manage_finance())
    ORDER BY s.created_at DESC,s.id DESC LIMIT p_limit
  ) r;
  RETURN pg_catalog.jsonb_build_object('items',v_items,'returnedCount',pg_catalog.jsonb_array_length(v_items),'asOf',pg_catalog.now());
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_commerce_policy_owners() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_commerce_policy_sources(text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_commerce_policy_owners() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_commerce_policy_sources(text,text,integer) TO authenticated;


CREATE OR REPLACE FUNCTION public.preview_commerce_policy_rollback(
  p_source_table text,
  p_source_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_actor uuid:=public.current_profile_id();
  v_org uuid:=public.current_organization_id();
  v_entity_type text;
  v_action_prefix text;
  v_current jsonb;
  v_last_event public.audit_logs%ROWTYPE;
  v_can_restore boolean;
  v_workflow text;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL OR NOT public.can_manage_pricing() THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='admin or manager permission required to preview policy rollback';
  END IF;
  IF p_source_table IS NULL OR p_source_id IS NULL OR p_source_table NOT IN ('pricing_rules','promotions') THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='rollback preview is available only for audited pricing rules and promotions';
  END IF;
  v_entity_type:=CASE p_source_table WHEN 'pricing_rules' THEN 'pricing_rule' ELSE 'promotion' END;
  v_action_prefix:=CASE p_source_table WHEN 'pricing_rules' THEN 'pricing_rule.' ELSE 'promotion.' END;
  v_current:=public.commerce_policy_source_snapshot(p_source_table,p_source_id,v_org);
  IF v_current IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='policy source is unavailable in this organization';
  END IF;
  SELECT a.* INTO v_last_event FROM public.audit_logs a
  WHERE a.organization_id=v_org AND a.entity_type=v_entity_type
    AND a.entity_id=p_source_id AND a.action IN (v_action_prefix||'updated',v_action_prefix||'deleted')
    AND a.old_value IS NOT NULL
  ORDER BY a.created_at DESC,a.id DESC LIMIT 1;
  v_can_restore:=FOUND AND v_last_event.old_value IS NOT NULL
    AND v_last_event.old_value->>'organization_id'=v_org::text
    AND v_last_event.old_value->>'id'=p_source_id::text;
  v_workflow:=CASE p_source_table
    WHEN 'pricing_rules' THEN 'إعادة تطبيق القيم السابقة حصراً عبر مسار إدارة قواعد التسعير المعتمد والموافقات القائمة.'
    ELSE 'إعادة تطبيق القيم السابقة حصراً عبر save_promotion وصلاحية المدير/المسؤول وسجل التدقيق الأصلي.'
  END;
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,new_value)
  VALUES(v_org,v_actor,'commerce_policy.rollback_previewed','commerce_policy',p_source_id,
    pg_catalog.jsonb_build_object('source_table',p_source_table,'can_restore',coalesce(v_can_restore,false),
      'source_audit_event_id',CASE WHEN v_can_restore THEN v_last_event.id ELSE NULL END,'no_write',true));
  RETURN pg_catalog.jsonb_build_object(
    'sourceTable',p_source_table,'sourceId',p_source_id,
    'canRestore',coalesce(v_can_restore,false),
    'sourceAuditEventId',CASE WHEN v_can_restore THEN v_last_event.id ELSE NULL END,
    'sourceAuditAction',CASE WHEN v_can_restore THEN v_last_event.action ELSE NULL END,
    'sourceAuditAt',CASE WHEN v_can_restore THEN v_last_event.created_at ELSE NULL END,
    'currentValue',v_current,
    'previousValue',CASE WHEN v_can_restore THEN v_last_event.old_value ELSE NULL END,
    'requiredWorkflow',v_workflow,'requiresHumanApproval',true,'noWrite',true
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.register_commerce_policy_metadata(text,uuid,uuid,timestamptz,timestamptz,integer,text,text,jsonb,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_commerce_policy_catalog() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.simulate_commerce_policy(text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fetch_commerce_policy_simulation_history(text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.preview_commerce_policy_rollback(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.preview_commerce_policy_rollback(text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_commerce_policy_metadata(text,uuid,uuid,timestamptz,timestamptz,integer,text,text,jsonb,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_commerce_policy_catalog() TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_commerce_policy(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fetch_commerce_policy_simulation_history(text,integer) TO authenticated;

COMMENT ON TABLE public.commerce_policy_registry IS
  'Append-only governance metadata linked to existing source-of-truth policies; it does not duplicate or activate commercial rules.';
COMMENT ON TABLE public.commerce_policy_simulation_runs IS
  'Append-only evidence of typed, read-only commerce policy what-if simulations.';
COMMENT ON FUNCTION public.simulate_commerce_policy(text,jsonb) IS
  'Manager-authorized, tenant-scoped, allowlisted what-if scenarios. No SQL execution, rule activation, price write, credit mutation or stock write is permitted.';

COMMIT;
