-- Bootstrap the capability tables before earlier inventory migrations consume them.
-- The authoritative registry migration (20261117050202) later populates the catalog
-- and replaces this deliberately fail-closed compatibility predicate.
-- This migration exists to make a clean chronological PostgreSQL 17 replay possible.

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
  state_requirements jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(state_requirements)='object'),
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

-- Until the authoritative V2 policy is installed, every capability check denies.
-- The later migration replaces this function with the complete role/scope/denial logic.
CREATE OR REPLACE FUNCTION public.current_actor_has_capability(p_capability_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT false;
$function$;

REVOKE ALL ON FUNCTION public.current_actor_has_capability(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_actor_has_capability(text) TO authenticated;

COMMIT;
