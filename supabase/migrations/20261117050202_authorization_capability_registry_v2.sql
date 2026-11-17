-- Authorization V2: database capability registry, legacy grant parity, and explicit denies.

CREATE TABLE IF NOT EXISTS public.authorization_capabilities (
 capability_key text PRIMARY KEY, domain text NOT NULL, resource text NOT NULL, action text NOT NULL,
 sensitivity text NOT NULL CHECK(sensitivity IN ('public','commercial','catalog','inventory','customer','financial','identity','operational','data','audit')),
 scope_kind text NOT NULL CHECK(scope_kind IN ('organization','branch','warehouse','team','assigned_customer','resource_owner')),
 approval_mode text NOT NULL DEFAULT 'none' CHECK(approval_mode IN ('none','approval_required','maker_checker')),
 separation_of_duties boolean NOT NULL DEFAULT false,
 state_requirements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(state_requirements)='object'),
 legacy_operation_id text UNIQUE, is_active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS public.authorization_role_capabilities (
 role text NOT NULL CHECK(role IN ('admin','manager','staff','accountant','customer_manager','customer')),
 capability_key text NOT NULL REFERENCES public.authorization_capabilities(capability_key) ON DELETE RESTRICT,
 grant_source text NOT NULL, valid_from timestamptz NOT NULL DEFAULT statement_timestamp(),
 expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 PRIMARY KEY(role,capability_key), CHECK(expires_at IS NULL OR expires_at>valid_from)
);

CREATE TABLE IF NOT EXISTS public.authorization_profile_denials (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
 profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 capability_key text NOT NULL REFERENCES public.authorization_capabilities(capability_key) ON DELETE RESTRICT,
 reason text NOT NULL, is_active boolean NOT NULL DEFAULT true, expires_at timestamptz,
 created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE(organization_id,profile_id,capability_key),
 CHECK(expires_at IS NULL OR expires_at>created_at)
);
CREATE INDEX IF NOT EXISTS authorization_profile_denials_active_lookup
 ON public.authorization_profile_denials(organization_id,profile_id,capability_key) WHERE is_active=true;

ALTER TABLE public.authorization_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_profile_denials ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.authorization_capabilities FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.authorization_role_capabilities FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.authorization_profile_denials FROM PUBLIC,anon,authenticated;

