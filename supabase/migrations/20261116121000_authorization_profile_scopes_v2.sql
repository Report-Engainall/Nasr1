BEGIN;

CREATE TABLE IF NOT EXISTS public.authorization_profile_scopes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 scope_kind text NOT NULL CHECK(scope_kind IN ('warehouse','assigned_customer')),
 warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
 customer_id uuid REFERENCES public.customers(id) ON DELETE RESTRICT,
 reason text NOT NULL CHECK(length(btrim(reason))>=5),
 is_active boolean NOT NULL DEFAULT true,
 valid_from timestamptz NOT NULL DEFAULT statement_timestamp(),
 expires_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>=1),
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 CHECK(expires_at IS NULL OR expires_at>valid_from),
 CHECK((scope_kind='warehouse' AND warehouse_id IS NOT NULL AND customer_id IS NULL)
    OR (scope_kind='assigned_customer' AND customer_id IS NOT NULL AND warehouse_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS authorization_profile_scopes_warehouse_unique
 ON public.authorization_profile_scopes(organization_id,profile_id,warehouse_id) WHERE scope_kind='warehouse';
CREATE UNIQUE INDEX IF NOT EXISTS authorization_profile_scopes_customer_unique
 ON public.authorization_profile_scopes(organization_id,profile_id,customer_id) WHERE scope_kind='assigned_customer';
CREATE INDEX IF NOT EXISTS authorization_profile_scopes_active_lookup
 ON public.authorization_profile_scopes(organization_id,profile_id,scope_kind,is_active,valid_from,expires_at);
ALTER TABLE public.authorization_profile_scopes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.authorization_profile_scopes FROM PUBLIC,anon,authenticated;

UPDATE public.authorization_capabilities
 SET scope_kind='warehouse',
     state_requirements=state_requirements || '{"requires_active_warehouse_assignment":true}'::jsonb,
     updated_at=statement_timestamp()
 WHERE capability_key='inventory.balance.adjust';

CREATE OR REPLACE FUNCTION public.set_authorization_profile_scope(
 p_target_profile_id uuid,p_scope_kind text,p_scope_id uuid,p_reason text,
 p_expires_at timestamptz,p_is_active boolean,p_expected_revision integer
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_actor_profile_id uuid; v_organization_id uuid; v_target public.profiles%ROWTYPE;
 v_scope public.authorization_profile_scopes%ROWTYPE; v_previous jsonb; v_next jsonb; v_found boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_actor_has_capability('identity.roles.assign') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='identity.roles.assign capability required';
 END IF;
 IF p_target_profile_id IS NULL OR p_scope_id IS NULL OR p_scope_kind IS NULL
    OR p_scope_kind NOT IN ('warehouse','assigned_customer')
    OR p_expected_revision IS NULL OR p_expected_revision<0 OR p_is_active IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason))<5 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='valid target, supported scope, reason and expected revision are required';
 END IF;
 IF p_is_active AND p_expires_at IS NOT NULL AND p_expires_at<=statement_timestamp() THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='scope expiry must be in the future';
 END IF;
 SELECT p.id,p.organization_id INTO v_actor_profile_id,v_organization_id
 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
 WHERE p.auth_user_id=auth.uid() AND p.is_active=true AND p.organization_id IS NOT NULL
 ORDER BY p.created_at,p.id LIMIT 1;
 IF v_actor_profile_id IS NULL OR v_organization_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization administrator is required';
 END IF;
 IF p_target_profile_id=v_actor_profile_id THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='self scope assignment is not permitted';
 END IF;
 PERFORM 1 FROM public.organizations o WHERE o.id=v_organization_id FOR UPDATE;
 SELECT p.* INTO v_target FROM public.profiles p
 WHERE p.id=p_target_profile_id AND p.organization_id=v_organization_id
   AND p.is_active=true AND p.auth_user_id IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='target profile is outside the active organization or inactive';
 END IF;
 IF p_is_active AND p_scope_kind='warehouse' THEN
  PERFORM 1 FROM public.warehouses w
   WHERE w.id=p_scope_id AND w.organization_id=v_organization_id AND w.is_active=true FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='warehouse is unavailable in this organization'; END IF;
 ELSIF p_is_active AND p_scope_kind='assigned_customer' THEN
  PERFORM 1 FROM public.customers c
   WHERE c.id=p_scope_id AND c.organization_id=v_organization_id FOR KEY SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer is unavailable in this organization'; END IF;
 END IF;
 IF p_scope_kind='warehouse' THEN
  SELECT s.* INTO v_scope FROM public.authorization_profile_scopes s
   WHERE s.organization_id=v_organization_id AND s.profile_id=v_target.id
     AND s.scope_kind='warehouse' AND s.warehouse_id=p_scope_id FOR UPDATE;
 ELSE
  SELECT s.* INTO v_scope FROM public.authorization_profile_scopes s
   WHERE s.organization_id=v_organization_id AND s.profile_id=v_target.id
     AND s.scope_kind='assigned_customer' AND s.customer_id=p_scope_id FOR UPDATE;
 END IF;
 v_found:=FOUND;
 IF NOT v_found THEN
  IF p_expected_revision<>0 THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='scope revision changed; reload assignments before saving';
  END IF;
  IF NOT p_is_active THEN
   RETURN jsonb_build_object('changed',false,'scope_id',NULL,'revision',0,'is_active',false);
  END IF;
  INSERT INTO public.authorization_profile_scopes(
   organization_id,profile_id,scope_kind,warehouse_id,customer_id,reason,is_active,
   valid_from,expires_at,revision,created_by,updated_by
  ) VALUES(
   v_organization_id,v_target.id,p_scope_kind,
   CASE WHEN p_scope_kind='warehouse' THEN p_scope_id ELSE NULL END,
   CASE WHEN p_scope_kind='assigned_customer' THEN p_scope_id ELSE NULL END,
   btrim(p_reason),true,statement_timestamp(),p_expires_at,1,v_actor_profile_id,v_actor_profile_id
  ) RETURNING * INTO v_scope;
  v_previous:=NULL; v_next:=to_jsonb(v_scope);
 ELSE
  IF v_scope.revision<>p_expected_revision THEN
   RAISE EXCEPTION USING ERRCODE='40001',MESSAGE='scope revision changed; reload assignments before saving';
  END IF;
  IF v_scope.is_active=p_is_active AND v_scope.reason=btrim(p_reason)
     AND (NOT p_is_active OR v_scope.expires_at IS NOT DISTINCT FROM p_expires_at) THEN
   RETURN jsonb_build_object('changed',false,'scope_id',v_scope.id,'revision',v_scope.revision,'is_active',v_scope.is_active);
  END IF;
  v_previous:=to_jsonb(v_scope);
  UPDATE public.authorization_profile_scopes
   SET reason=btrim(p_reason),is_active=p_is_active,
       valid_from=CASE WHEN p_is_active THEN statement_timestamp() ELSE valid_from END,
       expires_at=CASE WHEN p_is_active THEN p_expires_at ELSE expires_at END,
       revision=revision+1,updated_by=v_actor_profile_id,updated_at=statement_timestamp()
   WHERE id=v_scope.id RETURNING * INTO v_scope;
  v_next:=to_jsonb(v_scope);
 END IF;
 INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
 VALUES(v_organization_id,v_actor_profile_id,'authorization.scope.assignment.changed',
        'authorization_profile_scope',v_scope.id,v_previous,v_next);
 RETURN jsonb_build_object('changed',true,'scope_id',v_scope.id,'scope_kind',p_scope_kind,
  'scope_resource_id',p_scope_id,'revision',v_scope.revision,'is_active',v_scope.is_active);
END
$function$;
REVOKE ALL ON FUNCTION public.set_authorization_profile_scope(uuid,text,uuid,text,timestamptz,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_authorization_profile_scope(uuid,text,uuid,text,timestamptz,boolean,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_authorization_profile_scopes(p_target_profile_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor_profile_id uuid; v_organization_id uuid; v_target_organization_id uuid; v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_actor_has_capability('identity.roles.assign') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='identity.roles.assign capability required';
 END IF;
 SELECT p.id,p.organization_id INTO v_actor_profile_id,v_organization_id
 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
 WHERE p.auth_user_id=auth.uid() AND p.is_active=true ORDER BY p.created_at,p.id LIMIT 1;
 IF v_actor_profile_id IS NULL OR p_target_profile_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization scope required';
 END IF;
 SELECT p.organization_id INTO v_target_organization_id FROM public.profiles p
 WHERE p.id=p_target_profile_id AND p.is_active=true AND p.auth_user_id IS NOT NULL;
 IF v_target_organization_id IS DISTINCT FROM v_organization_id THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='target profile is outside the active organization';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'scope_id',s.id,'scope_kind',s.scope_kind,
  'scope_resource_id',CASE WHEN s.scope_kind='warehouse' THEN s.warehouse_id ELSE s.customer_id END,
  'warehouse_id',s.warehouse_id,'customer_id',s.customer_id,'reason',s.reason,
  'is_active',s.is_active,'valid_from',s.valid_from,'expires_at',s.expires_at,
  'revision',s.revision,'updated_at',s.updated_at
 ) ORDER BY s.scope_kind,s.created_at,s.id),'[]'::jsonb)
 INTO v_result FROM public.authorization_profile_scopes s
 WHERE s.organization_id=v_organization_id AND s.profile_id=p_target_profile_id;
 RETURN v_result;
END
$function$;
REVOKE ALL ON FUNCTION public.list_authorization_profile_scopes(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_authorization_profile_scopes(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_authorization_decision(p_capability_key text,p_resource_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_actor_profile_id uuid; v_organization_id uuid; v_scope_kind text; v_approval_mode text;
 v_separation_of_duties boolean; v_grant_source text; v_resource_organization_id uuid;
 v_scope_assignment_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Authentication required.');
 END IF;
 IF p_capability_key IS NULL OR btrim(p_capability_key)='' OR p_resource_id IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','A resource and capability are required.');
 END IF;
 SELECT p.id,p.organization_id INTO v_actor_profile_id,v_organization_id
 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
 WHERE p.auth_user_id=auth.uid() AND p.is_active=true AND p.organization_id IS NOT NULL
 ORDER BY p.created_at,p.id LIMIT 1;
 IF v_actor_profile_id IS NULL OR v_organization_id IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','An active organization membership is required.');
 END IF;
 SELECT c.scope_kind,c.approval_mode,c.separation_of_duties INTO v_scope_kind,v_approval_mode,v_separation_of_duties
 FROM public.authorization_capabilities c WHERE c.capability_key=p_capability_key AND c.is_active=true;
 IF NOT FOUND THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Unknown or inactive capability.');
 END IF;
 IF v_scope_kind='organization' THEN RETURN public.current_authorization_decision(p_capability_key); END IF;
 IF EXISTS(
  SELECT 1 FROM public.authorization_profile_denials d
  WHERE d.organization_id=v_organization_id AND d.profile_id=v_actor_profile_id
    AND d.capability_key=p_capability_key AND d.is_active=true
    AND (d.expires_at IS NULL OR d.expires_at>statement_timestamp())
 ) THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,
   'reason','An active explicit denial overrides all role grants.','scope_kind',v_scope_kind,'source','profile_explicit_deny');
 END IF;
 SELECT rc.grant_source,c.approval_mode,c.separation_of_duties
 INTO v_grant_source,v_approval_mode,v_separation_of_duties
 FROM public.authorization_role_capabilities rc
 JOIN public.user_roles ur ON ur.role=rc.role AND ur.profile_id=v_actor_profile_id
 JOIN public.authorization_capabilities c ON c.capability_key=rc.capability_key AND c.is_active=true
 WHERE rc.capability_key=p_capability_key AND rc.valid_from<=statement_timestamp()
   AND (rc.expires_at IS NULL OR rc.expires_at>statement_timestamp())
 ORDER BY rc.role LIMIT 1;
 IF v_grant_source IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,
   'reason','No active role grant exists for this capability.','scope_kind',v_scope_kind);
 END IF;
 IF v_scope_kind='warehouse' THEN
  SELECT w.organization_id INTO v_resource_organization_id FROM public.warehouses w
   WHERE w.id=p_resource_id AND w.is_active=true;
 ELSIF v_scope_kind='assigned_customer' THEN
  SELECT c.organization_id INTO v_resource_organization_id FROM public.customers c WHERE c.id=p_resource_id;
 ELSE
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,
   'reason','This resource relationship scope is not supported by the active server policy.','scope_kind',v_scope_kind);
 END IF;
 IF v_resource_organization_id IS DISTINCT FROM v_organization_id THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,
   'reason','The requested resource is unavailable within the active organization.','scope_kind',v_scope_kind);
 END IF;
 SELECT s.id INTO v_scope_assignment_id FROM public.authorization_profile_scopes s
 WHERE s.organization_id=v_organization_id AND s.profile_id=v_actor_profile_id
   AND s.scope_kind=v_scope_kind AND s.is_active=true AND s.valid_from<=statement_timestamp()
   AND (s.expires_at IS NULL OR s.expires_at>statement_timestamp())
   AND ((v_scope_kind='warehouse' AND s.warehouse_id=p_resource_id)
     OR (v_scope_kind='assigned_customer' AND s.customer_id=p_resource_id))
 ORDER BY s.id LIMIT 1;
 IF v_scope_assignment_id IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,
   'reason','No active assignment grants access to this resource.','scope_kind',v_scope_kind);
 END IF;
 IF v_approval_mode<>'none' THEN
  RETURN jsonb_build_object('decision','REQUIRES_APPROVAL','capability_key',p_capability_key,
   'reason','The capability requires its configured approval workflow.','scope_kind',v_scope_kind,
   'scope_assignment_id',v_scope_assignment_id,'grant_source',v_grant_source,
   'approval_mode',v_approval_mode,'separation_of_duties',v_separation_of_duties);
 END IF;
 RETURN jsonb_build_object('decision','PERMIT','capability_key',p_capability_key,
  'reason','An active role grant and resource assignment satisfy the warehouse/customer scope.',
  'scope_kind',v_scope_kind,'scope_assignment_id',v_scope_assignment_id,'scope_resource_id',p_resource_id,
  'grant_source',v_grant_source,'approval_mode',v_approval_mode,'separation_of_duties',v_separation_of_duties);
