BEGIN;

-- Records a tenant-scoped audit event atomically after a customer payment insert and rejects invoice/customer/organization mismatches.
CREATE OR REPLACE FUNCTION public.audit_customer_payment_recorded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_currency text;
BEGIN
  SELECT i.currency
    INTO v_currency
    FROM public.customer_invoices i
   WHERE i.id = NEW.invoice_id
     AND i.organization_id = NEW.organization_id
     AND i.customer_id = NEW.customer_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'customer payment must match its invoice organization and customer';
  END IF;

  INSERT INTO public.audit_logs(
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    old_value,
    new_value
  )
  VALUES (
    NEW.organization_id,
    NEW.created_by,
    'customer_payment.recorded',
    'customer_payment',
    NEW.id,
    '{}'::jsonb,
    pg_catalog.jsonb_build_object(
      'invoice_id', NEW.invoice_id,
      'customer_id', NEW.customer_id,
      'amount', NEW.amount::text,
      'currency', v_currency,
      'payment_method', NEW.payment_method,
      'reference', NEW.reference,
      'paid_at', NEW.paid_at,
      'idempotency_key_present', NEW.idempotency_key IS NOT NULL
    )
  );

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_customer_payment_recorded() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS customer_payment_recorded_audit ON public.customer_payments;
CREATE TRIGGER customer_payment_recorded_audit
AFTER INSERT ON public.customer_payments
FOR EACH ROW
EXECUTE FUNCTION public.audit_customer_payment_recorded();

COMMENT ON FUNCTION public.audit_customer_payment_recorded() IS
  'Writes a tenant-scoped audit event for each inserted customer payment; records the source amount/currency and never stores the raw idempotency key or payment notes.';

COMMIT;
