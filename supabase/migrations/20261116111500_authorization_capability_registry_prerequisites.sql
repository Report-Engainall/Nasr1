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

-- The next inventory-scope migration backfills warehouse-level permissions
-- from these three legacy source capabilities. Seed the same canonical rows
-- and role grants before that consumer runs; the later registry migration
-- will reconcile the capability definitions with its canonical ON CONFLICT
-- update and retain the already-compatible grants.
INSERT INTO public.authorization_capabilities (
  capability_key,domain,resource,action,sensitivity,scope_kind,
  approval_mode,separation_of_duties,state_requirements,legacy_operation_id
) VALUES
  ('inventory.read_balance','inventory','stock_balance','read','inventory','warehouse',
   'none',false,'{"requires_warehouse_assignment":true}'::jsonb,NULL),
  ('inventory.count.start','inventory','stock_count','start','inventory','warehouse',
   'none',false,'{"requires_warehouse_assignment":true}'::jsonb,NULL),
  ('inventory.count.enter','inventory','stock_count','enter_count','inventory','organization',
   'approval_required',false,'{"writes_draft_only":true}'::jsonb,'stock_count_edit'),
  ('inventory.count.finalize','inventory','stock_count','finalize','inventory','organization',
   'maker_checker',true,'{"requires_review":true}'::jsonb,'stock_count_finalize'),
  ('inventory.transfer.create','inventory','inventory_transfer','create','inventory','organization',
   'approval_required',false,'{"requires_available_quantity":true}'::jsonb,'inventory_transfer')
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
  ('manager','inventory.count.finalize','legacy-role-parity:ADMIN_OPERATION_RULES')
ON CONFLICT (role,capability_key) DO NOTHING;

COMMIT;
