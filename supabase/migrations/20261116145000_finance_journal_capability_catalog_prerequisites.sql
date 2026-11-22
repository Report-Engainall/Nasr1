-- Seed finance journal capabilities before the maker-checker migration consumes them.
-- The canonical Authorization V2 registry later upserts the authoritative metadata
-- and role parity. This chronological seed is deliberately additive and fail-safe.

BEGIN;

INSERT INTO public.authorization_capabilities (
  capability_key, domain, resource, action, sensitivity, scope_kind,
  approval_mode, separation_of_duties, state_requirements, legacy_operation_id
)
VALUES
  ('finance.journal.create_draft','finance','journal_entry','create_draft','financial','organization',
   'none',false,'{"creates_status":"draft"}'::jsonb,NULL),
  ('finance.journal.post','finance','journal_entry','post','financial','organization',
   'maker_checker',true,'{"required_status":"draft"}'::jsonb,NULL),
  ('finance.journal.reverse','finance','journal_entry','reverse','financial','organization',
   'maker_checker',true,'{"requires_posted_source_and_reason":true}'::jsonb,NULL)
ON CONFLICT (capability_key) DO NOTHING;

COMMIT;
