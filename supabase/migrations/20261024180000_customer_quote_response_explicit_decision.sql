-- NASR1-QUOTE-RESPONSE-EXPLICIT-DECISION-001
-- Reject an omitted/null accept-vs-reject decision instead of coercing it into rejection.
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
  v_customer:=public.current_customer_id();
  IF v_customer IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='customer account required';
  END IF;
  UPDATE public.sales_quotes q
     SET status=CASE WHEN p_accept THEN 'accepted' ELSE 'rejected' END, updated_at=pg_catalog.now()
   WHERE q.id=p_quote_id AND q.customer_id=v_customer AND q.status='quoted';
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='quote is unavailable or no longer awaiting a response';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.customer_respond_to_quote(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.customer_respond_to_quote(uuid,boolean) TO authenticated;
COMMENT ON FUNCTION public.customer_respond_to_quote(uuid,boolean) IS
  'Accepts or rejects an awaiting quote only for the active authorized customer; NULL quote IDs or decisions are rejected as invalid input.';
