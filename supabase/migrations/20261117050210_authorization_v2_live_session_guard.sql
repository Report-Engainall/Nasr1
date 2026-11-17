-- Bind Authorization V2 decisions and mutation to Supabase's central live-session identity.

CREATE OR REPLACE FUNCTION public.current_authorization_decision(p_capability_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_auth_user_id uuid:=auth.uid(); v_profile_id uuid:=public.current_profile_id();
 v_organization_id uuid; v_scope_kind text; v_grant_source text; v_approval_mode text; v_separation_of_duties boolean;
BEGIN
 IF v_auth_user_id IS NULL OR v_profile_id IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','A live authenticated session and active profile are required.');
 END IF;
 IF p_capability_key IS NULL OR pg_catalog.length(pg_catalog.btrim(p_capability_key))=0 THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Capability key is required.');
 END IF;
 SELECT p.organization_id INTO v_organization_id
 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
 WHERE p.id=v_profile_id AND p.auth_user_id=v_auth_user_id AND p.is_active=true AND p.organization_id IS NOT NULL LIMIT 1;
 IF v_organization_id IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','An active organization membership is required.');
 END IF;
 SELECT c.scope_kind INTO v_scope_kind FROM public.authorization_capabilities c
 WHERE c.capability_key=p_capability_key AND c.is_active=true;
 IF NOT FOUND THEN RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Unknown or inactive capability.'); END IF;
 IF EXISTS(SELECT 1 FROM public.authorization_profile_denials d WHERE d.organization_id=v_organization_id AND d.profile_id=v_profile_id
  AND d.capability_key=p_capability_key AND d.is_active=true AND (d.expires_at IS NULL OR d.expires_at>statement_timestamp())) THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','An active explicit denial overrides all role grants.','scope_kind',v_scope_kind,'source','profile_explicit_deny');
 END IF;
 IF v_scope_kind<>'organization' THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','The required branch, warehouse, team, or resource relationship scope is not resolved for this operation.','scope_kind',v_scope_kind);
 END IF;
 IF p_capability_key='catalog.internal_prices.read' AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role='accountant') THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Financial separation policy denies internal product pricing to identities with accountant scope.','scope_kind',v_scope_kind,'source','explicit_role_boundary');
 END IF;
 SELECT rc.grant_source,c.approval_mode,c.separation_of_duties INTO v_grant_source,v_approval_mode,v_separation_of_duties
 FROM public.authorization_role_capabilities rc JOIN public.user_roles ur ON ur.role=rc.role AND ur.profile_id=v_profile_id
 JOIN public.authorization_capabilities c ON c.capability_key=rc.capability_key AND c.is_active=true
 WHERE rc.capability_key=p_capability_key AND rc.valid_from<=statement_timestamp() AND (rc.expires_at IS NULL OR rc.expires_at>statement_timestamp())
 ORDER BY rc.role LIMIT 1;
 IF v_grant_source IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','No active role grant exists for this capability.','scope_kind',v_scope_kind);
 END IF;
 RETURN jsonb_build_object('decision','PERMIT','capability_key',p_capability_key,'reason','An active server-side role grant satisfies the organization scope.',
  'scope_kind',v_scope_kind,'grant_source',v_grant_source,'approval_mode',v_approval_mode,'separation_of_duties',v_separation_of_duties);
