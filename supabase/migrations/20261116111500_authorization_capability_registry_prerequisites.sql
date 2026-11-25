-- Authorization V2 registry prerequisites.
-- These tables are consumed by the 20261116112000/16113000 migrations, while the
-- canonical registry population/function migration is intentionally later.
-- Keep this bootstrap schema identical to the canonical IF NOT EXISTS definitions
-- so a fresh local/test database can apply the chronological migration chain.
BEGIN;

CREATE TABLE IF NOT EXISTS public.authorization_capabilities (
  capability_key text PRIMARY KEY,
  domain text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  sensitivity text NOT NULL CHECK (sensitivity IN (
    'public','commercial','catalog','inventory','customer','financial',
    'identity','operational','data','audit'
  )),
  scope_kind text NOT NULL CHECK (scope_kind IN (
    'organization','branch','warehouse','team','assigned_customer','resource_owner'
  )),
  approval_mode text NOT NULL DEFAULT 'none' CHECK (
    approval_mode IN ('none','approval_required','maker_checker')
  ),
  separation_of_duties boolean NOT NULL DEFAULT false,
  state_requirements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(state_requirements)='object'
  ),
  legacy_operation_id text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS public.authorization_role_capabilities (
  role text NOT NULL CHECK (
    role IN ('admin','manager','staff','accountant','customer_manager','customer')
  ),
  capability_key text NOT NULL
    REFERENCES public.authorization_capabilities(capability_key) ON DELETE RESTRICT,
  grant_source text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (role,capability_key),
  CHECK (expires_at IS NULL OR expires_at>valid_from)
);

CREATE TABLE IF NOT EXISTS public.authorization_profile_denials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  capability_key text NOT NULL
    REFERENCES public.authorization_capabilities(capability_key) ON DELETE RESTRICT,
  reason text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  UNIQUE (organization_id,profile_id,capability_key),
  CHECK (expires_at IS NULL OR expires_at>created_at)
);

CREATE INDEX IF NOT EXISTS authorization_profile_denials_active_lookup
  ON public.authorization_profile_denials(organization_id,profile_id,capability_key)
  WHERE is_active=true;

ALTER TABLE public.authorization_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_profile_denials ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.authorization_capabilities FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.authorization_role_capabilities FROM PUBLIC,anon,authenticated;
REVOKE ALL ON TABLE public.authorization_profile_denials FROM PUBLIC,anon,authenticated;

-- Earlier Authorization V2 migrations create policies/triggers that reference
-- this helper before the canonical registry migration defines its real body.
-- Add a fail-closed bootstrap only on a fresh database; never replace an
-- existing implementation on a database that has already applied the later
-- canonical migration. The canonical migration will CREATE OR REPLACE it later.
DO $bootstrap$
BEGIN
  IF pg_catalog.to_regprocedure('public.current_actor_has_capability(text)') IS NULL THEN
    EXECUTE $ddl$
      CREATE FUNCTION public.current_actor_has_capability(p_capability_key text)
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = ''
      AS $function$ SELECT false; $function$
    $ddl$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.current_actor_has_capability(text) FROM PUBLIC,anon,authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.current_actor_has_capability(text) TO authenticated';
  END IF;
END
$bootstrap$;

-- Seed the complete canonical capability catalog before any of the earlier
-- Authorization V2 consumers run. These statements are copied from the
-- canonical 20261117050202 migration: that later migration safely re-applies
-- them with the same ON CONFLICT behavior and then installs the real decision
-- functions. This avoids partial capability catalogs and preserves exact
-- role grants across fresh PostgreSQL 17 replays.

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
-- Preserve any capability already configured more narrowly or deliberately disabled.
ON CONFLICT(capability_key) DO NOTHING;

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

COMMIT;