END
$function$;
REVOKE ALL ON FUNCTION public.current_authorization_decision(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_authorization_decision(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_actor_has_capability(p_capability_key text,p_resource_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT coalesce(public.current_authorization_decision(p_capability_key,p_resource_id)->>'decision'='PERMIT',false);
$function$;
REVOKE ALL ON FUNCTION public.current_actor_has_capability(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_actor_has_capability(text,uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_inventory_adjustment_capability_v2()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_org uuid;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p
 WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true;
 IF auth.uid() IS NULL OR v_org IS NULL OR NEW.organization_id IS DISTINCT FROM v_org
    OR NOT public.current_actor_has_capability('inventory.balance.adjust',NEW.warehouse_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory.balance.adjust capability and warehouse assignment are required for this stock adjustment';
 END IF;
 RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION public.guard_inventory_adjustment_capability_v2() FROM PUBLIC,anon,authenticated;

DROP POLICY IF EXISTS inventory_adjustments_v2_tenant_read ON public.inventory_adjustments;
CREATE POLICY inventory_adjustments_v2_tenant_read ON public.inventory_adjustments
 FOR SELECT TO authenticated
 USING(organization_id=public.current_organization_id()
       AND public.current_actor_has_capability('inventory.balance.adjust',warehouse_id));

CREATE OR REPLACE FUNCTION public.get_inventory_adjustment_balances(p_warehouse_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_actor uuid:=public.current_profile_id(); v_org uuid; v_items jsonb;
BEGIN
 SELECT p.organization_id INTO v_org FROM public.profiles p
 JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
 WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active=true;
 IF auth.uid() IS NULL OR v_actor IS NULL OR v_org IS NULL
    OR NOT public.current_actor_has_capability('inventory.balance.adjust',p_warehouse_id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='inventory.balance.adjust capability and assigned warehouse are required to read adjustable inventory';
 END IF;
 IF p_warehouse_id IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.warehouses w WHERE w.id=p_warehouse_id AND w.organization_id=v_org AND w.is_active=true
 ) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='warehouse is unavailable in this organization';
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'product_id',p.id,'item_code',p.item_code,'product_name',p.name,'unit',p.unit,
  'warehouse_id',ib.warehouse_id,'quantity_on_hand',ib.quantity_on_hand,
  'quantity_reserved',ib.quantity_reserved,'quantity_available',ib.quantity_available,
  'last_movement_at',ib.last_movement_at,'updated_at',ib.updated_at
 ) ORDER BY p.item_code,p.id),'[]'::jsonb)
 INTO v_items
 FROM public.inventory_balances ib JOIN public.products p
  ON p.id=ib.product_id AND p.organization_id=v_org AND p.status='active'
 WHERE ib.warehouse_id=p_warehouse_id;
 RETURN jsonb_build_object('warehouse_id',p_warehouse_id,'items',coalesce(v_items,'[]'::jsonb));
END
$function$;
REVOKE ALL ON FUNCTION public.get_inventory_adjustment_balances(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_inventory_adjustment_balances(uuid) TO authenticated;
COMMENT ON TABLE public.authorization_profile_scopes IS
 'Private organization membership resource assignments; access is mediated by server-side scope RPCs and decisions.';
COMMENT ON FUNCTION public.current_authorization_decision(text,uuid) IS
 'Evaluates a current role grant against an active same-tenant warehouse/customer assignment. Unsupported scopes fail closed.';
COMMIT;
