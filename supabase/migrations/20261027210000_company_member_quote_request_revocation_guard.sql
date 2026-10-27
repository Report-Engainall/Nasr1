-- AGH-COMPANY-MEMBER-QUOTE-REQUEST-REVOCATION-001
-- request_sales_quote() can wait on the customers foreign-key lock after its early capability check.
-- Revalidate the active customer membership at the INSERT boundary, not just at RPC entry.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_customer_quote_request_member_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid;
BEGIN
  IF coalesce(auth.jwt()->>'role', '') = 'service_role'
     OR (auth.uid() IS NULL AND session_user = 'postgres') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'authenticated customer identity required';
  END IF;

  IF public.is_staff() THEN
    RETURN NEW;
  END IF;

  v_profile := public.current_profile_id();
  IF v_profile IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM public.user_roles r
        WHERE r.profile_id = v_profile AND r.role = 'customer'
     ) THEN
    RETURN NEW;
  END IF;

  IF NEW.created_by IS DISTINCT FROM v_profile THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'customer quote requests must be attributed to the authenticated customer profile';
  END IF;

  IF NEW.status IS DISTINCT FROM 'requested' THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'customer quote requests must start in requested state';
  END IF;

  IF NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = v_profile
          AND p.auth_user_id = auth.uid()
          AND p.is_active
          AND p.organization_id = NEW.organization_id
          AND p.organization_id = public.current_organization_id()
     )
     OR public.current_customer_id() IS DISTINCT FROM NEW.customer_id
     OR NOT public.current_customer_can('quotes.manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501',
      MESSAGE = 'company membership is no longer active or lacks quote request capability';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_customer_quote_request_member_insert()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sales_quotes_customer_member_request_guard ON public.sales_quotes;
CREATE TRIGGER sales_quotes_customer_member_request_guard
AFTER INSERT ON public.sales_quotes
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_quote_request_member_insert();

COMMENT ON FUNCTION public.guard_customer_quote_request_member_insert() IS
  'Revalidates company membership and quotes.manage after quote-request insertion/FK lock waits so a request cannot commit after revocation.';

COMMIT;
