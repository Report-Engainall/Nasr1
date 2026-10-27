-- AGH-COMPANY-MEMBER-REVOCATION-001
-- Re-check authenticated customer scope at the row-mutation boundary. A member
-- RPC can pass its early capability check, then wait on the company row while
-- an owner revokes the membership. The trigger runs on the later INSERT/UPDATE/
-- DELETE statement with a fresh READ COMMITTED snapshot, so stale authorization
-- cannot mutate addresses or company contacts after revocation commits.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_customer_company_member_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer_id uuid;
  v_organization_id uuid;
  v_capability text;
BEGIN
  -- Trusted jobs with no end-user identity may perform controlled maintenance.
  -- Authenticated requests must still prove current customer scope below.
  IF auth.uid() IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_TABLE_NAME = 'customer_addresses' THEN
    v_capability := 'addresses.manage';
  ELSIF TG_TABLE_NAME = 'customer_company_contacts' THEN
    v_capability := 'contacts.manage';
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'unsupported customer mutation target';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
    v_organization_id := OLD.organization_id;
  ELSE
    v_customer_id := NEW.customer_id;
    v_organization_id := NEW.organization_id;
  END IF;

  -- These records belong to one customer for their lifetime. A row update
  -- cannot be used to move content from one customer or tenant to another.
  IF TG_OP = 'UPDATE'
     AND (OLD.customer_id IS DISTINCT FROM NEW.customer_id
       OR OLD.organization_id IS DISTINCT FROM NEW.organization_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'customer-owned records cannot be transferred';
  END IF;

  IF v_profile IS NULL
     OR v_organization_id IS NULL
     OR v_organization_id IS DISTINCT FROM public.current_organization_id()
     OR NOT EXISTS (
       SELECT 1
         FROM public.profiles p
        WHERE p.id = v_profile
          AND p.auth_user_id = auth.uid()
          AND p.is_active
          AND p.organization_id = v_organization_id
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'active customer identity required';
  END IF;

  -- This check executes at the actual write statement, after any preceding
  -- customer-row lock has been acquired. It denies a member whose access was
  -- revoked while the RPC was waiting, even if the RPC's early check was true.
  IF public.current_customer_id() IS DISTINCT FROM v_customer_id
     OR NOT public.current_customer_can(v_capability) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'company membership is no longer active or lacks mutation capability';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_customer_company_member_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS customer_addresses_member_mutation_guard ON public.customer_addresses;
CREATE TRIGGER customer_addresses_member_mutation_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.customer_addresses
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_company_member_mutation();

DROP TRIGGER IF EXISTS customer_company_contacts_member_mutation_guard ON public.customer_company_contacts;
CREATE TRIGGER customer_company_contacts_member_mutation_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.customer_company_contacts
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_company_member_mutation();

COMMIT;
