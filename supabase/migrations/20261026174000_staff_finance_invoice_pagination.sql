-- FIN-INVOICE-001: keyset-paginated staff invoice ledger with authoritative, full-history balances.
-- Use a stable issued_at/id cursor so new invoices do not shift later pages.
BEGIN;

CREATE OR REPLACE FUNCTION public.fetch_staff_finance_invoice_page(
  p_limit integer DEFAULT 200,
  p_before_issued_at timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor uuid := public.current_profile_id();
  v_org uuid;
  v_total bigint;
  v_invoices jsonb;
  v_has_more boolean;
BEGIN
  IF auth.uid() IS NULL OR v_actor IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='finance permission required to read invoice ledger pages';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_actor AND p.auth_user_id=auth.uid() AND p.is_active;

  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active finance organization is required';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200
     OR ((p_before_issued_at IS NULL) IS DISTINCT FROM (p_before_id IS NULL)) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='invoice page limit must be 1..200 and both cursor fields must be null or present';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.customer_return_credit_memos cm
      LEFT JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.status='posted'
       AND (ci.id IS NULL OR cm.currency IS DISTINCT FROM ci.currency)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='posted credit memo source or currency does not reconcile to the invoice';
  END IF;

  SELECT count(*) INTO v_total
    FROM public.customer_invoices ci
   WHERE ci.organization_id=v_org;

  WITH page_candidates AS MATERIALIZED (
    SELECT ci.*
      FROM public.customer_invoices ci
     WHERE ci.organization_id=v_org
       AND (
         p_before_issued_at IS NULL
         OR ci.issued_at < p_before_issued_at
         OR (ci.issued_at = p_before_issued_at AND ci.id > p_before_id)
       )
     ORDER BY ci.issued_at DESC,ci.id ASC
     LIMIT (p_limit + 1)
  ),
  invoice_page AS (
    SELECT *
      FROM page_candidates
     ORDER BY issued_at DESC,id ASC
     LIMIT p_limit
  ),
  page_flags AS (
    SELECT pg_catalog.count(*) > p_limit AS has_more
      FROM page_candidates
  ),
  payments_by_invoice AS (
    SELECT cp.organization_id,cp.invoice_id,cp.customer_id,
           pg_catalog.sum(cp.amount)::numeric(15,2) AS paid_amount
      FROM public.customer_payments cp
     WHERE cp.organization_id=v_org
     GROUP BY cp.organization_id,cp.invoice_id,cp.customer_id
  ),
  credits_by_invoice AS (
    SELECT cm.organization_id,cm.invoice_id,cm.customer_id,
           pg_catalog.sum(cm.total_amount)::numeric(15,2) AS credit_memo_amount
      FROM public.customer_return_credit_memos cm
      JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.status='posted'
       AND cm.currency=ci.currency
     GROUP BY cm.organization_id,cm.invoice_id,cm.customer_id
  )
  SELECT
    COALESCE(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id',i.id,
          'organization_id',i.organization_id,
          'customer_id',i.customer_id,
          'order_id',i.order_id,
          'invoice_number',i.invoice_number,
          'status',i.status,
          'issued_at',i.issued_at,
          'due_at',i.due_at,
          'currency',i.currency,
          'subtotal',i.subtotal::text,
          'tax_amount',i.tax_amount::text,
          'total_amount',i.total_amount::text,
          'paid_amount',COALESCE(p.paid_amount,0)::numeric(15,2)::text,
          'credit_memo_amount',COALESCE(c.credit_memo_amount,0)::numeric(15,2)::text,
          'outstanding_amount',(
            CASE WHEN i.status='void' THEN 0
              ELSE GREATEST(
                i.total_amount-COALESCE(p.paid_amount,0)-COALESCE(c.credit_memo_amount,0),
                0
              )
            END
          )::numeric(15,2)::text
        )
        ORDER BY i.issued_at DESC,i.id ASC
      ),
      '[]'::jsonb
    ),
    COALESCE((SELECT pf.has_more FROM page_flags pf),false)
    INTO v_invoices,v_has_more
    FROM invoice_page i
    LEFT JOIN payments_by_invoice p
      ON p.organization_id=i.organization_id
     AND p.invoice_id=i.id
     AND p.customer_id=i.customer_id
    LEFT JOIN credits_by_invoice c
      ON c.organization_id=i.organization_id
     AND c.invoice_id=i.id
     AND c.customer_id=i.customer_id;

  RETURN pg_catalog.jsonb_build_object(
    'invoices',v_invoices,
    'total_invoices',v_total,
    'limit',p_limit,
    'has_more',v_has_more
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fetch_staff_finance_invoice_page(integer,timestamptz,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fetch_staff_finance_invoice_page(integer,timestamptz,uuid) TO authenticated;

COMMIT;
