-- FIN-INVOICE-001: tenant-scoped payment request idempotency.
-- Identical retries return the originally committed payment; changed payloads are rejected.
BEGIN;

ALTER TABLE public.customer_payments
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.customer_payments'::regclass
      AND conname='customer_payments_request_metadata_pair'
  ) THEN
    ALTER TABLE public.customer_payments
      ADD CONSTRAINT customer_payments_request_metadata_pair
      CHECK (
        (idempotency_key IS NULL AND request_fingerprint IS NULL)
        OR (
          idempotency_key IS NOT NULL
          AND request_fingerprint IS NOT NULL
          AND request_fingerprint ~ '^[0-9a-f]{64}$'
        )
      );
  END IF;
END
$constraint$;

CREATE UNIQUE INDEX IF NOT EXISTS customer_payments_org_idempotency_key_uq
  ON public.customer_payments (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.customer_payment_request_sha256(p_payload text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_crypto_schema text;
  v_hash text;
BEGIN
  IF p_payload IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='payment request payload is required';
  END IF;
  SELECT n.nspname INTO v_crypto_schema
  FROM pg_catalog.pg_extension e
  JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
  WHERE e.extname='pgcrypto';
  IF v_crypto_schema IS NULL
     OR pg_catalog.to_regprocedure(pg_catalog.format('%I.digest(text,text)',v_crypto_schema)) IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='pgcrypto SHA-256 digest function is unavailable';
  END IF;
  EXECUTE pg_catalog.format(
    'SELECT pg_catalog.encode(%I.digest($1::text, ''sha256''), ''hex'')',
    v_crypto_schema
  ) INTO v_hash USING p_payload;
  RETURN v_hash;
END;
$function$;
REVOKE ALL ON FUNCTION public.customer_payment_request_sha256(text) FROM PUBLIC,anon,authenticated,service_role;

-- Drop the callable legacy signature so a client cannot bypass the required request key.
DROP FUNCTION IF EXISTS public.record_customer_payment(uuid,numeric,text,text,text);

CREATE FUNCTION public.record_customer_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_idempotency_key uuid,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_invoice public.customer_invoices%ROWTYPE;
  v_paid numeric(15,2);
  v_credited numeric(15,2);
  v_payment uuid;
  v_existing_fingerprint text;
  v_existing_payment uuid;
  v_method text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method,'')));
  v_amount numeric(15,2);
  v_reference text;
  v_notes text;
  v_request_payload jsonb;
  v_fingerprint text;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='finance permission required to record customer payments';
  END IF;
  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile AND p.auth_user_id=auth.uid() AND p.is_active;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='active staff organization context required';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='payment idempotency key is required';
  END IF;
  IF p_invoice_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invoice id is required';
  END IF;
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
     OR p_amount<=0 OR p_amount<>pg_catalog.round(p_amount,2) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='payment amount must be finite, greater than zero, and have at most two decimal places';
  END IF;
  IF v_method NOT IN ('cash','transfer','card','credit_adjustment','other') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid payment method';
  END IF;

  v_amount := pg_catalog.round(p_amount,2);
  v_reference := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_reference,'')),200),'');
  v_notes := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),1000),'');
  v_request_payload := pg_catalog.jsonb_build_object(
    'invoice_id',p_invoice_id,
    'amount',v_amount,
    'payment_method',v_method,
    'reference',v_reference,
    'notes',v_notes
  );
  v_fingerprint := public.customer_payment_request_sha256(v_request_payload::text);

  -- Serialize use of a tenant key before the invoice settlement lock. Credit posting
  -- takes only the invoice lock, so this ordering cannot create a key/invoice lock cycle.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':customer-payment-request:'||p_idempotency_key::text,0)
  );
  SELECT cp.id,cp.request_fingerprint
    INTO v_existing_payment,v_existing_fingerprint
    FROM public.customer_payments cp
   WHERE cp.organization_id=v_org AND cp.idempotency_key=p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='payment idempotency key reused with different payload';
    END IF;
    RETURN v_existing_payment;
  END IF;

  -- Preserve the same invoice advisory-lock namespace used by posted-credit journal posting.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':customer-invoice-settlement:'||p_invoice_id::text,0)
  );
  SELECT i.* INTO v_invoice
    FROM public.customer_invoices i
   WHERE i.id=p_invoice_id AND i.organization_id=v_org;
  IF NOT FOUND OR v_invoice.status='void' THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='active invoice not found in this organization';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.customer_return_credit_memos cm
      LEFT JOIN public.customer_invoices ci
        ON ci.id=cm.invoice_id
       AND ci.organization_id=cm.organization_id
       AND ci.customer_id=cm.customer_id
     WHERE cm.organization_id=v_org
       AND cm.invoice_id=v_invoice.id
       AND cm.status='posted'
       AND (ci.id IS NULL OR cm.currency IS DISTINCT FROM v_invoice.currency)
  ) THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='posted credit memo source or currency does not reconcile to the invoice';
  END IF;

  SELECT COALESCE(pg_catalog.sum(cp.amount),0)::numeric(15,2)
    INTO v_paid
    FROM public.customer_payments cp
   WHERE cp.organization_id=v_org AND cp.invoice_id=v_invoice.id AND cp.customer_id=v_invoice.customer_id;
  SELECT COALESCE(pg_catalog.sum(cm.total_amount),0)::numeric(15,2)
    INTO v_credited
    FROM public.customer_return_credit_memos cm
   WHERE cm.organization_id=v_org
     AND cm.invoice_id=v_invoice.id
     AND cm.customer_id=v_invoice.customer_id
     AND cm.status='posted'
     AND cm.currency=v_invoice.currency;
  IF v_paid+v_credited>v_invoice.total_amount THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='recorded payments and posted credits exceed the invoice total; reconcile source records before accepting another payment';
  END IF;
  IF v_amount>v_invoice.total_amount-v_paid-v_credited THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='payment exceeds invoice balance after posted credit memos';
  END IF;

  INSERT INTO public.customer_payments(
    organization_id,customer_id,invoice_id,amount,payment_method,reference,notes,paid_at,created_by,
    idempotency_key,request_fingerprint
  )
  VALUES(
    v_invoice.organization_id,v_invoice.customer_id,v_invoice.id,v_amount,v_method,
    v_reference,v_notes,pg_catalog.now(),v_profile,p_idempotency_key,v_fingerprint
  )
  RETURNING id INTO v_payment;
  RETURN v_payment;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_customer_payment(uuid,numeric,text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment(uuid,numeric,text,uuid,text,text) TO authenticated;

COMMENT ON FUNCTION public.record_customer_payment(uuid,numeric,text,uuid,text,text) IS
  'Records a tenant-scoped idempotent payment for an active finance user. Identical request keys replay the saved payment; altered payloads are rejected.';

COMMENT ON TABLE public.customer_payments IS
  'Customer payment ledger. New RPC writes persist a tenant-scoped idempotency key and SHA-256 fingerprint; historic rows may have null request metadata.';

COMMIT;
