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

COMMIT;
