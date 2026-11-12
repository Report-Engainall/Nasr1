-- DLV-008: one customer receipt can be atomically allocated to multiple invoices
-- only when every source invoice belongs to the same tenant/customer/currency.
BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_payment_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  total_amount numeric(15,2) NOT NULL CHECK (total_amount > 0),
  allocation_count integer NOT NULL CHECK (allocation_count BETWEEN 2 AND 50),
  payment_method text NOT NULL CHECK (payment_method IN ('cash','transfer','card','credit_adjustment','other')),
  reference text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  idempotency_key uuid NOT NULL,
  request_fingerprint text NOT NULL CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key),
  UNIQUE (id, organization_id, customer_id)
);

ALTER TABLE public.customer_payments
  ADD COLUMN IF NOT EXISTS receipt_id uuid;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='public.customer_payments'::regclass
      AND conname='customer_payments_receipt_tenant_fk'
  ) THEN
    ALTER TABLE public.customer_payments
      ADD CONSTRAINT customer_payments_receipt_tenant_fk
      FOREIGN KEY (receipt_id, organization_id, customer_id)
      REFERENCES public.customer_payment_receipts(id, organization_id, customer_id)
      ON DELETE RESTRICT;
  END IF;
END
$constraint$;

CREATE INDEX IF NOT EXISTS customer_payments_receipt_id_idx
  ON public.customer_payments (receipt_id, paid_at DESC)
  WHERE receipt_id IS NOT NULL;

ALTER TABLE public.customer_payment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_payment_receipts FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.customer_payment_receipts TO authenticated;

DROP POLICY IF EXISTS customer_payment_receipts_scoped_read ON public.customer_payment_receipts;
CREATE POLICY customer_payment_receipts_scoped_read
  ON public.customer_payment_receipts
  FOR SELECT TO authenticated
  USING (
    organization_id = (
      SELECT p.organization_id
        FROM public.profiles p
       WHERE p.id=public.current_profile_id()
         AND p.auth_user_id=auth.uid()
         AND p.is_active=true
    )
    AND public.can_manage_finance()
  );

CREATE OR REPLACE FUNCTION public.record_customer_payment_allocation(
  p_allocations jsonb,
  p_payment_method text,
  p_idempotency_key uuid,
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_profile uuid := public.current_profile_id();
  v_org uuid;
  v_customer uuid;
  v_currency text;
  v_method text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_payment_method,'')));
  v_reference text;
  v_notes text;
  v_paid_at timestamptz := pg_catalog.now();
  v_count integer := 0;
  v_key_count integer;
  v_invoice_id uuid;
  v_amount_raw numeric;
  v_total numeric(15,2) := 0;
  v_paid numeric(15,2);
  v_credited numeric(15,2);
  v_invoice public.customer_invoices%ROWTYPE;
  v_input_allocations jsonb := '[]'::jsonb;
  v_normalized_allocations jsonb;
  v_request_payload jsonb;
  v_fingerprint text;
  v_existing_fingerprint text;
  v_existing_receipt uuid;
  v_existing_total numeric(15,2);
  v_existing_currency text;
  v_existing_count integer;
  v_receipt uuid;
  v_payment uuid;
  v_child_key uuid;
  v_child_fingerprint text;
  v_line record;
  v_lock record;