END
$function$;
REVOKE ALL ON FUNCTION public.current_authorization_decision(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_authorization_decision(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_authorization_profile_denial(
 p_target_profile_id uuid,p_capability_key text,p_reason text,p_expires_at timestamptz,p_is_active boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_actor_profile_id uuid:=public.current_profile_id(); v_organization_id uuid;
 v_target public.profiles%ROWTYPE; v_existing public.authorization_profile_denials%ROWTYPE;
 v_previous jsonb; v_next jsonb; v_had_existing boolean:=false; v_changed boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR v_actor_profile_id IS NULL OR NOT public.current_actor_has_capability('identity.roles.assign') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='live administrator session with identity.roles.assign required';
 END IF;
 IF p_target_profile_id IS NULL OR p_capability_key IS NULL OR pg_catalog.btrim(p_capability_key)='' THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='target profile and capability are required'; END IF;
 IF p_is_active AND (p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason))<5) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='an explicit denial reason of at least five characters is required'; END IF;
 IF p_expires_at IS NOT NULL AND p_expires_at<=statement_timestamp() THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='denial expiry must be in the future'; END IF;
 SELECT p.organization_id INTO v_organization_id FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
 WHERE p.id=v_actor_profile_id AND p.auth_user_id=auth.uid() AND p.is_active=true LIMIT 1;
 IF v_organization_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization administrator is required'; END IF;
 PERFORM 1 FROM public.organizations o WHERE o.id=v_organization_id FOR UPDATE;
 SELECT p.* INTO v_target FROM public.profiles p WHERE p.id=p_target_profile_id AND p.organization_id=v_organization_id AND p.is_active=true AND p.auth_user_id IS NOT NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='target profile is outside the active organization or inactive'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.authorization_capabilities c WHERE c.capability_key=p_capability_key AND c.is_active=true) THEN RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unknown or inactive capability'; END IF;
 SELECT d.* INTO v_existing FROM public.authorization_profile_denials d WHERE d.organization_id=v_organization_id AND d.profile_id=v_target.id AND d.capability_key=p_capability_key FOR UPDATE;
 v_had_existing:=FOUND;
 IF p_is_active AND p_capability_key='identity.roles.assign'
  AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_target.id AND r.role='admin')
  AND NOT EXISTS(SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id AND r.role='admin'
   WHERE p.organization_id=v_organization_id AND p.is_active=true AND p.auth_user_id IS NOT NULL AND p.id<>v_target.id) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='cannot deny role assignment to the last active organization administrator';
 END IF;
 IF p_is_active THEN
  IF v_had_existing AND v_existing.is_active AND v_existing.reason=pg_catalog.btrim(p_reason) AND v_existing.expires_at IS NOT DISTINCT FROM p_expires_at THEN
   RETURN jsonb_build_object('changed',false,'denial_id',v_existing.id,'is_active',true);
  END IF;
  IF v_had_existing THEN
   UPDATE public.authorization_profile_denials SET reason=pg_catalog.btrim(p_reason),is_active=true,expires_at=p_expires_at,updated_by=v_actor_profile_id,updated_at=statement_timestamp() WHERE id=v_existing.id;
  ELSE
   INSERT INTO public.authorization_profile_denials(organization_id,profile_id,capability_key,reason,is_active,expires_at,created_by,updated_by)
   VALUES(v_organization_id,v_target.id,p_capability_key,pg_catalog.btrim(p_reason),true,p_expires_at,v_actor_profile_id,v_actor_profile_id) RETURNING * INTO v_existing;
  END IF;
  v_changed:=true;
 ELSE
  IF NOT v_had_existing OR NOT v_existing.is_active THEN RETURN jsonb_build_object('changed',false,'denial_id',CASE WHEN v_had_existing THEN v_existing.id ELSE NULL END,'is_active',false); END IF;
  UPDATE public.authorization_profile_denials SET is_active=false,updated_by=v_actor_profile_id,updated_at=statement_timestamp() WHERE id=v_existing.id;
  v_changed:=true;
 END IF;
 v_previous:=CASE WHEN v_had_existing THEN jsonb_build_object('is_active',v_existing.is_active,'reason',v_existing.reason,'expires_at',v_existing.expires_at) ELSE NULL END;
 v_next:=jsonb_build_object('is_active',p_is_active,'reason',CASE WHEN p_is_active THEN pg_catalog.btrim(p_reason) ELSE v_existing.reason END,'expires_at',CASE WHEN p_is_active THEN p_expires_at ELSE v_existing.expires_at END);
 IF v_changed THEN
  INSERT INTO public.audit_logs(organization_id,actor_id,action,entity_type,entity_id,old_value,new_value)
  VALUES(v_organization_id,v_actor_profile_id,'authorization.capability.explicit_deny.changed','profile_capability_denial',v_existing.id,v_previous,v_next);
 END IF;
 RETURN jsonb_build_object('changed',v_changed,'denial_id',v_existing.id,'is_active',p_is_active);
END
$function$;
REVOKE ALL ON FUNCTION public.set_authorization_profile_denial(uuid,text,text,timestamptz,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.set_authorization_profile_denial(uuid,text,text,timestamptz,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_current_tenant_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile_id uuid:=public.current_profile_id(); v_organization_id uuid; v_warehouse_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='28000',MESSAGE='Authentication required'; END IF;
 IF v_profile_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='A live authenticated session and active profile are required'; END IF;
 SELECT p.organization_id INTO v_organization_id FROM public.profiles p WHERE p.id=v_profile_id AND p.auth_user_id=auth.uid() AND p.is_active=true LIMIT 1;
 IF v_organization_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='The profile has no organization scope'; END IF;
 SELECT w.id INTO v_warehouse_id FROM public.warehouses w WHERE w.organization_id=v_organization_id AND w.is_active=true ORDER BY w.created_at ASC,w.id ASC LIMIT 1;
 RETURN jsonb_build_object('profile_id',v_profile_id,'organization_id',v_organization_id,'warehouse_id',v_warehouse_id,
  'is_staff',EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','staff')),
  'can_manage_customers',EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','customer_manager')),
  'can_view_internal_product_prices',public.current_actor_has_capability('catalog.internal_prices.read'));
END
$function$;
REVOKE ALL ON FUNCTION public.get_current_tenant_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_context() TO authenticated;
