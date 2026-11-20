-- Bootstrap the Authorization V2 registry before timestamp-ordered consumers.
--
-- Several 2026-11-16 migrations write capability metadata and create policies
-- before the full registry migration (2026-11-17). Keep the prerequisite schema
-- private and fail closed until that authoritative migration installs its
-- role-parity seed and real decision functions.
--
-- Only the prerequisite definitions/grants consumed by earlier timestamped migrations are seeded here.
-- The authoritative registry remains 20261117050202_authorization_capability_registry_v2.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.authorization_capabilities (
  capability_key text PRIMARY KEY,
  domain text NOT NULL,
  resource text NOT NULL,
  action text NOT NULL,
  sensitivity text NOT NULL CHECK (
    sensitivity IN ('public','commercial','catalog','inventory','customer','financial','identity','operational','data','audit')
  ),
  scope_kind text NOT NULL CHECK (
    scope_kind IN ('organization','branch','warehouse','team','assigned_customer','resource_owner')
  ),
  approval_mode text NOT NULL DEFAULT 'none' CHECK (
    approval_mode IN ('none','approval_required','maker_checker')
  ),
  separation_of_duties boolean NOT NULL DEFAULT false,
  state_requirements jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(state_requirements)='object'),
  legacy_operation_id text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT statement_timestamp()
);

CREATE TABLE IF NOT EXISTS public.authorization_role_capabilities (
  role text NOT NULL CHECK (role IN ('admin','manager','staff','accountant','customer_manager','customer')),
  capability_key text NOT NULL REFERENCES public.authorization_capabilities(capability_key) ON DELETE RESTRICT,
  grant_source text NOT NULL,
  valid_from timestamptz NOT NULL DEFAULT statement_timestamp(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (role,capability_key),
  CHECK (expires_at IS NULL OR expires_at>valid_from)
);

CREATE TABLE IF NOT EXISTS public.authorization_profile_denials (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  capability_key text NOT NULL REFERENCES public.authorization_capabilities(capability_key) ON DELETE RESTRICT,
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

-- Minimal catalogue rows required by the timestamp-earlier inventory and finance
-- migration contracts. These values and role parity mirror the later canonical
-- registry migration, which remains responsible for the final upsert/decision rules.
INSERT INTO public.authorization_capabilities (
  capability_key,domain,resource,action,sensitivity,scope_kind,
  approval_mode,separation_of_duties,state_requirements,legacy_operation_id
) VALUES
  ('inventory.transfer.create','inventory','inventory_transfer','create','inventory','organization',
   'approval_required',false,'{"requires_available_quantity":true}','inventory_transfer'),
  ('inventory.count.enter','inventory','stock_count','enter_count','inventory','organization',
   'approval_required',false,'{"writes_draft_only":true}','stock_count_edit'),
  ('inventory.count.finalize','inventory','stock_count','finalize','inventory','organization',
   'maker_checker',true,'{"requires_review":true}','stock_count_finalize'),
  ('inventory.read_balance','inventory','stock_balance','read','inventory','warehouse',
   'none',false,'{"requires_warehouse_assignment":true}',NULL),
  ('inventory.count.start','inventory','stock_count','start','inventory','warehouse',
   'none',false,'{"requires_warehouse_assignment":true}',NULL),
  ('finance.workspace.manage','finance','finance_workspace','manage_invoice_and_collection','financial','organization',
   'none',false,'{}','finance_manage'),
  ('finance.journal.create_draft','finance','journal_entry','create_draft','financial','organization',
   'none',false,'{"creates_status":"draft"}',NULL),
  ('finance.journal.post','finance','journal_entry','post','financial','organization',
   'maker_checker',true,'{"required_status":"draft"}',NULL),
  ('finance.journal.reverse','finance','journal_entry','reverse','financial','organization',
   'maker_checker',true,'{"requires_posted_source_and_reason":true}',NULL)
ON CONFLICT (capability_key) DO NOTHING;

INSERT INTO public.authorization_role_capabilities(role,capability_key,grant_source)
VALUES
  ('admin','inventory.transfer.create','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('manager','inventory.transfer.create','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('staff','inventory.transfer.create','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('admin','inventory.count.enter','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('manager','inventory.count.enter','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('staff','inventory.count.enter','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('admin','inventory.count.finalize','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('manager','inventory.count.finalize','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('admin','finance.workspace.manage','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('manager','finance.workspace.manage','legacy-role-parity:ADMIN_OPERATION_RULES'),
  ('accountant','finance.workspace.manage','legacy-role-parity:ADMIN_OPERATION_RULES')
ON CONFLICT (role,capability_key) DO NOTHING;

-- Temporary deny-only implementation. The later authoritative registry
-- migration replaces both signatures with the complete tenant/role/deny logic.
CREATE OR REPLACE FUNCTION public.current_authorization_decision(p_capability_key text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'decision','DENY',
    'capability_key',p_capability_key,
    'reason','Authorization registry bootstrap is incomplete.'
  );
$function$;

REVOKE ALL ON FUNCTION public.current_authorization_decision(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_authorization_decision(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_actor_has_capability(p_capability_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=''
AS $function$
  SELECT false;
$function$;

REVOKE ALL ON FUNCTION public.current_actor_has_capability(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_actor_has_capability(text) TO authenticated;

COMMENT ON TABLE public.authorization_capabilities IS
  'Private Authorization V2 capability registry prerequisite; authoritative definitions and runtime decisions are installed by 20261117050202_authorization_capability_registry_v2.sql.';

COMMIT;
