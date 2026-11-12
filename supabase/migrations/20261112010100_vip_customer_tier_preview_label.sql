-- Keep the customer-facing server price preview label aligned with the canonical VIP tier.
-- The price resolver already consumes the server-resolved customer tier; this fixes the returned label only.
BEGIN;

DO $vip_label$
DECLARE
  v_function regprocedure := to_regprocedure('public.preview_customer_order_pricing(jsonb,text)');
  v_definition text;
  v_old text := 'WHEN ''super_wholesale'' THEN ''جملة الجملة''';
  v_new text := 'WHEN ''vip'' THEN ''جملة الجملة'' WHEN ''super_wholesale'' THEN ''جملة الجملة''';
BEGIN
  IF v_function IS NULL THEN
    RAISE EXCEPTION 'Required RPC public.preview_customer_order_pricing(jsonb,text) is missing';
  END IF;

  v_definition := pg_catalog.pg_get_functiondef(v_function);

  IF pg_catalog.strpos(v_definition, v_new) > 0 THEN
    RETURN;
  END IF;

  IF pg_catalog.strpos(v_definition, v_old) = 0 THEN
    RAISE EXCEPTION 'Expected legacy super_wholesale customer-tier label was not found; refusing to replace an unexpected RPC body';
  END IF;

  v_definition := pg_catalog.replace(v_definition, v_old, v_new);

  IF pg_catalog.strpos(v_definition, v_new) = 0 THEN
    RAISE EXCEPTION 'VIP preview label patch did not produce the expected function body';
  END IF;

  EXECUTE v_definition;
END
$vip_label$;

COMMIT;