BEGIN
  IF auth.uid() IS NULL OR v_profile IS NULL OR NOT public.can_manage_finance() THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='finance permission required to record a customer payment receipt';
  END IF;

  SELECT p.organization_id INTO v_org
    FROM public.profiles p
   WHERE p.id=v_profile
     AND p.auth_user_id=auth.uid()
     AND p.is_active=true;
  IF v_org IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='42501',
      MESSAGE='active finance organization context required';
  END IF;

  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='payment receipt idempotency key is required';
  END IF;
  IF p_allocations IS NULL OR pg_catalog.jsonb_typeof(p_allocations) IS DISTINCT FROM 'array'
     OR pg_catalog.jsonb_array_length(p_allocations) NOT BETWEEN 2 AND 50 THEN
    RAISE EXCEPTION USING ERRCODE='22023',
      MESSAGE='a payment receipt requires between 2 and 50 invoice allocations';
  END IF;
  IF v_method NOT IN ('cash','transfer','card','credit_adjustment','other') THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='invalid payment method';
  END IF;

  v_reference := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_reference,'')),200),'');
  v_notes := nullif(pg_catalog.left(pg_catalog.btrim(coalesce(p_notes,'')),1000),'');

  -- Normalize and validate every line before taking locks or writing receipt data.
  FOR v_line IN
    SELECT item.value
      FROM pg_catalog.jsonb_array_elements(p_allocations) AS item(value)
  LOOP
    IF pg_catalog.jsonb_typeof(v_line.value) IS DISTINCT FROM 'object'
       OR NOT (v_line.value ? 'invoice_id')
       OR NOT (v_line.value ? 'amount') THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='each receipt allocation must contain invoice_id and amount only';
    END IF;

    SELECT pg_catalog.count(*)::integer INTO v_key_count
      FROM pg_catalog.jsonb_object_keys(v_line.value) AS keys(key);
    IF v_key_count <> 2 THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='receipt allocation contains unsupported fields';
    END IF;

    IF nullif(v_line.value->>'invoice_id','') IS NULL
       OR nullif(v_line.value->>'amount','') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='receipt allocation invoice and amount are required';
    END IF;

    v_invoice_id := (v_line.value->>'invoice_id')::uuid;
    v_amount_raw := (v_line.value->>'amount')::numeric;
    IF v_amount_raw::text IN ('NaN','Infinity','-Infinity')
       OR v_amount_raw <= 0
       OR v_amount_raw <> pg_catalog.round(v_amount_raw,2)
       OR v_amount_raw > 9999999999999.99 THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='each allocation amount must be finite, positive and exact to two decimal places';
    END IF;
    IF EXISTS (
      SELECT 1
        FROM pg_catalog.jsonb_array_elements(v_input_allocations) AS existing(value)
       WHERE existing.value->>'invoice_id'=v_invoice_id::text
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='an invoice may appear only once in a payment receipt';
    END IF;

    v_total := v_total + v_amount_raw::numeric(15,2);
    v_count := v_count + 1;
    v_input_allocations := v_input_allocations || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object('invoice_id',v_invoice_id::text,'amount',v_amount_raw::numeric(15,2)::text)
    );
  END LOOP;

  SELECT pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'invoice_id',allocation.invoice_id::text,
      'amount',allocation.amount::numeric(15,2)::text
    )
    ORDER BY allocation.invoice_id
  )
    INTO v_normalized_allocations
    FROM pg_catalog.jsonb_to_recordset(v_input_allocations)
      AS allocation(invoice_id uuid, amount numeric);

  v_request_payload := pg_catalog.jsonb_build_object(
    'allocations',v_normalized_allocations,
    'payment_method',v_method,
    'reference',v_reference,
    'notes',v_notes
  );
  v_fingerprint := public.customer_payment_request_sha256(v_request_payload::text);

  -- Lock the receipt request key first. Exact retries replay one canonical receipt.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_org::text||':customer-payment-receipt:'||p_idempotency_key::text,0)
  );

  SELECT r.id,r.request_fingerprint,r.total_amount,r.currency,r.allocation_count
    INTO v_existing_receipt,v_existing_fingerprint,v_existing_total,v_existing_currency,v_existing_count
    FROM public.customer_payment_receipts r
   WHERE r.organization_id=v_org
     AND r.idempotency_key=p_idempotency_key
   FOR UPDATE;
  IF FOUND THEN
    IF v_existing_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='payment receipt idempotency key reused with a different allocation payload';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'receipt_id',v_existing_receipt,
      'total_amount',v_existing_total::text,
      'currency',v_existing_currency,
      'allocation_count',v_existing_count,
      'replayed',true
    );
  END IF;

  -- Use the same invoice-settlement namespace as single-invoice payments and credit posting.
  -- A stable UUID order prevents two overlapping multi-invoice requests from deadlocking.
  FOR v_lock IN
    SELECT (item.value->>'invoice_id')::uuid AS invoice_id
      FROM pg_catalog.jsonb_array_elements(v_normalized_allocations) AS item(value)
     ORDER BY (item.value->>'invoice_id')::uuid
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        v_org::text||':customer-invoice-settlement:'||v_lock.invoice_id::text,
        0
      )
    );
  END LOOP;

  -- Reconcile every invoice after all settlement locks have been acquired.
  FOR v_line IN
    SELECT
      (item.value->>'invoice_id')::uuid AS invoice_id,
      (item.value->>'amount')::numeric(15,2) AS amount
      FROM pg_catalog.jsonb_array_elements(v_normalized_allocations) AS item(value)
     ORDER BY (item.value->>'invoice_id')::uuid
  LOOP
    SELECT i.* INTO v_invoice
      FROM public.customer_invoices i
     WHERE i.id=v_line.invoice_id
       AND i.organization_id=v_org;
    IF NOT FOUND OR v_invoice.status='void' THEN
      RAISE EXCEPTION USING ERRCODE='P0002',
        MESSAGE='one or more active invoices are unavailable in the current organization';
    END IF;

    IF v_customer IS NULL THEN
      v_customer := v_invoice.customer_id;
      v_currency := v_invoice.currency;
    ELSIF v_invoice.customer_id IS DISTINCT FROM v_customer THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='all receipt allocations must belong to the same customer';
    ELSIF v_invoice.currency IS DISTINCT FROM v_currency THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='all receipt allocations must use the same currency; foreign exchange is not performed';
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
     WHERE cp.organization_id=v_org
       AND cp.invoice_id=v_invoice.id
       AND cp.customer_id=v_invoice.customer_id;

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
        MESSAGE='recorded payments and posted credits exceed an invoice total; reconcile source records before accepting the receipt';
    END IF;
    IF v_line.amount>v_invoice.total_amount-v_paid-v_credited THEN
      RAISE EXCEPTION USING ERRCODE='22023',
        MESSAGE='one or more receipt allocations exceed the remaining invoice balance after posted credits';
    END IF;
  END LOOP;

  INSERT INTO public.customer_payment_receipts(
    organization_id,customer_id,currency,total_amount,allocation_count,payment_method,
    reference,notes,paid_at,created_by,idempotency_key,request_fingerprint
  )
  VALUES(
    v_org,v_customer,v_currency,v_total,v_count,v_method,v_reference,v_notes,
    v_paid_at,v_profile,p_idempotency_key,v_fingerprint
  )
  RETURNING id INTO v_receipt;

  -- Maintain the existing per-invoice payment ledger. Statements, aging and the
  -- accounting journal source all continue to see one payment row per invoice.
  FOR v_line IN
    SELECT
      (item.value->>'invoice_id')::uuid AS invoice_id,
      (item.value->>'amount')::numeric(15,2) AS amount
      FROM pg_catalog.jsonb_array_elements(v_normalized_allocations) AS item(value)
     ORDER BY (item.value->>'invoice_id')::uuid
  LOOP
    v_child_key := pg_catalog.gen_random_uuid();
    v_child_fingerprint := public.customer_payment_request_sha256(
      pg_catalog.jsonb_build_object(
        'receipt_id',v_receipt,
        'invoice_id',v_line.invoice_id,
        'amount',v_line.amount::text
      )::text
    );
    INSERT INTO public.customer_payments(
      organization_id,customer_id,invoice_id,amount,payment_method,reference,notes,
      paid_at,created_by,idempotency_key,request_fingerprint,receipt_id
    )
    VALUES(
      v_org,v_customer,v_line.invoice_id,v_line.amount,v_method,v_reference,v_notes,
      v_paid_at,v_profile,v_child_key,v_child_fingerprint,v_receipt
    )
    RETURNING id INTO v_payment;
  END LOOP;

  INSERT INTO public.audit_logs(
    organization_id,actor_id,action,entity_type,entity_id,old_value,new_value
  )
  VALUES(
    v_org,v_profile,'customer_payment_receipt.recorded','customer_payment_receipt',v_receipt,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'customer_id',v_customer,
      'currency',v_currency,
      'total_amount',v_total::text,
      'allocation_count',v_count,
      'allocations',v_normalized_allocations,
      'payment_method',v_method,
      'reference',v_reference,
      'paid_at',v_paid_at,
      'idempotency_key_present',true
    )
  );

  RETURN pg_catalog.jsonb_build_object(
    'receipt_id',v_receipt,
    'total_amount',v_total::text,
    'currency',v_currency,
    'allocation_count',v_count,
    'replayed',false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.record_customer_payment_allocation(jsonb,text,uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.record_customer_payment_allocation(jsonb,text,uuid,text,text) TO authenticated;

COMMENT ON TABLE public.customer_payment_receipts IS
  'One tenant-scoped idempotent customer receipt. Child customer_payments rows are invoice allocations; their sum equals total_amount.';
COMMENT ON FUNCTION public.record_customer_payment_allocation(jsonb,text,uuid,text,text) IS
  'Atomically records one same-customer/same-currency receipt across 2..50 invoices. Uses sorted invoice settlement locks, exact-decimal allocations, tenant/role guards, idempotent replay and receipt/allocation audit. Performs no FX conversion.';

COMMIT;
