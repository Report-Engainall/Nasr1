BEGIN;

CREATE OR REPLACE FUNCTION public.guard_authorization_profile_scope_v2()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile_organization_id uuid;
  v_resource_organization_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.profile_id IS DISTINCT FROM OLD.profile_id
    OR NEW.scope_kind IS DISTINCT FROM OLD.scope_kind
    OR NEW.warehouse_id IS DISTINCT FROM OLD.warehouse_id
    OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'authorization scope identity is immutable; revoke and create a new scoped assignment';
  END IF;

  SELECT p.organization_id
    INTO v_profile_organization_id
    FROM public.profiles p
   WHERE p.id = NEW.profile_id
     AND p.organization_id = NEW.organization_id
     AND p.is_active = true
     AND p.auth_user_id IS NOT NULL
   FOR KEY SHARE;

  IF v_profile_organization_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'scope target must be an active authenticated profile in the same organization';
  END IF;

  -- A customer identity is never a staff membership, even if a caller bypasses
  -- the admin UI and invokes the scope RPC or writes through a privileged API.
  IF EXISTS (
    SELECT 1
      FROM public.user_roles ur
     WHERE ur.profile_id = NEW.profile_id
       AND ur.role = 'customer'
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'customer accounts cannot receive internal warehouse or assigned-customer staff scopes';
  END IF;

  IF NEW.scope_kind = 'warehouse' THEN
    SELECT w.organization_id
      INTO v_resource_organization_id
      FROM public.warehouses w
     WHERE w.id = NEW.warehouse_id
       AND w.organization_id = NEW.organization_id
       AND w.is_active = true
     FOR KEY SHARE;
  ELSIF NEW.scope_kind = 'assigned_customer' THEN
    SELECT c.organization_id
      INTO v_resource_organization_id
      FROM public.customers c
     WHERE c.id = NEW.customer_id
       AND c.organization_id = NEW.organization_id
     FOR KEY SHARE;
  ELSE
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'unsupported authorization resource scope';
  END IF;

  IF v_resource_organization_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'scope resource must belong to the target profile organization';
  END IF;

  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION public.guard_authorization_profile_scope_v2() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS authorization_profile_scopes_boundary_guard ON public.authorization_profile_scopes;
CREATE TRIGGER authorization_profile_scopes_boundary_guard
  BEFORE INSERT OR UPDATE ON public.authorization_profile_scopes
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_authorization_profile_scope_v2();

COMMENT ON FUNCTION public.guard_authorization_profile_scope_v2() IS
  'Database-enforced boundary keeping customer identities separate from staff scopes and preventing cross-tenant or resource-identity reassignment.';
COMMIT;
