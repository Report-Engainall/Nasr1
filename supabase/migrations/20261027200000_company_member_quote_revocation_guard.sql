-- AGH-COMPANY-MEMBER-QUOTE-REVOCATION-001
-- Customer quote decisions can wait on a quote-row lock after the initial capability check.
-- Revalidate at the mutation boundary so a committed membership revocation aborts acceptance/rejection.

BEGIN;

CREATE OR REPLACE FUNCTION public.customer_respond_to_quote(p_quote_id uuid,p_accept boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_customer uuid;
BEGIN
  IF NOT public.current_customer_can('quotes.manage') THEN
    RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='company member is not allowed to respond to quotes';
  END IF;
  IF v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='sign in required';
  END IF;
  IF p_quote_id IS NULL OR p_accept IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='quote id and explicit accept or reject decision are required';
  END IF;
  v_customer := public.current_customer_id();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account required';
  END IF;
  UPDATE public.sales_quotes q
     SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END,
         responded_by=v_profile, updated_at=pg_catalog.now()
   WHERE q.id=p_quote_id AND q.customer_id=v_customer AND q.status='quoted';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='quote is unavailable or no longer awaiting a response';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.customer_respond_to_quote(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_respond_to_quote(uuid,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_customer_quote_member_response()
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
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='authenticated customer identity required';
  END IF;
  v_profile := public.current_profile_id();
  IF v_profile IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active customer profile required';
  END IF;
  IF NEW.responded_by IS DISTINCT FROM v_profile
     OR OLD.status IS DISTINCT FROM 'quoted'
     OR NEW.status NOT IN ('accepted','rejected') THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active
          AND p.organization_id=NEW.organization_id
          AND p.organization_id=public.current_organization_id()
     )
     OR public.current_customer_id() IS DISTINCT FROM NEW.customer_id
     OR NOT public.current_customer_can('quotes.manage') THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='company membership is no longer active or lacks quote capability';
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_customer_quote_member_response() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS sales_quotes_customer_member_response_guard ON public.sales_quotes;
CREATE TRIGGER sales_quotes_customer_member_response_guard
AFTER UPDATE OF status ON public.sales_quotes
FOR EACH ROW EXECUTE FUNCTION public.guard_customer_quote_member_response();

COMMENT ON FUNCTION public.guard_customer_quote_member_response() IS
  'Revalidates customer quote response capability after quote-row lock waits, so a membership revocation committed while acceptance/rejection is blocked aborts the quote transaction.';

COMMIT;