INSERT INTO public.authorization_capabilities
(capability_key,domain,resource,action,sensitivity,scope_kind,approval_mode,separation_of_duties,state_requirements,legacy_operation_id)
VALUES
('pricing.edit_draft','pricing','pricing_rule','edit_draft','commercial','organization','none',false,'{"required_status":"draft"}','pricing_rules_write'),
('pricing.propose','pricing','pricing_rule','propose','commercial','organization','approval_required',false,'{"creates_status":"pending_approval"}','pricing_rule_submit'),
('pricing.approve','pricing','pricing_rule','approve','commercial','organization','maker_checker',true,'{"required_status":"pending_approval"}','pricing_rules_approve'),
('catalog.product.lifecycle','catalog','product','archive_or_restore','catalog','organization','none',false,'{"preserve_history":true}','product_lifecycle'),
('inventory.reorder_point.write','inventory','inventory_policy','change_reorder_point','inventory','organization','none',false,'{"requires_reason":true}','inventory_reorder_point'),
('inventory.transfer.create','inventory','inventory_transfer','create','inventory','organization','approval_required',false,'{"requires_available_quantity":true}','inventory_transfer'),
('inventory.count.enter','inventory','stock_count','enter_count','inventory','organization','approval_required',false,'{"writes_draft_only":true}','stock_count_edit'),
('inventory.count.finalize','inventory','stock_count','finalize','inventory','organization','maker_checker',true,'{"requires_review":true}','stock_count_finalize'),
('customers.lifecycle.write','customers','customer','change_lifecycle','customer','organization','none',false,'{"requires_reason":true}','customer_lifecycle'),
('customers.account.activate','customers','customer_account','activate_or_invite','identity','organization','approval_required',false,'{"requires_approved_customer":true}','customer_activation'),
('customers.read_financial','customers','customer_financial_profile','read','financial','organization','none',false,'{}','customer_360'),
('imports.batch.stage','imports','import_batch','stage','data','organization','none',false,'{"does_not_publish":true}','imports_stage'),
('imports.batch.publish','imports','import_batch','publish','data','organization','maker_checker',true,'{"requires_complete_manifest":true}','imports_finalize'),
('purchasing.orders.manage','purchasing','purchase_order','manage_and_receive','financial','organization','approval_required',false,'{"receipt_is_separate":true}','purchase_orders_manage'),
('operations.task.status.write','operations','operational_task','update_status','operational','organization','none',false,'{"requires_assignment_or_route":true}','operational_task_status'),
('finance.workspace.manage','finance','finance_workspace','manage_invoice_and_collection','financial','organization','none',false,'{}','finance_manage'),
('identity.roles.assign','identity','organization_membership','assign_role','identity','organization','maker_checker',true,'{"cannot_change_self":true,"protect_last_admin":true}','role_assignment'),
('audit.intelligence.read','audit','audit_and_intelligence','read','audit','organization','none',false,'{"read_only":true}','audit_intelligence'),
('catalog.internal_prices.read','catalog','product_financial_fields','read','financial','organization','none',false,'{"deny_if_accountant_role_present":true}',NULL),
('customers.read_basic','customers','customer','read_basic','customer','assigned_customer','none',false,'{"requires_assignment":true}',NULL),
('customers.approve','customers','customer','approve','identity','organization','maker_checker',true,'{"required_status":"pending_approval"}',NULL),
('customers.assign','customers','customer_assignment','assign','customer','team','none',false,'{"requires_active_team":true}',NULL),
('orders.read','orders','sales_order','read','commercial','assigned_customer','none',false,'{"requires_customer_relation":true}',NULL),
('orders.create_draft','orders','sales_order','create_draft','commercial','branch','none',false,'{"creates_status":"draft"}',NULL),
('orders.submit','orders','sales_order','submit','commercial','branch','approval_required',false,'{"required_status":"draft"}',NULL),
('orders.approve','orders','sales_order','approve','financial','branch','maker_checker',true,'{"required_status":"pending_approval"}',NULL),
('orders.cancel','orders','sales_order','cancel','financial','branch','maker_checker',true,'{"requires_reason":true}',NULL),
('pricing.read_list','pricing','price_list','read','commercial','organization','none',false,'{}',NULL),
('pricing.publish','pricing','price_list','publish','financial','organization','maker_checker',true,'{"requires_approved_version":true}',NULL),
('inventory.read_balance','inventory','stock_balance','read','inventory','warehouse','none',false,'{"requires_warehouse_assignment":true}',NULL),
('inventory.count.start','inventory','stock_count','start','inventory','warehouse','none',false,'{"requires_warehouse_assignment":true}',NULL),
('inventory.count.review','inventory','stock_count','review','inventory','warehouse','maker_checker',true,'{"reviewer_must_differ_from_counter":true}',NULL),
('inventory.transfer.receive','inventory','inventory_transfer','receive','inventory','warehouse','maker_checker',true,'{"receiver_must_be_destination_warehouse_member":true}',NULL),
('finance.invoice.read','finance','invoice','read','financial','organization','none',false,'{}',NULL),
('finance.payment.record','finance','payment','record','financial','organization','approval_required',false,'{"requires_source_document":true}',NULL),
('finance.journal.create_draft','finance','journal_entry','create_draft','financial','organization','none',false,'{"creates_status":"draft"}',NULL),
('finance.journal.post','finance','journal_entry','post','financial','organization','maker_checker',true,'{"required_status":"draft"}',NULL),
('finance.journal.reverse','finance','journal_entry','reverse','financial','organization','maker_checker',true,'{"requires_posted_source_and_reason":true}',NULL)
ON CONFLICT(capability_key) DO UPDATE SET
 domain=EXCLUDED.domain,resource=EXCLUDED.resource,action=EXCLUDED.action,sensitivity=EXCLUDED.sensitivity,
 scope_kind=EXCLUDED.scope_kind,approval_mode=EXCLUDED.approval_mode,
 separation_of_duties=EXCLUDED.separation_of_duties,state_requirements=EXCLUDED.state_requirements,
 legacy_operation_id=EXCLUDED.legacy_operation_id,is_active=true,updated_at=statement_timestamp();

INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source) VALUES
('admin','pricing.edit_draft','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','pricing.edit_draft','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','pricing.propose','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','pricing.propose','legacy-role-parity:ADMIN_OPERATION_RULES'),('staff','pricing.propose','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','pricing.approve','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','pricing.approve','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','catalog.product.lifecycle','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','catalog.product.lifecycle','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','inventory.reorder_point.write','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','inventory.reorder_point.write','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','inventory.transfer.create','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','inventory.transfer.create','legacy-role-parity:ADMIN_OPERATION_RULES'),('staff','inventory.transfer.create','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','inventory.count.enter','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','inventory.count.enter','legacy-role-parity:ADMIN_OPERATION_RULES'),('staff','inventory.count.enter','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','inventory.count.finalize','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','inventory.count.finalize','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','customers.lifecycle.write','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','customers.lifecycle.write','legacy-role-parity:ADMIN_OPERATION_RULES'),('customer_manager','customers.lifecycle.write','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','customers.account.activate','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','customers.account.activate','legacy-role-parity:ADMIN_OPERATION_RULES'),('staff','customers.account.activate','legacy-role-parity:ADMIN_OPERATION_RULES'),('customer_manager','customers.account.activate','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','customers.read_financial','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','customers.read_financial','legacy-role-parity:ADMIN_OPERATION_RULES'),('accountant','customers.read_financial','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','imports.batch.stage','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','imports.batch.stage','legacy-role-parity:ADMIN_OPERATION_RULES'),('staff','imports.batch.stage','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','imports.batch.publish','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','imports.batch.publish','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','purchasing.orders.manage','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','purchasing.orders.manage','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','operations.task.status.write','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','operations.task.status.write','legacy-role-parity:ADMIN_OPERATION_RULES'),('staff','operations.task.status.write','legacy-role-parity:ADMIN_OPERATION_RULES'),('accountant','operations.task.status.write','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','finance.workspace.manage','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','finance.workspace.manage','legacy-role-parity:ADMIN_OPERATION_RULES'),('accountant','finance.workspace.manage','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','identity.roles.assign','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','audit.intelligence.read','legacy-role-parity:ADMIN_OPERATION_RULES'),('manager','audit.intelligence.read','legacy-role-parity:ADMIN_OPERATION_RULES'),
('admin','catalog.internal_prices.read','server-boundary:staff-product-financial-projection'),('manager','catalog.internal_prices.read','server-boundary:staff-product-financial-projection')
ON CONFLICT(role,capability_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.current_authorization_decision(p_capability_key text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_auth_user_id uuid:=auth.uid(); v_profile_id uuid; v_organization_id uuid; v_scope_kind text;
 v_grant_source text; v_approval_mode text; v_separation_of_duties boolean;
BEGIN
 IF v_auth_user_id IS NULL THEN RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Authentication required.'); END IF;
 IF p_capability_key IS NULL OR pg_catalog.length(pg_catalog.btrim(p_capability_key))=0 THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Capability key is required.');
 END IF;
 SELECT p.id,p.organization_id INTO v_profile_id,v_organization_id
 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
 WHERE p.auth_user_id=v_auth_user_id AND p.is_active=true AND p.organization_id IS NOT NULL
 ORDER BY p.created_at,p.id LIMIT 1;
 IF v_profile_id IS NULL OR v_organization_id IS NULL THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','An active organization membership is required.');
 END IF;
 SELECT c.scope_kind INTO v_scope_kind FROM public.authorization_capabilities c
 WHERE c.capability_key=p_capability_key AND c.is_active=true;
 IF NOT FOUND THEN RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Unknown or inactive capability.'); END IF;
 IF EXISTS (
  SELECT 1 FROM public.authorization_profile_denials d
  WHERE d.organization_id=v_organization_id AND d.profile_id=v_profile_id AND d.capability_key=p_capability_key
    AND d.is_active=true AND (d.expires_at IS NULL OR d.expires_at>statement_timestamp())
 ) THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','An active explicit denial overrides all role grants.','scope_kind',v_scope_kind,'source','profile_explicit_deny');
 END IF;
 IF v_scope_kind<>'organization' THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','The required branch, warehouse, team, or resource relationship scope is not resolved for this operation.','scope_kind',v_scope_kind);
 END IF;
 IF p_capability_key='catalog.internal_prices.read' AND EXISTS (
  SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role='accountant'
 ) THEN
  RETURN jsonb_build_object('decision','DENY','capability_key',p_capability_key,'reason','Financial separation policy denies internal product pricing to identities with accountant scope.','scope_kind',v_scope_kind,'source','explicit_role_boundary');
 END IF;
 SELECT rc.grant_source,c.approval_mode,c.separation_of_duties
 INTO v_grant_source,v_approval_mode,v_separation_of_duties
 FROM public.authorization_role_capabilities rc
 JOIN public.user_roles ur ON ur.role=rc.role AND ur.profile_id=v_profile_id
 JOIN public.authorization_capabilities c ON c.capability_key=rc.capability_key AND c.is_active=true
 WHERE rc.capability_key=p_capability_key AND rc.valid_from<=statement_timestamp()
   AND (rc.expires_at IS NULL OR rc.expires_at>statement_timestamp())
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

CREATE OR REPLACE FUNCTION public.current_actor_has_capability(p_capability_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT COALESCE(public.current_authorization_decision(p_capability_key)->>'decision'='PERMIT',false);
$function$;
REVOKE ALL ON FUNCTION public.current_actor_has_capability(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_actor_has_capability(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_manage_user_roles()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $function$
 SELECT public.current_actor_has_capability('identity.roles.assign');
$function$;
REVOKE ALL ON FUNCTION public.can_manage_user_roles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_manage_user_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.list_authorization_capability_registry()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_actor_has_capability('identity.roles.assign') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='identity.roles.assign capability required';
 END IF;
 SELECT COALESCE(jsonb_agg(entry ORDER BY entry->>'capability_key'),'[]'::jsonb) INTO v_result
 FROM (
  SELECT jsonb_build_object('capability_key',c.capability_key,'domain',c.domain,'resource',c.resource,'action',c.action,
   'sensitivity',c.sensitivity,'scope_kind',c.scope_kind,'approval_mode',c.approval_mode,
   'separation_of_duties',c.separation_of_duties,'state_requirements',c.state_requirements,
   'legacy_operation_id',c.legacy_operation_id,'is_active',c.is_active,
   'role_grants',COALESCE((SELECT jsonb_agg(jsonb_build_object('role',rc.role,'grant_source',rc.grant_source,
    'valid_from',rc.valid_from,'expires_at',rc.expires_at) ORDER BY rc.role)
    FROM public.authorization_role_capabilities rc WHERE rc.capability_key=c.capability_key),'[]'::jsonb)) AS entry
  FROM public.authorization_capabilities c
 ) catalog;
 RETURN v_result;
END
$function$;
REVOKE ALL ON FUNCTION public.list_authorization_capability_registry() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_authorization_capability_registry() TO authenticated;

CREATE OR REPLACE FUNCTION public.set_authorization_profile_denial(
 p_target_profile_id uuid,p_capability_key text,p_reason text,p_expires_at timestamptz,p_is_active boolean
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
 v_actor_profile_id uuid; v_organization_id uuid; v_target public.profiles%ROWTYPE;
 v_existing public.authorization_profile_denials%ROWTYPE; v_previous jsonb; v_next jsonb;
 v_had_existing boolean:=false; v_changed boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_actor_has_capability('identity.roles.assign') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='identity.roles.assign capability required';
 END IF;
 IF p_target_profile_id IS NULL OR p_capability_key IS NULL OR pg_catalog.btrim(p_capability_key)='' THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='target profile and capability are required';
 END IF;
 IF p_is_active AND (p_reason IS NULL OR pg_catalog.length(pg_catalog.btrim(p_reason))<5) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='an explicit denial reason of at least five characters is required';
 END IF;
 IF p_expires_at IS NOT NULL AND p_expires_at<=statement_timestamp() THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='denial expiry must be in the future';
 END IF;
 SELECT p.id,p.organization_id INTO v_actor_profile_id,v_organization_id
 FROM public.profiles p JOIN public.organizations o ON o.id=p.organization_id AND o.is_active=true
 WHERE p.auth_user_id=auth.uid() AND p.is_active=true LIMIT 1;
 IF v_actor_profile_id IS NULL OR v_organization_id IS NULL THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization administrator is required';
 END IF;
 PERFORM 1 FROM public.organizations o WHERE o.id=v_organization_id FOR UPDATE;
 SELECT p.* INTO v_target FROM public.profiles p
 WHERE p.id=p_target_profile_id AND p.organization_id=v_organization_id AND p.is_active=true AND p.auth_user_id IS NOT NULL
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='target profile is outside the active organization or inactive'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.authorization_capabilities c WHERE c.capability_key=p_capability_key AND c.is_active=true) THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='unknown or inactive capability';
 END IF;
 SELECT d.* INTO v_existing FROM public.authorization_profile_denials d
 WHERE d.organization_id=v_organization_id AND d.profile_id=v_target.id AND d.capability_key=p_capability_key FOR UPDATE;
 v_had_existing:=FOUND;
 IF p_is_active AND p_capability_key='identity.roles.assign'
    AND EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_target.id AND r.role='admin')
    AND NOT EXISTS(
     SELECT 1 FROM public.profiles p JOIN public.user_roles r ON r.profile_id=p.id AND r.role='admin'
     WHERE p.organization_id=v_organization_id AND p.is_active=true AND p.auth_user_id IS NOT NULL AND p.id<>v_target.id
    ) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='cannot deny role assignment to the last active organization administrator';
 END IF;
 IF p_is_active THEN
  IF v_had_existing AND v_existing.is_active AND v_existing.reason=pg_catalog.btrim(p_reason)
     AND v_existing.expires_at IS NOT DISTINCT FROM p_expires_at THEN
   RETURN jsonb_build_object('changed',false,'denial_id',v_existing.id,'is_active',true);
  END IF;
  IF v_had_existing THEN
   UPDATE public.authorization_profile_denials SET reason=pg_catalog.btrim(p_reason),is_active=true,
    expires_at=p_expires_at,updated_by=v_actor_profile_id,updated_at=statement_timestamp() WHERE id=v_existing.id;
  ELSE
   INSERT INTO public.authorization_profile_denials(organization_id,profile_id,capability_key,reason,is_active,expires_at,created_by,updated_by)
   VALUES(v_organization_id,v_target.id,p_capability_key,pg_catalog.btrim(p_reason),true,p_expires_at,v_actor_profile_id,v_actor_profile_id)
   RETURNING * INTO v_existing;
  END IF;
  v_changed:=true;
 ELSE
  IF NOT v_had_existing OR NOT v_existing.is_active THEN
   RETURN jsonb_build_object('changed',false,'denial_id',CASE WHEN v_had_existing THEN v_existing.id ELSE NULL END,'is_active',false);
  END IF;
  UPDATE public.authorization_profile_denials SET is_active=false,updated_by=v_actor_profile_id,
   updated_at=statement_timestamp() WHERE id=v_existing.id;
  v_changed:=true;
 END IF;
 v_previous:=CASE WHEN v_had_existing THEN jsonb_build_object('is_active',v_existing.is_active,'reason',v_existing.reason,'expires_at',v_existing.expires_at) ELSE NULL END;
 v_next:=jsonb_build_object('is_active',p_is_active,'reason',CASE WHEN p_is_active THEN pg_catalog.btrim(p_reason) ELSE v_existing.reason END,
  'expires_at',CASE WHEN p_is_active THEN p_expires_at ELSE v_existing.expires_at END);
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
DECLARE v_profile_id uuid; v_organization_id uuid; v_warehouse_id uuid;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='28000',MESSAGE='Authentication required'; END IF;
 SELECT p.id,p.organization_id INTO v_profile_id,v_organization_id
 FROM public.profiles p WHERE p.auth_user_id=auth.uid() AND p.is_active=true LIMIT 1;
 IF v_profile_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='An active profile is required'; END IF;
 IF v_organization_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='The profile has no organization scope'; END IF;
 SELECT w.id INTO v_warehouse_id FROM public.warehouses w WHERE w.organization_id=v_organization_id AND w.is_active=true
 ORDER BY w.created_at ASC,w.id ASC LIMIT 1;
 RETURN jsonb_build_object('profile_id',v_profile_id,'organization_id',v_organization_id,'warehouse_id',v_warehouse_id,
  'is_staff',EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','staff')),
  'can_manage_customers',EXISTS(SELECT 1 FROM public.user_roles r WHERE r.profile_id=v_profile_id AND r.role IN ('admin','manager','customer_manager')),
  'can_view_internal_product_prices',public.current_actor_has_capability('catalog.internal_prices.read'));
END
$function$;
REVOKE ALL ON FUNCTION public.get_current_tenant_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_current_tenant_context() TO authenticated;

CREATE OR REPLACE FUNCTION public.fetch_staff_products(p_product_id uuid DEFAULT NULL)
RETURNS SETOF public.products LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_organization_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.current_actor_has_capability('catalog.internal_prices.read') THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='catalog.internal_prices.read capability required';
 END IF;
 SELECT p.organization_id INTO v_organization_id FROM public.profiles p
 WHERE p.id=public.current_profile_id() AND p.auth_user_id=auth.uid() AND p.is_active=true AND p.organization_id IS NOT NULL LIMIT 1;
 IF v_organization_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active organization membership required for product details'; END IF;
 RETURN QUERY SELECT p.* FROM public.products p WHERE p.organization_id=v_organization_id
  AND (p_product_id IS NULL OR p.id=p_product_id) ORDER BY p.name,p.id;
END
$function$;
REVOKE ALL ON FUNCTION public.fetch_staff_products(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_products(uuid) TO authenticated;
COMMENT ON FUNCTION public.fetch_staff_products(uuid) IS
 'Full product financial projection requires the server-authoritative catalog.internal_prices.read capability.';

CREATE OR REPLACE FUNCTION public.get_storefront_product_prices(p_product_ids uuid[],p_quantity numeric DEFAULT 1)
RETURNS TABLE(product_id uuid,unit_price numeric(15,2))
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE v_profile_id uuid; v_organization_id uuid; v_customer_id uuid;
 v_tier text:='retail'; v_customer_status text; v_is_staff boolean:=false; v_show_price boolean:=true;
BEGIN
 IF p_product_ids IS NULL OR pg_catalog.cardinality(p_product_ids)=0 THEN RETURN; END IF;
 IF pg_catalog.cardinality(p_product_ids)>500 OR pg_catalog.array_position(p_product_ids,NULL::uuid) IS NOT NULL THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='product batch must contain at most 500 non-null ids';
 END IF;
 IF p_quantity IS NULL OR p_quantity::text IN ('NaN','Infinity','-Infinity') OR p_quantity<>pg_catalog.trunc(p_quantity) OR p_quantity<1 OR p_quantity>10000 THEN
  RAISE EXCEPTION USING ERRCODE='22023',MESSAGE='price quantity must be an integer between 1 and 10000';
 END IF;
 IF auth.uid() IS NULL THEN v_organization_id:=public.public_storefront_organization_id();
 ELSE
  v_profile_id:=public.current_profile_id();
  IF v_profile_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active profile and organization required to resolve catalog prices'; END IF;
  SELECT p.organization_id INTO v_organization_id FROM public.profiles p
  WHERE p.id=v_profile_id AND p.auth_user_id=auth.uid() AND p.is_active=true;
  IF v_organization_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active profile and organization required to resolve catalog prices'; END IF;
  v_is_staff:=public.current_actor_has_capability('catalog.internal_prices.read');
  IF NOT v_is_staff THEN
   v_customer_id:=public.current_customer_id();
   IF v_customer_id IS NULL OR NOT public.current_customer_can('catalog.read') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='customer membership lacks permission to resolve catalog prices';
   END IF;
   SELECT c.status,c.tier INTO v_customer_status,v_tier FROM public.customers c
   WHERE c.id=v_customer_id AND c.organization_id=v_organization_id;
   IF NOT FOUND OR v_customer_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='approved customer required to resolve catalog prices';
   END IF;
   v_tier:=COALESCE(NULLIF(v_tier,''),'retail');
  END IF;
 END IF;
 IF v_organization_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.organizations o WHERE o.id=v_organization_id AND o.is_active=true) THEN
  RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='active storefront organization is required';
 END IF;
 SELECT CASE WHEN pg_catalog.jsonb_typeof(s.value)='boolean' THEN (s.value #>> '{}')::boolean ELSE true END
 INTO v_show_price FROM public.admin_settings s WHERE s.organization_id=v_organization_id AND s.key='show_price_on_cards';
 v_show_price:=COALESCE(v_show_price,true);
 IF NOT v_is_staff AND NOT v_show_price THEN
  RETURN QUERY SELECT p.id,0::numeric(15,2) FROM public.products p
  WHERE p.id=ANY(p_product_ids) AND p.organization_id=v_organization_id AND p.status='active' ORDER BY p.id;
  RETURN;
 END IF;
 RETURN QUERY SELECT p.id,
  CASE WHEN v_is_staff THEN pg_catalog.round(p.base_price,2)
   ELSE (SELECT resolved.net_unit_price FROM public.resolve_active_promotion_price(
     p.id,v_organization_id,public.customer_product_unit_price(p.id,v_organization_id,v_tier,p_quantity)
   ) AS resolved)
  END::numeric(15,2)
 FROM public.products p WHERE p.id=ANY(p_product_ids) AND p.organization_id=v_organization_id AND p.status='active' ORDER BY p.id;
END
$function$;
REVOKE ALL ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) TO anon,authenticated;
COMMENT ON FUNCTION public.get_storefront_product_prices(uuid[],numeric) IS
 'Returns approved customer tier prices; internal base price requires catalog.internal_prices.read.';
