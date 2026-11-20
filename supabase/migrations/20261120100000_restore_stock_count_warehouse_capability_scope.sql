-- Restore the resource scope consumed by the later stock-count commands.
--
-- Authorization V2 registry seeding (20261117050202) re-applies the legacy
-- organization-scoped metadata for these two stock-count capabilities.
-- The stock-count command guards installed later in the same migration chain
-- resolve both decisions against the concrete warehouse, so their registry
-- metadata must retain that warehouse scope.
--
-- No role grant is added or widened here. Existing role parity, explicit
-- profile denials, warehouse assignments and maker/checker checks remain the
-- only authorization inputs.

BEGIN;

DO $stock_count_capability_scope$
DECLARE
  v_enter_rows integer;
  v_finalize_rows integer;
BEGIN
  UPDATE public.authorization_capabilities
     SET scope_kind='warehouse',
         approval_mode='none',
         separation_of_duties=false,
         state_requirements=state_requirements
           || '{"requires_warehouse_assignment":true,"writes_draft_only":true}'::jsonb,
         updated_at=statement_timestamp()
   WHERE capability_key='inventory.count.enter'
     AND is_active=true;
  GET DIAGNOSTICS v_enter_rows = ROW_COUNT;

  UPDATE public.authorization_capabilities
     SET scope_kind='warehouse',
         approval_mode='maker_checker',
         separation_of_duties=true,
         state_requirements=state_requirements
           || '{"requires_warehouse_assignment":true,"reviewer_must_differ_from_counter":true}'::jsonb,
         updated_at=statement_timestamp()
   WHERE capability_key='inventory.count.finalize'
     AND is_active=true;
  GET DIAGNOSTICS v_finalize_rows = ROW_COUNT;

  IF v_enter_rows<>1 OR v_finalize_rows<>1 THEN
    RAISE EXCEPTION
      'stock-count capability scope contract is incomplete (count.enter rows %, count.finalize rows %)',
      v_enter_rows,v_finalize_rows;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.authorization_capabilities
     WHERE capability_key='inventory.count.enter'
       AND (scope_kind<>'warehouse' OR approval_mode<>'none' OR separation_of_duties)
  ) OR EXISTS (
    SELECT 1
      FROM public.authorization_capabilities
     WHERE capability_key='inventory.count.finalize'
       AND (scope_kind<>'warehouse' OR approval_mode<>'maker_checker' OR NOT separation_of_duties)
  ) THEN
    RAISE EXCEPTION 'stock-count capability scope contract did not persist';
  END IF;
END
$stock_count_capability_scope$;

COMMENT ON TABLE public.authorization_capabilities IS
  'Private Authorization V2 registry; stock-count entry/finalization retain warehouse-scoped command contracts and manager-checker separation.';

COMMIT;
