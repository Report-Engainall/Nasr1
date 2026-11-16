-- Connect pricing-rule authoring and approval to Authorization V2.
-- Preserve the legacy proposal UX and independent maker-checker approval, but
-- make active server capabilities and explicit profile denials authoritative.

BEGIN;

CREATE OR REPLACE FUNCTION public.can_manage_pricing()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT auth.uid() IS NOT NULL
     AND public.current_profile_id() IS NOT NULL
     AND public.current_actor_has_capability('pricing.edit_draft');
$function$;
REVOKE ALL ON FUNCTION public.can_manage_pricing() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_pricing() TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_pricing_rule_governance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_can_edit boolean := coalesce(public.current_actor_has_capability('pricing.edit_draft'),false);
  v_can_propose boolean := coalesce(public.current_actor_has_capability('pricing.propose'),false);
  v_governance_rpc boolean := false;
  v_price_fields_changed boolean := false;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='A live authenticated pricing identity is required';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NOT (v_can_edit OR v_can_propose) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='pricing.propose or pricing.edit_draft capability required';
    END IF;
    IF NEW.approved_by IS NOT NULL OR NEW.approved_at IS NOT NULL OR NEW.approval_note IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='pricing approval state can only be changed through the governed approval RPC';
    END IF;
    NEW.submitted_by := v_actor;
    IF NOT v_can_edit THEN
      NEW.requires_approval := true;
    END IF;
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM public.pricing_rule_approval_context c
     WHERE c.transaction_id=pg_catalog.txid_current()
       AND c.rule_id=OLD.id
       AND c.actor_id=v_actor
  ) INTO v_governance_rpc;
  IF v_governance_rpc THEN
    RETURN NEW;
  END IF;

  IF NEW.submitted_by IS DISTINCT FROM OLD.submitted_by THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='pricing submitter is server-managed';
  END IF;
  IF NEW.approved_by IS DISTINCT FROM OLD.approved_by
     OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
     OR NEW.approval_note IS DISTINCT FROM OLD.approval_note THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='pricing approval state can only be changed through the governed approval RPC';
  END IF;
  IF NEW.requires_approval IS DISTINCT FROM OLD.requires_approval THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='requires_approval can only be changed by the governed creation path';
  END IF;

  v_price_fields_changed :=
       NEW.name IS DISTINCT FROM OLD.name
    OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
    OR NEW.scope_value IS DISTINCT FROM OLD.scope_value
    OR NEW.base_type IS DISTINCT FROM OLD.base_type
    OR NEW.base_source IS DISTINCT FROM OLD.base_source
    OR NEW.adjustment_type IS DISTINCT FROM OLD.adjustment_type
    OR NEW.calculation_method IS DISTINCT FROM OLD.calculation_method
    OR NEW.adjustment_value IS DISTINCT FROM OLD.adjustment_value
    OR NEW.target_tier IS DISTINCT FROM OLD.target_tier
    OR NEW.min_quantity IS DISTINCT FROM OLD.min_quantity
    OR NEW.min_price IS DISTINCT FROM OLD.min_price
    OR NEW.max_price IS DISTINCT FROM OLD.max_price
    OR NEW.priority IS DISTINCT FROM OLD.priority
    OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
    OR NEW.effective_until IS DISTINCT FROM OLD.effective_until
    OR NEW.is_active IS DISTINCT FROM OLD.is_active;

  IF v_price_fields_changed THEN
    IF NOT v_can_edit THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='pricing.edit_draft capability required to edit an existing pricing rule';
    END IF;
    IF OLD.requires_approval AND NOT (
      OLD.approved_at IS NOT NULL
      AND NEW.is_active IS DISTINCT FROM OLD.is_active
      AND NEW.name IS NOT DISTINCT FROM OLD.name
      AND NEW.scope_type IS NOT DISTINCT FROM OLD.scope_type
      AND NEW.scope_value IS NOT DISTINCT FROM OLD.scope_value
      AND NEW.base_type IS NOT DISTINCT FROM OLD.base_type
      AND NEW.base_source IS NOT DISTINCT FROM OLD.base_source
      AND NEW.adjustment_type IS NOT DISTINCT FROM OLD.adjustment_type
      AND NEW.calculation_method IS NOT DISTINCT FROM OLD.calculation_method
      AND NEW.adjustment_value IS NOT DISTINCT FROM OLD.adjustment_value
      AND NEW.target_tier IS NOT DISTINCT FROM OLD.target_tier
      AND NEW.min_quantity IS NOT DISTINCT FROM OLD.min_quantity
      AND NEW.min_price IS NOT DISTINCT FROM OLD.min_price
      AND NEW.max_price IS NOT DISTINCT FROM OLD.max_price
      AND NEW.priority IS NOT DISTINCT FROM OLD.priority
      AND NEW.effective_from IS NOT DISTINCT FROM OLD.effective_from
      AND NEW.effective_until IS NOT DISTINCT FROM OLD.effective_until
    ) THEN
      RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='approval-governed pricing rules cannot be edited; submit a new pricing rule version';
    END IF;
    NEW.version := greatest(coalesce(NEW.version,OLD.version),OLD.version+1);
    NEW.updated_at := pg_catalog.now();
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_pricing_rule_governance() FROM PUBLIC,anon,authenticated;

