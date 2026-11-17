BEGIN;

-- The later inventory batch/FEFO migration redefines both transfer RPCs after
-- the original authorization migration. Reinstall the resource-scope check
-- after those definitions so a retry cannot return an old result before the
-- caller is authorized for BOTH warehouse endpoints.
DO $transfer_rpc_guards$
DECLARE
  v_function record;
  v_source_arg text;
  v_destination_arg text;
  v_definition text;
  v_begin_position integer;
BEGIN
  FOR v_function IN
    SELECT p.oid,p.proname,p.proargnames
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('transfer_inventory','transfer_inventory_batch')
  LOOP
    v_source_arg := NULL;
    v_destination_arg := NULL;

    SELECT arg_name
      INTO v_source_arg
      FROM unnest(v_function.proargnames) WITH ORDINALITY AS args(arg_name,ordinality)
     WHERE arg_name ~* '(source|from).*warehouse|warehouse.*(source|from)'
     ORDER BY ordinality
     LIMIT 1;

    SELECT arg_name
      INTO v_destination_arg
      FROM unnest(v_function.proargnames) WITH ORDINALITY AS args(arg_name,ordinality)
     WHERE arg_name ~* '(destination|dest|to).*warehouse|warehouse.*(destination|dest|to)'
     ORDER BY ordinality
     LIMIT 1;

    IF v_source_arg IS NULL OR v_destination_arg IS NULL THEN
      RAISE EXCEPTION 'cannot identify source/destination warehouse parameters for public.%',v_function.proname;
    END IF;

    v_definition := pg_catalog.pg_get_functiondef(v_function.oid);

    -- Idempotent on migration replay and safe when a later migration has
    -- already retained the authorization guard.
    IF pg_catalog.strpos(
      v_definition,
      'PERFORM public.assert_inventory_transfer_scope_v2('
    ) > 0 THEN
      CONTINUE;
    END IF;

    v_begin_position := pg_catalog.strpos(v_definition,E'\nBEGIN\n');
    IF v_begin_position = 0 THEN
      RAISE EXCEPTION 'cannot locate executable body for public.%',v_function.proname;
    END IF;

    v_definition :=
      pg_catalog.substr(v_definition,1,v_begin_position-1)
      || E'\nBEGIN\n  PERFORM public.assert_inventory_transfer_scope_v2('
         || pg_catalog.quote_ident(v_source_arg) || ','
         || pg_catalog.quote_ident(v_destination_arg) || E');\n'
      || pg_catalog.substr(
           v_definition,
           v_begin_position + pg_catalog.length(E'\nBEGIN\n')
         );

    EXECUTE v_definition;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='transfer_inventory'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='transfer_inventory_batch'
  ) THEN
    RAISE EXCEPTION 'both single and batch inventory transfer RPCs must exist';
  END IF;

  -- Fail the migration rather than silently ship if either executable body
  -- does not begin with the resource-scoped authorization check.
  IF EXISTS (
    SELECT 1
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('transfer_inventory','transfer_inventory_batch')
       AND pg_catalog.strpos(
         pg_catalog.pg_get_functiondef(p.oid),
         'PERFORM public.assert_inventory_transfer_scope_v2('
       ) = 0
  ) THEN
    RAISE EXCEPTION 'inventory transfer RPC is missing the warehouse-scope guard';
  END IF;
END
$transfer_rpc_guards$;

COMMIT;
