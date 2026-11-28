-- Forward repair for transfer RPCs: warehouse assignments must be checked
-- before either single or batch idempotency replay can return a prior result.
DO $transfer_scope_guard$
DECLARE
  v_function record;
  v_source_arg text;
  v_destination_arg text;
  v_definition text;
  v_guard text;
  v_guard_position integer;
  v_replay_lock_position integer;
  v_guarded_count integer := 0;
BEGIN
  FOR v_function IN
    SELECT p.oid,p.proname,p.proargnames
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('transfer_inventory','transfer_inventory_batch')
  LOOP
    SELECT arg_name INTO v_source_arg
      FROM unnest(v_function.proargnames) WITH ORDINALITY AS args(arg_name,ordinality)
     WHERE arg_name ~* '(source|from).*warehouse|warehouse.*(source|from)'
     ORDER BY ordinality LIMIT 1;

    SELECT arg_name INTO v_destination_arg
      FROM unnest(v_function.proargnames) WITH ORDINALITY AS args(arg_name,ordinality)
     WHERE arg_name ~* '(destination|dest|to).*warehouse|warehouse.*(destination|dest|to)'
     ORDER BY ordinality LIMIT 1;

    IF v_source_arg IS NULL OR v_destination_arg IS NULL THEN
      RAISE EXCEPTION 'cannot identify source/destination warehouse parameters for public.%',v_function.proname;
    END IF;

    v_guard := 'PERFORM public.assert_inventory_transfer_scope_v2('
      || pg_catalog.quote_ident(v_source_arg) || ','
      || pg_catalog.quote_ident(v_destination_arg) || ');';
    v_definition := pg_catalog.pg_get_functiondef(v_function.oid);

    IF pg_catalog.strpos(v_definition,'PERFORM public.assert_inventory_transfer_scope_v2(')=0 THEN
      v_definition := pg_catalog.regexp_replace(
        v_definition,
        E'(?m)^([[:blank:]]*)BEGIN([[:blank:]]*)$',
        E'\\1BEGIN\\2\n  ' || v_guard,
        'i'
      );
      IF pg_catalog.strpos(v_definition,'PERFORM public.assert_inventory_transfer_scope_v2(')=0 THEN
        RAISE EXCEPTION 'failed to insert warehouse scope guard into public.%',v_function.proname;
      END IF;
      EXECUTE v_definition;
    END IF;

    SELECT pg_catalog.pg_get_functiondef(p.oid)
      INTO v_definition
      FROM pg_catalog.pg_proc p
     WHERE p.oid=v_function.oid;
    v_guard_position := pg_catalog.strpos(v_definition,'PERFORM public.assert_inventory_transfer_scope_v2(');
    v_replay_lock_position := pg_catalog.strpos(v_definition,'pg_advisory_xact_lock');
    IF v_guard_position=0 OR v_replay_lock_position=0 OR v_guard_position>v_replay_lock_position THEN
      RAISE EXCEPTION 'warehouse scope guard is missing or follows the idempotency lock in public.%',v_function.proname;
    END IF;
    v_guarded_count := v_guarded_count+1;
  END LOOP;

  IF v_guarded_count<>2 THEN
    RAISE EXCEPTION 'expected to harden both inventory transfer RPCs; guarded %',v_guarded_count;
  END IF;
END
$transfer_scope_guard$;