DROP POLICY IF EXISTS tenant_insert_pricing_rules ON public.pricing_rules;
CREATE POLICY tenant_insert_pricing_rules
  ON public.pricing_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id=(SELECT p.organization_id
      FROM public.profiles p
     WHERE p.id=public.current_profile_id()
       AND p.auth_user_id=auth.uid()
       AND p.is_active)
    AND (
      public.current_actor_has_capability('pricing.propose')
      OR public.current_actor_has_capability('pricing.edit_draft')
    )
  );

DROP POLICY IF EXISTS tenant_update_pricing_rules ON public.pricing_rules;
CREATE POLICY tenant_update_pricing_rules
  ON public.pricing_rules
  FOR UPDATE TO authenticated
  USING (
    organization_id=(SELECT p.organization_id
      FROM public.profiles p
     WHERE p.id=public.current_profile_id()
       AND p.auth_user_id=auth.uid()
       AND p.is_active)
    AND public.current_actor_has_capability('pricing.edit_draft')
  )
  WITH CHECK (
    organization_id=(SELECT p.organization_id
      FROM public.profiles p
     WHERE p.id=public.current_profile_id()
       AND p.auth_user_id=auth.uid()
       AND p.is_active)
    AND public.current_actor_has_capability('pricing.edit_draft')
  );

CREATE OR REPLACE FUNCTION public.approve_pricing_rule(p_rule_id uuid,p_approval_note text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_rule public.pricing_rules%ROWTYPE;
  v_note text := pg_catalog.left(pg_catalog.btrim(coalesce(p_approval_note,'')),1000);
  v_txid bigint := pg_catalog.txid_current();
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL
     OR NOT public.current_actor_has_capability('pricing.approve') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='pricing.approve capability and a live administrator/manager session are required';
  END IF;
  IF v_note IS NULL OR pg_catalog.length(v_note)<3 THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='approval rationale is required';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
    JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active pricing approver organization required';
  END IF;
  SELECT r.* INTO v_rule
    FROM public.pricing_rules r
   WHERE r.id=p_rule_id AND r.organization_id=v_org
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002',MESSAGE='pricing rule not found in active organization';
  END IF;
  IF v_rule.manually_locked THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='manually locked pricing rules cannot be approved';
  END IF;
  IF v_rule.approved_at IS NOT NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'id',v_rule.id,'approved',true,'already_approved',true,
      'approved_at',v_rule.approved_at,'approval_note',v_rule.approval_note,'version',v_rule.version
    );
  END IF;
  IF NOT v_rule.requires_approval THEN
    RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='pricing rule does not require approval';
  END IF;
  IF v_rule.submitted_by IS NOT DISTINCT FROM v_actor THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='pricing approval must be performed by someone other than the submitter';
  END IF;

  INSERT INTO public.pricing_rule_approval_context(transaction_id,rule_id,actor_id)
  VALUES(v_txid,v_rule.id,v_actor);
  UPDATE public.pricing_rules
     SET approved_by=v_actor,approved_at=pg_catalog.now(),approval_note=v_note
   WHERE id=v_rule.id AND organization_id=v_org
   RETURNING * INTO v_rule;
  DELETE FROM public.pricing_rule_approval_context
   WHERE transaction_id=v_txid AND rule_id=v_rule.id AND actor_id=v_actor;

  RETURN pg_catalog.jsonb_build_object(
    'id',v_rule.id,'approved',true,'already_approved',false,
    'approved_by',v_rule.approved_by,'approved_at',v_rule.approved_at,
    'approval_note',v_rule.approval_note,'version',v_rule.version
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.approve_pricing_rule(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.approve_pricing_rule(uuid,text) TO authenticated;

COMMENT ON FUNCTION public.can_manage_pricing() IS
  'Returns the active server Authorization V2 pricing.edit_draft decision; role names alone do not grant pricing management.';
COMMENT ON FUNCTION public.guard_pricing_rule_governance() IS
  'Enforces V2 pricing.propose/pricing.edit_draft decisions, server-attributed submitter identity, and protected maker-checker approval metadata.';
COMMENT ON FUNCTION public.approve_pricing_rule(uuid,text) IS
  'Requires pricing.approve, a live organization member, an independent approver, an explicit rationale, row locking and append-only audit through the pricing rule mutation trigger.';

COMMIT;
