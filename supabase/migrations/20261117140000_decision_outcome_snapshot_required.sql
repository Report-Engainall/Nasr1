-- Enforce immutable evidence-bearing decision snapshots for every new authenticated proposal.
-- The legacy helper stays available only to the snapshot-bearing SECURITY DEFINER wrapper.
BEGIN;
REVOKE ALL ON FUNCTION public.create_decision_outcome_proposal(text,text,text,uuid,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_decision_outcome_proposal_with_snapshot(text,text,text,uuid,text,text,jsonb,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_decision_outcome_proposal_with_snapshot(text,text,text,uuid,text,text,jsonb,text)
  TO authenticated;
COMMENT ON FUNCTION public.create_decision_outcome_proposal(text,text,text,uuid,text,text,text) IS
  'Private legacy insert helper. Authenticated callers must use create_decision_outcome_proposal_with_snapshot so each new decision carries its immutable ranked and evidence snapshot.';
COMMENT ON FUNCTION public.create_decision_outcome_proposal_with_snapshot(text,text,text,uuid,text,text,jsonb,text) IS
  'Sole authenticated decision proposal command. Validates and atomically persists the immutable P0-P3, impact, currency/unit, formula, owner and evidence snapshot with append-only CREATE event and idempotency.';
COMMIT;
